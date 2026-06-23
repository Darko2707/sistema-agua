import { router, protectedProcedure, roleProcedure } from '../trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { residenteRepo, pagoRepo, circuitoRepo } from '@/src/infrastructure/db/repositories';
import { RegistrarPagoManualHandler } from '@/src/application/pagos/commands/registrar-pago-manual.handler';
import { HistorialPagosHandler } from '@/src/application/pagos/queries/historial-pagos.handler';
import { ResumenMesHandler } from '@/src/application/pagos/queries/resumen-mes.handler';
import { db } from '@/db';
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';

const registrarPagoManualHandler = new RegistrarPagoManualHandler({ residenteRepo, pagoRepo, circuitoRepo });
const historialPagosHandler = new HistorialPagosHandler({ pagoRepo, residenteRepo });
const resumenMesHandler = new ResumenMesHandler({ pagoRepo, residenteRepo, circuitoRepo });

export const pagosRouter = router({
  miHistorial: protectedProcedure.query(async ({ ctx }) => {
    return historialPagosHandler.execute({ perfilId: ctx.user.id });
  }),

  pagar: protectedProcedure
    .input(z.object({ metodo: z.enum(['transferencia', 'efectivo']) }))
    .mutation(async ({ ctx, input }) => {
      // Pago propio del residente via transferencia/efectivo (no MP)
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
});
