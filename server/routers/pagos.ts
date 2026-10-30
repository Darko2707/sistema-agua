import { randomUUID } from 'node:crypto';
import { router, protectedProcedure, roleProcedure, operationalRoleProcedure } from '../trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import { residenteRepo, pagoRepo } from '@/src/infrastructure/db/repositories';
import { RegistrarPagoManualHandler } from '@/src/application/pagos/commands/registrar-pago-manual.handler';
import { HistorialPagosHandler } from '@/src/application/pagos/queries/historial-pagos.handler';
import { ResumenMesHandler } from '@/src/application/pagos/queries/resumen-mes.handler';
import { MetricasAdminHandler } from '@/src/application/pagos/queries/metricas-admin.handler';
// eslint-disable-next-line no-restricted-imports -- inline MP webhook queries not yet in a repo
import { db } from '@/db';
import {
  auditoria,
  cargosServicios,
  comprobantesTransferencia,
  fraccionamientoServicios,
  fraccionamientos,
  perfilesResidente,
  servicios,
  user,
} from '@/db/schema';
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';
import {
  compararPeriodos,
  construirEstadoPagosTesorera,
  MAX_MESES_POR_PAGO_TESORERA,
  periodoDesdeFecha,
  periodoInicioCapturaTesorera,
  periodoKey,
} from '@/src/domain/pagos/periodos-tesoreria';
import { calcularDesgloseServicio, calcularMontoServicio } from '@/src/domain/pagos/calculator';
import { FolioVO } from '@/src/domain/pagos/folio.vo';
import { generarFolioServicio } from '@/src/domain/pagos/folio.vo';
import { subscriptionService } from '@/src/infrastructure/db/services/subscription.service';
import { logger } from '@/lib/logger';
import { schedulePushDispatch } from '@/lib/push-dispatcher';

const registrarPagoManualHandler = new RegistrarPagoManualHandler({ residenteRepo, pagoRepo });
const historialPagosHandler = new HistorialPagosHandler({ pagoRepo, residenteRepo });
const resumenMesHandler = new ResumenMesHandler({ pagoRepo, residenteRepo });
const metricasAdminHandler = new MetricasAdminHandler({ pagoRepo });

const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

