import { randomUUID } from 'node:crypto';
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
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';
import {
  compararPeriodos,
  construirEstadoPagosTesorera,
  MAX_MESES_POR_PAGO_TESORERA,
  periodoDesdeFecha,
  periodoInicioCapturaTesorera,
  periodoKey,
} from '@/src/domain/pagos/periodos-tesoreria';
import { calcularDesglosePagoManual, calcularMontoBase } from '@/src/domain/pagos/calculator';
import { FolioVO } from '@/src/domain/pagos/folio.vo';
import { logger } from '@/lib/logger';
import { schedulePushDispatch } from '@/lib/push-dispatcher';

const resolverCircuitoTesoreraService = new ResolverCircuitoTesoreraService({ circuitoRepo, residenteRepo });

const registrarPagoManualHandler = new RegistrarPagoManualHandler({ residenteRepo, pagoRepo, circuitoRepo });
const historialPagosHandler = new HistorialPagosHandler({ pagoRepo, residenteRepo });
const resumenMesHandler = new ResumenMesHandler({ pagoRepo, residenteRepo, circuitoRepo });
const metricasAdminHandler = new MetricasAdminHandler({ pagoRepo });

const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const mesesTesoreraSchema = z.array(z.object({
  mes:  z.number().int().min(1).max(12),
  anio: z.number().int().min(2020).max(2100),
}).strict()).min(1).max(MAX_MESES_POR_PAGO_TESORERA).superRefine((periodos, ctx) => {
  const vistos = new Set<string>();
  for (const periodo of periodos) {
    const key = periodoKey(periodo);
    if (vistos.has(key)) {
      ctx.addIssue({
        code: 'custom',
        message: `El periodo ${key} esta repetido`,
      });
    }
    vistos.add(key);
  }
});

