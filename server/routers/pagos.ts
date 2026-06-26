import { router, protectedProcedure, roleProcedure } from '../trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { residenteRepo, pagoRepo, circuitoRepo } from '@/src/infrastructure/db/repositories';
import { RegistrarPagoManualHandler } from '@/src/application/pagos/commands/registrar-pago-manual.handler';
import { HistorialPagosHandler } from '@/src/application/pagos/queries/historial-pagos.handler';
import { ResumenMesHandler } from '@/src/application/pagos/queries/resumen-mes.handler';
import { MetricasAdminHandler } from '@/src/application/pagos/queries/metricas-admin.handler';
import { ResolverCircuitoTesoreraService } from '@/src/application/circuitos/queries/resolver-circuito-tesorera.service';
// eslint-disable-next-line no-restricted-imports -- inline MP webhook queries not yet in a repo
import { db } from '@/db';
// eslint-disable-next-line no-restricted-imports -- inline MP webhook queries not yet in a repo
import { pagos as pagosTable } from '@/db/schema';
// eslint-disable-next-line no-restricted-imports -- inline MP webhook queries not yet in a repo
import { eq } from 'drizzle-orm';
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';
import { calcularDesglosePagoManual, calcularMontoBase } from '@/src/domain/pagos/calculator';
import { FolioVO } from '@/src/domain/pagos/folio.vo';
import { logger } from '@/lib/logger';

const resolverCircuitoTesoreraService = new ResolverCircuitoTesoreraService({ circuitoRepo, residenteRepo });

const registrarPagoManualHandler = new RegistrarPagoManualHandler({ residenteRepo, pagoRepo, circuitoRepo });
const historialPagosHandler = new HistorialPagosHandler({ pagoRepo, residenteRepo });
const resumenMesHandler = new ResumenMesHandler({ pagoRepo, residenteRepo, circuitoRepo });
const metricasAdminHandler = new MetricasAdminHandler({ pagoRepo });

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
    return resumenMesHandler.execute({ rol: ctx.user.role as 'admin' | 'representante', userId: ctx.user.id });
  }),

  metricasAdmin: roleProcedure('admin')
    .input(z.object({
      mes:  z.number().int().min(1).max(12).optional(),
      anio: z.number().int().min(2020).max(2100).optional(),
    }))
    .query(async ({ input }) => {
      const ahora = new Date();
      const mes  = input.mes  ?? ahora.getMonth() + 1;
      const anio = input.anio ?? ahora.getFullYear();
      return metricasAdminHandler.execute(mes, anio);
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
      let targetCircuitoId = input.circuitoId;
      if (ctx.user.role !== 'admin') {
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

  // ── Tesorera: listar residentes del circuito para registrar pagos ──────────
  listarResidentesParaPago: roleProcedure('tesorera').query(async ({ ctx }) => {
    const circuito = await resolverCircuitoTesoreraService.execute(ctx.user.id);
    if (!circuito) return { circuito: null, residentes: [] };

    const periodo  = PeriodoVO.vigente();
    const perfiles = await db.query.perfilesResidente.findMany({
      where:  (p, { eq }) => eq(p.circuitoId, circuito.id),
      with: {
        usuario: true,
        pagos: {
          where: (pg, { eq, and }) =>
            and(eq(pg.mes, periodo.mes), eq(pg.anio, periodo.anio), eq(pg.estado, 'pagado')),
        },
      },
    });

    return {
      circuito: {
        id:               circuito.id,
        nombre:           circuito.nombre,
        montoMensual:     circuito.montoMensual,
        montoReconexion:  circuito.montoReconexion,
      },
      residentes: perfiles.map(p => ({
        id:           p.id,
        edificio:     p.edificio,
        departamento: p.departamento,
        estadoAgua:   p.estadoAgua,
        usuario:      { id: p.usuario?.id, name: p.usuario?.name, email: p.usuario?.email },
        pagoEsteMes:  p.pagos.length > 0,
      })),
    };
  }),

  // ── Tesorera: registrar pago en efectivo / transferencia ────────────────────
  registrarManualTesorera: roleProcedure('tesorera')
    .input(z.object({
      perfilId: z.uuid(),
      metodo:   z.enum(['efectivo', 'transferencia']),
    }))
    .mutation(async ({ ctx, input }) => {
      const circuito = await resolverCircuitoTesoreraService.execute(ctx.user.id);
      if (!circuito)        throw new TRPCError({ code: 'FORBIDDEN',   message: 'No tienes circuito asignado' });
      if (!circuito.activo) throw new TRPCError({ code: 'FORBIDDEN',   message: 'Tu circuito está inhabilitado' });

      const perfil = await residenteRepo.findById(input.perfilId);
      if (!perfil || perfil.circuitoId !== circuito.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado en tu circuito' });
      }

      const periodo    = PeriodoVO.vigente();
      const esReconexion = perfil.estadoAgua === 'cortado';
      const montoBase  = calcularMontoBase(circuito.montoMensual, esReconexion, circuito.montoReconexion);
      const desglose   = calcularDesglosePagoManual(montoBase);
      const folio      = FolioVO.generate().toString();

      await pagoRepo.createWithLock(perfil.id, {
        perfilId:               perfil.id,
        circuitoId:             circuito.id,
        representanteId:        circuito.representanteId ?? null,
        mes:                    periodo.mes,
        anio:                   periodo.anio,
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
        folio,
        esReconexion,
        fechaPago:              new Date(),
      });

      logger.info('pago.tesorera.manual', { folio, perfilId: perfil.id, tesoreraId: ctx.user.id });
      return { folio, monto: desglose.total, metodo: input.metodo };
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