async function registrarCargosObligatoriosManuales(input: {
  perfilId: string;
  fraccionamientoId: string;
  cargoIds: string[];
  metodo: 'efectivo' | 'transferencia';
  actorId: string;
}) {
  const cargoIds = [...new Set(input.cargoIds)];
  if (cargoIds.length === 0) return { cargos: 0, monto: 0 };

  return db.transaction(async (tx) => {
    const pendientes = await tx.select({
      id: cargosServicios.id,
      monto: cargosServicios.monto,
      servicio: servicios.nombre,
    }).from(cargosServicios)
      .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, cargosServicios.fraccionamientoServicioId))
      .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
      .where(and(
        eq(cargosServicios.perfilId, input.perfilId),
        eq(cargosServicios.fraccionamientoId, input.fraccionamientoId),
        eq(cargosServicios.estado, 'pendiente'),
        ne(servicios.clave, 'agua'),
        inArray(cargosServicios.id, cargoIds),
      ));
    if (pendientes.length !== cargoIds.length) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Uno o más servicios ya no están disponibles; actualiza la lista' });
    }

    let monto = 0;
    let cargos = 0;
    for (const cargo of pendientes) {
      const folio = generarFolioServicio();
      const [updated] = await tx.update(cargosServicios).set({
        estado: 'pagado',
        metodo: input.metodo,
        folio,
        pagadoEn: new Date(),
      }).where(and(eq(cargosServicios.id, cargo.id), eq(cargosServicios.estado, 'pendiente')))
        .returning({ id: cargosServicios.id });
      if (!updated) continue;
      cargos += 1;
      monto += Number(cargo.monto);
      await tx.insert(auditoria).values({
        actorId: input.actorId,
        accion: 'servicio.cargo.pagado_manual_combinado',
        entidad: 'cargos_servicios',
        entidadId: cargo.id,
        detalle: { perfilId: input.perfilId, fraccionamientoId: input.fraccionamientoId, metodo: input.metodo, folio, servicio: cargo.servicio },
      });
    }
    return { cargos, monto };
  });
}

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
        if (!ctx.user.fraccionamientoId) throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes fraccionamiento asignado' });
        const perfil = await residenteRepo.findById(input.perfilId);
        if (!perfil || perfil.fraccionamientoId !== ctx.user.fraccionamientoId)
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes acceso a este residente' });
      }
      return historialPagosHandler.executeByPerfilId(input.perfilId);
    }),

  registrarManual: operationalRoleProcedure('representante')
    .input(z.object({
      perfilId: z.uuid(),
      metodo:   z.enum(['efectivo', 'transferencia']),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.fraccionamientoId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes fraccionamiento asignado' });
      }
      const fraccionamiento = await db.query.fraccionamientos.findFirst({
        where: (f, { and, eq }) => and(
          eq(f.id, ctx.user.fraccionamientoId!),
          eq(f.representanteId, ctx.user.id),
          eq(f.activo, true),
        ),
        columns: { montoMensual: true, montoReconexion: true },
      });
      if (!fraccionamiento) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Tu fraccionamiento no esta disponible para cobros' });
      }
      const metodoPago = await db.query.fraccionamientoMetodosPago.findFirst({
        where: (m, { and, eq }) => and(
          eq(m.fraccionamientoId, ctx.user.fraccionamientoId!),
          eq(m.proveedor, 'mercado_pago'),
          eq(m.activo, true),
        ),
        columns: { collectorId: true },
      });
      const result = await registrarPagoManualHandler.execute({
        perfilId:        input.perfilId,
        metodo:          input.metodo,
        representanteId: ctx.user.id,
        fraccionamientoId: ctx.user.fraccionamientoId,
        montoMensual: fraccionamiento.montoMensual,
        montoReconexion: fraccionamiento.montoReconexion,
        mercadoPagoCollectorId: metodoPago?.collectorId ?? null,
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
        perfil: { with: { usuario: true, fraccionamiento: true } },
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
      fraccionamiento: p.perfil?.fraccionamiento?.nombre || 'Sin fraccionamiento',
      residente:    p.perfil?.usuario?.name    || 'Sin nombre',
    }));
  }),

  resumenMes: roleProcedure('admin', 'representante').query(async ({ ctx }) => {
    return resumenMesHandler.execute({
      rol: ctx.user.role as 'admin' | 'representante',
      userId: ctx.user.id,
      fraccionamientoId: ctx.user.fraccionamientoId,
    });
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
    if (!ctx.user.fraccionamientoId) throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes un fraccionamiento asignado.' });

    return db.query.pagos.findMany({
      where: (p, { eq, and }) => and(eq(p.fraccionamientoId, ctx.user.fraccionamientoId!), eq(p.estado, 'pagado')),
      with: { perfil: true },
      orderBy: (p, { desc }) => [desc(p.anio), desc(p.mes), desc(p.fechaPago)],
    });
  }),

  pagosPorFraccionamiento: roleProcedure('representante', 'admin')
    .input(z.object({
      fraccionamientoId: z.uuid().optional(),
      mes:        z.number().optional(),
      anio:       z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const periodo = PeriodoVO.vigente();
      const { mes, anio } = periodo;
      const mesFiltro  = input.mes  || mes;
      const anioFiltro = input.anio || anio;
      let targetFraccionamientoId = input.fraccionamientoId;
      if (ctx.user.role !== 'admin') {
        if (!ctx.user.fraccionamientoId) throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes un fraccionamiento asignado.' });
        targetFraccionamientoId = ctx.user.fraccionamientoId;
      } else if (!targetFraccionamientoId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El administrador debe proveer un fraccionamientoId.' });
      }

      return db.query.pagos.findMany({
        where: (p, { eq, and }) =>
          and(eq(p.fraccionamientoId, targetFraccionamientoId!), eq(p.mes, mesFiltro), eq(p.anio, anioFiltro), eq(p.estado, 'pagado')),
        with: { perfil: { with: { usuario: true } } },
        orderBy: (p, { desc }) => [desc(p.fechaPago)],
      });
    }),

  // ── Tesorera: listar residentes del circuito para registrar pagos ──────────
  listarResidentesParaPago: roleProcedure('tesorera').query(async ({ ctx }) => {
    const periodo = PeriodoVO.vigente();
    const periodoActual = { mes: periodo.mes, anio: periodo.anio };
    if (!ctx.user.fraccionamientoId) return { fraccionamiento: null, periodoActual, residentes: [] };
    const fraccionamiento = await db.query.fraccionamientos.findFirst({
      where: (f, { and, eq }) => and(
        eq(f.id, ctx.user.fraccionamientoId!),
        eq(f.tesoreraId, ctx.user.id),
        eq(f.activo, true),
      ),
      columns: { id: true, nombre: true, montoMensual: true, montoReconexion: true, representanteId: true },
    });
    if (!fraccionamiento) return { fraccionamiento: null, periodoActual, residentes: [] };

    const perfiles = await db.query.perfilesResidente.findMany({
      where:  (p, { eq }) => eq(p.fraccionamientoId, ctx.user.fraccionamientoId!),
      with: {
        usuario: true,
        pagos: {
          where: (pg, { eq }) => eq(pg.estado, 'pagado'),
          columns: { mes: true, anio: true },
        },
      },
    });
    const cargosPendientes = await db.select({
      id: cargosServicios.id,
      perfilId: cargosServicios.perfilId,
      mes: cargosServicios.mes,
      anio: cargosServicios.anio,
      monto: cargosServicios.monto,
      servicio: servicios.nombre,
    }).from(cargosServicios)
      .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, cargosServicios.fraccionamientoServicioId))
      .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
      .where(and(
        eq(cargosServicios.fraccionamientoId, ctx.user.fraccionamientoId),
        eq(cargosServicios.estado, 'pendiente'),
        ne(servicios.clave, 'agua'),
      ));

    return {
      fraccionamiento: {
        id:               fraccionamiento.id,
        nombre:           fraccionamiento.nombre,
        montoMensual:     fraccionamiento.montoMensual,
        montoReconexion:  fraccionamiento.montoReconexion,
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
          cargosPendientes: cargosPendientes
            .filter((cargo) => cargo.perfilId === p.id)
            .map((cargo) => ({
              id: cargo.id,
              mes: cargo.mes,
              anio: cargo.anio,
              monto: Number(cargo.monto),
              servicio: cargo.servicio,
            })),
        };
      }),
    };
  }),

  // ── Tesorera: registrar pago en efectivo / transferencia ────────────────────
  registrarManualTesorera: operationalRoleProcedure('tesorera')
    .input(z.object({
      perfilId: z.uuid(),
      metodo:   z.enum(['efectivo', 'transferencia']),
      meses:    mesesTesoreraSchema,
      cargoIds: z.array(z.uuid()).max(50).default([]),
    }).strict())
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.fraccionamientoId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes fraccionamiento asignado' });
      }
      const fraccionamiento = await db.query.fraccionamientos.findFirst({
        where: (f, { and, eq }) => and(eq(f.id, ctx.user.fraccionamientoId!), eq(f.tesoreraId, ctx.user.id), eq(f.activo, true)),
        columns: { montoMensual: true, montoReconexion: true, representanteId: true },
      });
      if (!fraccionamiento) throw new TRPCError({ code: 'FORBIDDEN', message: 'Tu fraccionamiento no esta disponible para cobros' });

      const perfil = await residenteRepo.findById(input.perfilId);
      if (!perfil || perfil.fraccionamientoId !== ctx.user.fraccionamientoId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado en tu fraccionamiento' });
      }

      const periodos = [...input.meses].sort(compararPeriodos);

      const esReconexion = perfil.estadoAgua === 'cortado';
      const servicioAgua = residenteRepo.findWaterServiceConfig
        ? await residenteRepo.findWaterServiceConfig(perfil.id)
        : null;
      const loteId = randomUUID();
      const fechaPago = new Date();
      const pagosLote = periodos.map((periodo, index) => {
        const incluyeReconexion = index === 0 && esReconexion;
        const montoBase  = calcularMontoServicio(servicioAgua ?? { montoMensual: fraccionamiento.montoMensual, montoReconexion: fraccionamiento.montoReconexion, conCorteFisico: true }, { incluyeReconexion });
        const desglose   = calcularDesgloseServicio(montoBase, 'manual');
        return {
          perfilId:               perfil.id,
          fraccionamientoId:      perfil.fraccionamientoId ?? undefined,
          representanteId:        fraccionamiento.representanteId ?? null,
          mes:                    periodo.mes,
          anio:                   periodo.anio,
          monto:                  desglose.total,
          montoBase:              desglose.montoBase,
          iva:                    desglose.iva,
          comisionMercadoPago:    desglose.comisionMercadoPago,
          retencionIsr:           desglose.retencionIsr,
          retencionIva:           desglose.retencionIva,
          montoNetoRepresentante: desglose.montoNetoRepresentante,
          mercadoPagoCollectorId: null,
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
      const cargosServiciosPagados = await registrarCargosObligatoriosManuales({
        perfilId: perfil.id,
        fraccionamientoId: ctx.user.fraccionamientoId,
        cargoIds: input.cargoIds,
        metodo: input.metodo,
        actorId: ctx.user.id,
      });
      const folios = batchResult.pagos
        .map(pago => pago.folio)
        .filter((folio): folio is string => Boolean(folio));
      const omitidos = batchResult.omitidos
        .map(periodo => `${MESES_CORTO[periodo.mes - 1]} ${periodo.anio}`);
      const total = batchResult.pagos.reduce((sum, pago) => sum + Number(pago.monto), 0)
        + cargosServiciosPagados.monto;

      if (folios.length === 0 && cargosServiciosPagados.cargos === 0) {
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
        cargosServiciosPagados: cargosServiciosPagados.cargos,
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
      if (!perfil.fraccionamientoId) throw new TRPCError({ code: 'FORBIDDEN', message: 'El residente no tiene fraccionamiento asignado' });
      await subscriptionService.requireOperational(perfil.fraccionamientoId);
      const fraccionamiento = await db.query.fraccionamientos.findFirst({
        where: (f, { and, eq }) => and(eq(f.id, perfil.fraccionamientoId!), eq(f.activo, true)),
        columns: { montoMensual: true, montoReconexion: true, representanteId: true },
      });
      if (!fraccionamiento) throw new TRPCError({ code: 'FORBIDDEN', message: 'El fraccionamiento no esta disponible para cobros' });
      const servicioAgua = residenteRepo.findWaterServiceConfig
        ? await residenteRepo.findWaterServiceConfig(perfil.id)
        : null;

      const loteId = randomUUID();
      const fechaPago = new Date();
      const pagosLote = input.meses.map(({ mes, anio }) => {
        const montoBase = calcularMontoServicio(servicioAgua ?? { montoMensual: fraccionamiento.montoMensual, montoReconexion: fraccionamiento.montoReconexion, conCorteFisico: true });
        const desglose  = calcularDesgloseServicio(montoBase, 'manual');
        return {
          perfilId:               perfil.id,
          fraccionamientoId:      perfil.fraccionamientoId ?? undefined,
          representanteId:        fraccionamiento.representanteId ?? null,
          mes,
          anio,
          monto:                  desglose.total,
          montoBase:              desglose.montoBase,
          iva:                    desglose.iva,
          comisionMercadoPago:    desglose.comisionMercadoPago,
          retencionIsr:           desglose.retencionIsr,
          retencionIva:           desglose.retencionIva,
          montoNetoRepresentante: desglose.montoNetoRepresentante,
          mercadoPagoCollectorId: null,
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

  // ── Residente: registrar comprobante de transferencia ─────────────────────
  registrarComprobanteTransferencia: protectedProcedure
    .input(z.object({
      monto:         z.number().positive(),
      concepto:      z.string().trim().min(1).max(500),
      comprobanteUrl: z.string().trim().min(1).max(2000),
      metadatos: z.object({
        meses: z.array(z.object({ mes: z.number().int().min(1).max(12), anio: z.number().int().min(2020).max(2100) })).optional(),
        cargosServicioIds: z.array(z.string().uuid()).optional(),
        esReconexion: z.boolean().optional(),
        notas: z.string().max(500).optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const perfil = await residenteRepo.findByUserId(ctx.user.id);
      if (!perfil) throw new TRPCError({ code: 'NOT_FOUND', message: 'Perfil no encontrado' });
      if (!perfil.fraccionamientoId) throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes fraccionamiento asignado' });

      // Verificar si ya tiene un comprobante pendiente
      const [existente] = await db
        .select({ id: comprobantesTransferencia.id })
        .from(comprobantesTransferencia)
        .where(and(
          eq(comprobantesTransferencia.perfilId, perfil.id),
          eq(comprobantesTransferencia.fraccionamientoId, perfil.fraccionamientoId),
          eq(comprobantesTransferencia.estado, 'pendiente_validacion'),
        ))
        .limit(1);

      if (existente) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Ya tienes un comprobante en revisión. Espera la confirmación de tu tesorera antes de enviar otro.',
        });
      }

      const [creado] = await db.insert(comprobantesTransferencia).values({
        perfilId:          perfil.id,
        fraccionamientoId: perfil.fraccionamientoId,
        monto:             input.monto.toFixed(2),
        concepto:          input.concepto,
        comprobanteUrl:    input.comprobanteUrl,
        estado:            'pendiente_validacion',
        metadatos:         input.metadatos ?? null,
      }).returning({ id: comprobantesTransferencia.id });

      logger.info('comprobante_transferencia.creado', {
        id: creado?.id,
        perfilId: perfil.id,
        fraccionamientoId: perfil.fraccionamientoId,
        monto: input.monto,
      });

      return { ok: true, id: creado?.id };
    }),

  // ── Residente: consultar si tiene un comprobante pendiente ─────────────────
  miComprobantePendiente: protectedProcedure
    .query(async ({ ctx }) => {
      const perfil = await residenteRepo.findByUserId(ctx.user.id);
      if (!perfil?.fraccionamientoId) return null;

      const [comprobante] = await db
        .select({
          id:             comprobantesTransferencia.id,
          estado:         comprobantesTransferencia.estado,
          monto:          comprobantesTransferencia.monto,
          concepto:       comprobantesTransferencia.concepto,
          fechaEmision:   comprobantesTransferencia.fechaEmision,
          motivoRechazo:  comprobantesTransferencia.motivoRechazo,
        })
        .from(comprobantesTransferencia)
        .where(and(
          eq(comprobantesTransferencia.perfilId, perfil.id),
          eq(comprobantesTransferencia.fraccionamientoId, perfil.fraccionamientoId),
        ))
        .orderBy(desc(comprobantesTransferencia.creadoEn))
        .limit(1);

      return comprobante ?? null;
    }),

  // ── Tesorería: listar comprobantes pendientes ─────────────────────────────
  obtenerComprobantesPendientes: operationalRoleProcedure('tesorera', 'admin')
    .query(async ({ ctx }) => {
      if (!ctx.user.fraccionamientoId) return [];

      const comprobantes = await db
        .select({
          id:             comprobantesTransferencia.id,
          estado:         comprobantesTransferencia.estado,
          monto:          comprobantesTransferencia.monto,
          concepto:       comprobantesTransferencia.concepto,
          comprobanteUrl: comprobantesTransferencia.comprobanteUrl,
          fechaEmision:   comprobantesTransferencia.fechaEmision,
          motivoRechazo:  comprobantesTransferencia.motivoRechazo,
          metadatos:      comprobantesTransferencia.metadatos,
          perfilId:       comprobantesTransferencia.perfilId,
          residenteNombre: user.name,
          residenteEmail:  user.email,
          edificio:        perfilesResidente.edificio,
          departamento:    perfilesResidente.departamento,
        })
        .from(comprobantesTransferencia)
        .innerJoin(perfilesResidente, eq(perfilesResidente.id, comprobantesTransferencia.perfilId))
        .innerJoin(user, eq(user.id, perfilesResidente.userId))
        .where(and(
          eq(comprobantesTransferencia.fraccionamientoId, ctx.user.fraccionamientoId),
          eq(comprobantesTransferencia.estado, 'pendiente_validacion'),
        ))
        .orderBy(desc(comprobantesTransferencia.creadoEn));

      return comprobantes;
    }),

  // ── Tesorería: aprobar comprobante ────────────────────────────────────────
  aprobarComprobante: operationalRoleProcedure('tesorera', 'admin')
    .input(z.object({
      comprobanteId: z.string().uuid(),
      meses: z.array(z.object({
        mes:  z.number().int().min(1).max(12),
        anio: z.number().int().min(2020).max(2100),
      })).min(1).max(36).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.fraccionamientoId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sin fraccionamiento asignado' });

      return db.transaction(async (tx) => {
        // Lock del comprobante
        const [comprobante] = await tx
          .select()
          .from(comprobantesTransferencia)
          .where(and(
            eq(comprobantesTransferencia.id, input.comprobanteId),
            eq(comprobantesTransferencia.fraccionamientoId, ctx.user.fraccionamientoId!),
            eq(comprobantesTransferencia.estado, 'pendiente_validacion'),
          ))
          .limit(1);

        if (!comprobante) throw new TRPCError({ code: 'NOT_FOUND', message: 'Comprobante no encontrado o ya procesado' });

        const perfil = await residenteRepo.findById(comprobante.perfilId);
        if (!perfil) throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado' });

        const fraccionamiento = await tx.query.fraccionamientos.findFirst({
          where: (f, { and, eq }) => and(eq(f.id, ctx.user.fraccionamientoId!), eq(f.activo, true)),
          columns: { montoMensual: true, montoReconexion: true, representanteId: true },
        });
        if (!fraccionamiento) throw new TRPCError({ code: 'FORBIDDEN', message: 'Fraccionamiento no disponible' });

        // Determinar meses a registrar (del metadato del comprobante o del input)
        const mesesInput = input.meses ?? (comprobante.metadatos as { meses?: Array<{mes:number;anio:number}> } | null)?.meses;

        let pagoId: string | null = null;
        if (mesesInput && mesesInput.length > 0) {
          const servicioAgua = residenteRepo.findWaterServiceConfig
            ? await residenteRepo.findWaterServiceConfig(perfil.id)
            : null;
          const esReconexion = (comprobante.metadatos as { esReconexion?: boolean } | null)?.esReconexion ?? false;
          const loteId = randomUUID();
          const fechaPago = new Date();

          const pagosLote = mesesInput.map((periodo, index) => {
            const incluyeReconexion = index === 0 && esReconexion;
            const montoBase = calcularMontoServicio(
              servicioAgua ?? { montoMensual: fraccionamiento.montoMensual, montoReconexion: fraccionamiento.montoReconexion, conCorteFisico: true },
              { incluyeReconexion },
            );
            const desglose = calcularDesgloseServicio(montoBase, 'manual');
            return {
              perfilId:               perfil.id,
              fraccionamientoId:      perfil.fraccionamientoId ?? undefined,
              representanteId:        fraccionamiento.representanteId ?? null,
              mes:                    periodo.mes,
              anio:                   periodo.anio,
              monto:                  desglose.total,
              montoBase:              desglose.montoBase,
              iva:                    desglose.iva,
              comisionMercadoPago:    desglose.comisionMercadoPago,
              retencionIsr:           desglose.retencionIsr,
              retencionIva:           desglose.retencionIva,
              montoNetoRepresentante: desglose.montoNetoRepresentante,
              mercadoPagoCollectorId: null,
              estado:                 'pagado' as const,
              metodo:                 'transferencia' as const,
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
              mensaje: 'Tu transferencia fue verificada y tu pago confirmado. Abre la app para ver los detalles.',
              dedupeKey: `pago_transferencia_confirmado:${perfil.id}:${loteId}`,
            },
            auditoria: {
              actorId: ctx.user.id,
              accion: 'pago.transferencia.aprobado',
              metodo: 'transferencia',
            },
            politica: { tipo: 'tesorera_escalonada' },
          });
          pagoId = batchResult.pagos[0]?.id ?? null;
          if (batchResult.pagos.length > 0) schedulePushDispatch();
        }

        // Marcar comprobante como aprobado
        await tx.update(comprobantesTransferencia).set({
          estado:        'aprobado',
          fechaRevision: new Date(),
          revisadoPor:   ctx.user.id,
          pagoId,
          actualizadoEn: new Date(),
        }).where(eq(comprobantesTransferencia.id, input.comprobanteId));

        await tx.insert(auditoria).values({
          actorId:   ctx.user.id,
          accion:    'comprobante_transferencia.aprobado',
          entidad:   'comprobantes_transferencia',
          entidadId: input.comprobanteId,
          detalle:   { perfilId: perfil.id, pagoId, meses: mesesInput },
        });

        logger.info('comprobante_transferencia.aprobado', { id: input.comprobanteId, pagoId, tesoreraId: ctx.user.id });
        return { ok: true, pagoId };
      });
    }),

  // ── Tesorería: rechazar comprobante ──────────────────────────────────────
  rechazarComprobante: operationalRoleProcedure('tesorera', 'admin')
    .input(z.object({
      comprobanteId: z.string().uuid(),
      motivoRechazo: z.string().trim().min(5, 'El motivo debe tener al menos 5 caracteres').max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.fraccionamientoId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sin fraccionamiento asignado' });

      const [comprobante] = await db
        .select({ id: comprobantesTransferencia.id, perfilId: comprobantesTransferencia.perfilId })
        .from(comprobantesTransferencia)
        .where(and(
          eq(comprobantesTransferencia.id, input.comprobanteId),
          eq(comprobantesTransferencia.fraccionamientoId, ctx.user.fraccionamientoId),
          eq(comprobantesTransferencia.estado, 'pendiente_validacion'),
        ))
        .limit(1);

      if (!comprobante) throw new TRPCError({ code: 'NOT_FOUND', message: 'Comprobante no encontrado o ya procesado' });

      const perfil = await residenteRepo.findById(comprobante.perfilId);

      await db.update(comprobantesTransferencia).set({
        estado:        'rechazado',
        motivoRechazo: input.motivoRechazo,
        fechaRevision: new Date(),
        revisadoPor:   ctx.user.id,
        actualizadoEn: new Date(),
      }).where(eq(comprobantesTransferencia.id, input.comprobanteId));

      if (perfil) {
        schedulePushDispatch();
      }

      await db.insert(auditoria).values({
        actorId:   ctx.user.id,
        accion:    'comprobante_transferencia.rechazado',
        entidad:   'comprobantes_transferencia',
        entidadId: input.comprobanteId,
        detalle:   { perfilId: comprobante.perfilId, motivo: input.motivoRechazo },
      });

      logger.info('comprobante_transferencia.rechazado', { id: input.comprobanteId, tesoreraId: ctx.user.id });
      return { ok: true };
    }),
});