export const pagosRouter = router({
  miHistorial: protectedProcedure.query(async ({ ctx }) => {
    return historialPagosHandler.execute({ perfilId: ctx.user.id });
  }),

  historialDe: roleProcedure('admin', 'representante')
    .input(z.object({ perfilId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role === 'representante') {
        const miCircuito = await circuitoRepo.findByRepresentante(ctx.user.id);
        if (!miCircuito) throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes circuito asignado' });
        const perfil = await residenteRepo.findById(input.perfilId);
        if (!perfil || perfil.circuitoId !== miCircuito.id)
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes acceso a este residente' });
      }
      return historialPagosHandler.executeByPerfilId(input.perfilId);
    }),

  registrarManual: roleProcedure('representante')
    .input(z.object({
      perfilId: z.uuid(),
      metodo:   z.enum(['efectivo', 'transferencia']),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await registrarPagoManualHandler.execute({
        perfilId:        input.perfilId,
        metodo:          input.metodo,
        representanteId: ctx.user.id,
      });
      schedulePushDispatch();
      return result;
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
    const periodo = PeriodoVO.vigente();
    const periodoActual = { mes: periodo.mes, anio: periodo.anio };
    const circuito = await resolverCircuitoTesoreraService.execute(ctx.user.id);
    if (!circuito) return { circuito: null, periodoActual, residentes: [] };

    const perfiles = await db.query.perfilesResidente.findMany({
      where:  (p, { eq }) => eq(p.circuitoId, circuito.id),
      with: {
        usuario: true,
        pagos: {
          where: (pg, { eq }) => eq(pg.estado, 'pagado'),
          columns: { mes: true, anio: true },
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
      periodoActual,
      residentes: perfiles.map((p) => {
        const estadoPago = construirEstadoPagosTesorera({
          periodoActual,
          periodoInicio: periodoInicioCapturaTesorera(p.creadoEn, periodoActual),
          periodoInicioAdeudo: periodoDesdeFecha(p.creadoEn, periodoActual),
          periodosPagados: p.pagos,
        });
        const pagos = new Set(p.pagos.map(periodoKey));

        return {
          id:                  p.id,
          edificio:            p.edificio,
          departamento:        p.departamento,
          estadoAgua:          p.estadoAgua,
          usuario:             { id: p.usuario?.id, name: p.usuario?.name, email: p.usuario?.email },
          pagoEsteMes:         pagos.has(periodoKey(periodoActual)),
          tieneAtrasados:      estadoPago.atrasadosPendientes > 0,
          atrasadosPendientes: estadoPago.atrasadosPendientes,
          accionDisponible:    estadoPago.accionDisponible,
          periodos:            estadoPago.periodos,
        };
      }),
    };
  }),

  // ── Tesorera: registrar pago en efectivo / transferencia ────────────────────
  registrarManualTesorera: roleProcedure('tesorera')
    .input(z.object({
      perfilId: z.uuid(),
      metodo:   z.enum(['efectivo', 'transferencia']),
      meses:    mesesTesoreraSchema,
    }).strict())
    .mutation(async ({ ctx, input }) => {
      const circuito = await resolverCircuitoTesoreraService.execute(ctx.user.id);
      if (!circuito)        throw new TRPCError({ code: 'FORBIDDEN',   message: 'No tienes circuito asignado' });
      if (!circuito.activo) throw new TRPCError({ code: 'FORBIDDEN',   message: 'Tu circuito está inhabilitado' });

      const perfil = await residenteRepo.findById(input.perfilId);
      if (!perfil || perfil.circuitoId !== circuito.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado en tu circuito' });
      }

      const periodos = [...input.meses].sort(compararPeriodos);

      const esReconexion = perfil.estadoAgua === 'cortado';
      const loteId = randomUUID();
      const fechaPago = new Date();
      const pagosLote = periodos.map((periodo, index) => {
        const incluyeReconexion = index === 0 && esReconexion;
        const montoBase  = calcularMontoBase(circuito.montoMensual, incluyeReconexion, circuito.montoReconexion);
        const desglose   = calcularDesglosePagoManual(montoBase);
        return {
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
          estado:                 'pagado' as const,
          metodo:                 input.metodo,
          folio:                  FolioVO.generate().toString(),
          esReconexion:           incluyeReconexion,
          fechaPago,
        };
      });

      const batchResult = await pagoRepo.createManualBatchWithLock({
        perfilId: perfil.id,
        pagos: pagosLote,
        actualizarEstadoAgua: true,
        pushNotification: {
          userId: perfil.userId,
          perfilId: perfil.id,
          tipo: 'pago_confirmado',
          mensaje: 'Tu pago fue confirmado. Abre la app para consultar los folios y los detalles.',
          dedupeKey: `pago_confirmado:lote:${perfil.id}:${loteId}`,
        },
        auditoria: {
          actorId: ctx.user.id,
          accion: 'pago.manual.tesorera',
          metodo: input.metodo,
        },
        politica: { tipo: 'tesorera_escalonada' },
      });
      const folios = batchResult.pagos
        .map(pago => pago.folio)
        .filter((folio): folio is string => Boolean(folio));
      const omitidos = batchResult.omitidos
        .map(periodo => `${MESES_CORTO[periodo.mes - 1]} ${periodo.anio}`);
      const total = batchResult.pagos.reduce((sum, pago) => sum + Number(pago.monto), 0);

      if (folios.length === 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Los periodos seleccionados ya fueron pagados; actualiza la lista e intenta de nuevo',
        });
      }

      logger.info('pago.tesorera.manual', {
        folios, perfilId: perfil.id, tesoreraId: ctx.user.id, registrados: folios.length, omitidos: omitidos.length,
      });
      if (folios.length > 0) schedulePushDispatch();
      return {
        folio: folios[0],
        folios,
        registrados: folios.length,
        omitidos,
        monto: total.toFixed(2),
        metodo: input.metodo,
        periodos: periodos.map(p => `${MESES_CORTO[p.mes - 1]} ${p.anio}`),
      };
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

      const loteId = randomUUID();
      const fechaPago = new Date();
      const pagosLote = input.meses.map(({ mes, anio }) => {
        const montoBase = calcularMontoBase(circuito.montoMensual, false, circuito.montoReconexion);
        const desglose  = calcularDesglosePagoManual(montoBase);
        return {
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
          estado:                 'pagado' as const,
          metodo:                 input.metodo,
          folio:                  FolioVO.generate().toString(),
          esReconexion:           false,
          fechaPago,
        };
      });

      const batchResult = await pagoRepo.createManualBatchWithLock({
        perfilId: perfil.id,
        pagos: pagosLote,
        actualizarEstadoAgua: false,
        pushNotification: {
          userId: perfil.userId,
          perfilId: perfil.id,
          tipo: 'pago_confirmado',
          mensaje: 'Tu pago fue confirmado. Abre la app para consultar los folios y los detalles.',
          dedupeKey: `pago_confirmado:lote:${perfil.id}:${loteId}`,
        },
        auditoria: {
          actorId: ctx.user.id,
          accion: 'pago.retroactivo.admin',
          metodo: input.metodo,
        },
        politica: { tipo: 'admin_retroactivo' },
      });
      const registrados = batchResult.pagos.length;
      const omitidos = batchResult.omitidos
        .map(periodo => `${MESES_CORTO[periodo.mes - 1]} ${periodo.anio}`);

      logger.info('pago.retroactivo.admin.lote', {
        perfilId: perfil.id, adminId: ctx.user.id, registrados, omitidos: omitidos.length,
      });
      if (registrados > 0) schedulePushDispatch();
      return { registrados, omitidos };
    }),
});
