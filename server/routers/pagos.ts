import { router, protectedProcedure, roleProcedure } from '../trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { residenteRepo, pagoRepo, circuitoRepo } from '@/src/infrastructure/db/repositories';
import { RegistrarPagoManualHandler } from '@/src/application/pagos/commands/registrar-pago-manual.handler';
import { HistorialPagosHandler } from '@/src/application/pagos/queries/historial-pagos.handler';
import { ResumenMesHandler } from '@/src/application/pagos/queries/resumen-mes.handler';
import { db } from '@/db';
import { pagos as pagosTable } from '@/db/schema';
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';
import { calcularDesglosePagoManual, calcularMontoBase } from '@/src/domain/pagos/calculator';
import { logger } from '@/lib/logger';

const registrarPagoManualHandler = new RegistrarPagoManualHandler({ residenteRepo, pagoRepo, circuitoRepo });
const historialPagosHandler = new HistorialPagosHandler({ pagoRepo, residenteRepo });
const resumenMesHandler = new ResumenMesHandler({ pagoRepo, residenteRepo, circuitoRepo });

export const pagosRouter = router({
  miHistorial: protectedProcedure.query(async ({ ctx }) => {
    return historialPagosHandler.execute({ perfilId: ctx.user.id });
  }),

  pagar: roleProcedure('residente')
    .input(z.object({ metodo: z.enum(['transferencia', 'efectivo']) }))
    .mutation(async ({ ctx, input }) => {
      // Solo residentes pueden registrar su propio pago
      const perfil = await residenteRepo.findByUserId(ctx.user.id);
      if (!perfil) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Completa tu perfil primero' });
      if (!perfil.circuito) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Circuito no encontrado' });
      if (!perfil.circuito.activo) throw new TRPCError({ code: 'FORBIDDEN', message: 'Tu circuito esta inhabilitado' });

      return registrarPagoManualHandler.execute({
        perfilId: perfil.id,
        metodo: input.metodo,
        representanteId: perfil.circuito.representanteId ?? ctx.user.id,
      });
    }),

  historialDe: roleProcedure('admin', 'representante')
    .input(z.object({ perfilId: z.uuid() }))
    .query(async ({ input }) => {
      return historialPagosHandler.executeByPerfilId(input.perfilId);
    }),

  registrarManual: roleProcedure('representante')
    .input(z.object({
      perfilId: z.uuid(),
      metodo:   z.enum(['efectivo', 'transferencia']),
    }))
    .mutation(async ({ ctx, input }) => {
      return registrarPagoManualHandler.execute({
        perfilId:        input.perfilId,
        metodo:          input.metodo,
        representanteId: ctx.user.id,
      });
    }),

  listarFolios: protectedProcedure.query(async ({ ctx }) => {
    const perfil = await residenteRepo.findByUserId(ctx.user.id);
    if (!perfil) throw new TRPCError({ code: 'NOT_FOUND', message: 'Perfil no encontrado' });

    const pagosList = await db.query.pagos.findMany({
      where: (p, { eq }) => eq(p.perfilId, perfil.id),
      with: {
        perfil: { with: { usuario: true, circuito: true } },
      },
      orderBy: (p, { desc }) => [desc(p.anio), desc(p.mes)],
    });

    return pagosList.map((p) => ({
      id:           p.id,
      folio:        p.folio,
      mes:          p.mes,
      anio:         p.anio,
      monto:        p.monto,
      estado:       p.estado,
      esReconexion: p.esReconexion,
      fechaPago:    p.fechaPago,
      circuito:     p.perfil?.circuito?.nombre || 'Sin circuito',
      residente:    p.perfil?.usuario?.name    || 'Sin nombre',
    }));
  }),

  resumenMes: roleProcedure('admin', 'representante').query(async ({ ctx }) => {
    const rol = (ctx.user as { role?: string }).role as 'admin' | 'representante';
    return resumenMesHandler.execute({ rol, userId: ctx.user.id });
  }),

  reportePagos: roleProcedure('representante').query(async ({ ctx }) => {
    const miCircuito = await circuitoRepo.findByRepresentante(ctx.user.id);
    if (!miCircuito) throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes un circuito asignado.' });

    return db.query.pagos.findMany({
      where: (p, { eq, and }) => and(eq(p.circuitoId, miCircuito.id), eq(p.estado, 'pagado')),
      with: { perfil: true },
      orderBy: (p, { desc }) => [desc(p.anio), desc(p.mes), desc(p.fechaPago)],
    });
  }),

  pagosPorCircuito: roleProcedure('representante', 'admin')
    .input(z.object({
      circuitoId: z.uuid().optional(),
      mes:        z.number().optional(),
      anio:       z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const periodo = PeriodoVO.vigente();
      const { mes, anio } = periodo;
      const mesFiltro  = input.mes  || mes;
      const anioFiltro = input.anio || anio;
      const rol = (ctx.user as { role?: string }).role;

      let targetCircuitoId = input.circuitoId;
      if (rol !== 'admin') {
        const miCircuito = await circuitoRepo.findByRepresentante(ctx.user.id);
        if (!miCircuito) throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes un circuito asignado.' });
        targetCircuitoId = miCircuito.id;
      } else if (!targetCircuitoId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El administrador debe proveer un circuitoId.' });
      }

      return db.query.pagos.findMany({
        where: (p, { eq, and }) =>
          and(eq(p.circuitoId, targetCircuitoId!), eq(p.mes, mesFiltro), eq(p.anio, anioFiltro), eq(p.estado, 'pagado')),
        with: { perfil: { with: { usuario: true } } },
        orderBy: (p, { desc }) => [desc(p.fechaPago)],
      });
    }),

  registrarRetroactivo: roleProcedure('admin')
    .input(z.object({
      perfilId: z.uuid(),
      meses:    z.array(z.object({
        mes:  z.number().int().min(1).max(12),
        anio: z.number().int().min(2020).max(2100),
      })).min(1).max(36),
      metodo: z.enum(['efectivo', 'transferencia']),
    }))
    .mutation(async ({ ctx, input }) => {
      const perfil = await residenteRepo.findById(input.perfilId);
      if (!perfil) throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado' });
      if (!perfil.circuitoId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'El residente no tiene circuito asignado' });

      const circuito = await circuitoRepo.findById(perfil.circuitoId);
      if (!circuito) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Circuito no encontrado' });

      const montoBase = calcularMontoBase(circuito.montoMensual, false, circuito.montoReconexion);
      const desglose  = calcularDesglosePagoManual(montoBase);

      const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      let registrados = 0;
      const omitidos: string[] = [];

      for (const { mes, anio } of input.meses) {
        const yaPago = await db.query.pagos.findFirst({
          where: (p, { eq, and }) =>
            and(eq(p.perfilId, perfil.id), eq(p.mes, mes), eq(p.anio, anio), eq(p.estado, 'pagado')),
        });
        if (yaPago) {
          omitidos.push(`${MESES_CORTO[mes - 1]} ${anio}`);
          continue;
        }

        await db.insert(pagosTable).values({
          perfilId:               perfil.id,
          circuitoId:             circuito.id,
          representanteId:        circuito.representanteId ?? null,
          mes,
          anio,
          monto:                  desglose.total,
          montoBase:              desglose.montoBase,
          iva:                    desglose.iva,
          comisionMercadoPago:    desglose.comisionMercadoPago,
          retencionIsr:           desglose.retencionIsr,
          retencionIva:           desglose.retencionIva,
          montoNetoRepresentante: desglose.montoNetoRepresentante,
          mercadoPagoCollectorId: circuito.mercadoPagoCollectorId,
          estado:                 'pagado',
          metodo:                 input.metodo,
          folio:                  null,
          esReconexion:           false,
          fechaPago:              new Date(),
        });
        registrados++;
      }

      logger.info('pago.retroactivo.admin.lote', {
        perfilId: perfil.id, adminId: ctx.user.id, registrados, omitidos: omitidos.length,
      });
      return { registrados, omitidos };
    }),
});
