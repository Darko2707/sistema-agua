import { randomUUID } from 'node:crypto';
import { router, protectedProcedure, roleProcedure, operationalRoleProcedure } from '../trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { residenteRepo, pagoRepo } from '@/src/infrastructure/db/repositories';
import { RegistrarPagoManualHandler } from '@/src/application/pagos/commands/registrar-pago-manual.handler';
import { HistorialPagosHandler } from '@/src/application/pagos/queries/historial-pagos.handler';
import { ResumenMesHandler } from '@/src/application/pagos/queries/resumen-mes.handler';
import { MetricasAdminHandler } from '@/src/application/pagos/queries/metricas-admin.handler';
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
import { subscriptionService } from '@/src/infrastructure/db/services/subscription.service';
import { logger } from '@/lib/logger';
import { schedulePushDispatch } from '@/lib/push-dispatcher';

const registrarPagoManualHandler = new RegistrarPagoManualHandler({ residenteRepo, pagoRepo });
const historialPagosHandler = new HistorialPagosHandler({ pagoRepo, residenteRepo });
const resumenMesHandler = new ResumenMesHandler({ pagoRepo, residenteRepo });
const metricasAdminHandler = new MetricasAdminHandler({ pagoRepo });

function scheduleTransferPushDispatch(event: 'approved' | 'rejected', comprobanteId: string) {
  try {
    schedulePushDispatch();
  } catch (error) {
    // Payment/review state is already committed; dispatch failure must not
    // report a false mutation failure or invite a duplicate approval attempt.
    logger.warn('comprobante_transferencia.push_dispatch_skipped', {
      event,
      comprobanteId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

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
    const base = await historialPagosHandler.execute({ perfilId: ctx.user.id });
    if (!base.pagos.length) return base;

    // Enrich: attach comprobante data (monto total, concepto, url) to payments made by transfer
    const pagoIds = base.pagos.map(p => p.id);
    const comprobantes = await pagoRepo.enrichComprobantesByPagoIds(pagoIds);

    const comprobanteMap = new Map(comprobantes.map(c => [c.pagoId, c]));
    return {
      ...base,
      pagos: base.pagos.map(p => {
        const comp = comprobanteMap.get(p.id);
        if (!comp) return p;
        return {
          ...p,
          montoTotalEfectivo: comp.monto,
          desgloseConceptos: comp.concepto,
          comprobanteUrl: comp.comprobanteUrl,
          comprobanteId: comp.id,
        };
      }),
    };
  }),

  historialDe: roleProcedure('admin', 'representante', 'tesorera')
    .input(z.object({ perfilId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role === 'representante' || ctx.user.role === 'tesorera') {
        if (!ctx.user.fraccionamientoId) throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes fraccionamiento asignado' });
        const perfil = await residenteRepo.findById(input.perfilId);
        if (!perfil || perfil.fraccionamientoId !== ctx.user.fraccionamientoId)
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes acceso a este residente' });
      }
      const pagosHistorial = await historialPagosHandler.executeByPerfilId(input.perfilId);
      if (!Array.isArray(pagosHistorial) || pagosHistorial.length === 0) return pagosHistorial;

      const pagoIds = pagosHistorial.map(p => p.id);
      const comprobantes = await pagoRepo.enrichComprobantesByPagoIds(pagoIds);

      const comprobanteMap = new Map(comprobantes.map(c => [c.pagoId, c]));
      return pagosHistorial.map(p => {
        const comp = comprobanteMap.get(p.id);
        if (!comp) return p;
        return {
          ...p,
          montoTotalEfectivo: comp.monto,
          desgloseConceptos: comp.concepto,
          comprobanteUrl: comp.comprobanteUrl,
          comprobanteId: comp.id,
        };
      });
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
      const fraccionamiento = await pagoRepo.findFraccionamientoForCobroRepresentante(
        ctx.user.fraccionamientoId,
        ctx.user.id,
      );
      if (!fraccionamiento) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Tu fraccionamiento no esta disponible para cobros' });
      }
      const metodoPago = await pagoRepo.findMetodoPagoMercadoPago(ctx.user.fraccionamientoId);
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
    return pagoRepo.findFoliosByPerfilUserId(ctx.user.id);
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

    return pagoRepo.findPagosForReporteRepresentante(ctx.user.fraccionamientoId);
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

      return pagoRepo.findPagosByFraccionamientoAndPeriodo(
        targetFraccionamientoId!,
        mesFiltro,
        anioFiltro,
      );
    }),

  // ── Tesorera: listar residentes del circuito para registrar pagos ──────────
  listarResidentesParaPago: roleProcedure('tesorera').query(async ({ ctx }) => {
    const periodo = PeriodoVO.vigente();
    const periodoActual = { mes: periodo.mes, anio: periodo.anio };
    if (!ctx.user.fraccionamientoId) return { fraccionamiento: null, periodoActual, residentes: [] };
    const { fraccionamiento, perfiles, cargosPendientes } = await pagoRepo.findResidentesParaPagoTesorera(
      ctx.user.fraccionamientoId,
      ctx.user.id,
    );
    if (!fraccionamiento) return { fraccionamiento: null, periodoActual, residentes: [] };

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
      const fraccionamiento = await pagoRepo.findFraccionamientoForCobroTesorera(
        ctx.user.fraccionamientoId,
        ctx.user.id,
      );
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
      const cargosServiciosPagados = await pagoRepo.registrarCargosObligatoriosManuales({
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
      const fraccionamiento = await pagoRepo.findFraccionamientoForCobro(perfil.fraccionamientoId);
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
      comprobanteUrl: z.string().trim().min(1).max(5_000_000), // Soporta proxy URLs cortas y Data URLs base64 de respaldo (≤ 4 MB)
      metadatos: z.object({
        meses: z.array(z.object({ mes: z.number().int().min(1).max(12), anio: z.number().int().min(2020).max(2100) })).optional(),
        cargosServicioIds: z.array(z.string().uuid()).optional(),
        servicios: z.array(z.object({
          fraccionamientoServicioId: z.string().uuid(),
          periodos: z.array(z.object({ mes: z.number().int().min(1).max(12), anio: z.number().int().min(2020).max(2100) })).min(1).max(36),
        })).max(20).optional(),
        esReconexion: z.boolean().optional(),
        notas: z.string().max(500).optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const perfil = await residenteRepo.findByUserId(ctx.user.id);
      if (!perfil) throw new TRPCError({ code: 'NOT_FOUND', message: 'Perfil no encontrado' });
      if (!perfil.fraccionamientoId) throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes fraccionamiento asignado' });
      if (perfil.tenencia === 'inquilino' || (perfil as { tipoOcupante?: string | null }).tipoOcupante === 'inquilino') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Los inquilinos solo pueden consultar recibos; los pagos debe realizarlos el propietario.',
        });
      }

      // Verificar si alguno de los meses o servicios solicitados ya está en un comprobante pendiente
      const periodosSolicitados = input.metadatos?.meses ?? [];
      const cargosSolicitados = input.metadatos?.cargosServicioIds ?? [];
      const serviciosSolicitados = input.metadatos?.servicios ?? [];
      if (periodosSolicitados.length === 0 && cargosSolicitados.length === 0 && serviciosSolicitados.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'El comprobante debe incluir al menos un periodo de mantenimiento de bomba o un cargo de servicio pendiente.',
        });
      }
      if (new Set(cargosSolicitados).size !== cargosSolicitados.length
        || new Set(periodosSolicitados.map(({ mes, anio }) => `${anio}-${mes}`)).size !== periodosSolicitados.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El comprobante contiene periodos o cargos duplicados.' });
      }
      const clavesServicio = serviciosSolicitados.flatMap(servicio => servicio.periodos.map(periodo =>
        `${servicio.fraccionamientoServicioId}:${periodo.anio}-${periodo.mes}`));
      if (new Set(clavesServicio).size !== clavesServicio.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El comprobante contiene periodos de servicio duplicados.' });
      }

      const creado = await pagoRepo.crearComprobanteTransferencia({
        perfilId: perfil.id,
        fraccionamientoId: perfil.fraccionamientoId,
        monto: input.monto.toFixed(2),
        concepto: input.concepto,
        comprobanteUrl: input.comprobanteUrl,
        metadatos: input.metadatos ?? null,
        periodosSolicitados,
        cargosSolicitados,
        serviciosSolicitados,
      });

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
      return pagoRepo.findComprobantePendiente(perfil.id, perfil.fraccionamientoId);
    }),

  // ── Residente: consultar todos sus comprobantes en revisión ─────────────────
  misComprobantesPendientes: protectedProcedure
    .query(async ({ ctx }) => {
      const perfil = await residenteRepo.findByUserId(ctx.user.id);
      if (!perfil?.fraccionamientoId) return [];
      return pagoRepo.findComprobantesPendientesDeResidente(perfil.id, perfil.fraccionamientoId);
    }),

  // ── Tesorería: listar comprobantes pendientes ─────────────────────────────
  obtenerComprobantesPendientes: operationalRoleProcedure('tesorera', 'admin')
    .query(async ({ ctx }) => {
      if (!ctx.user.fraccionamientoId) return [];
      return pagoRepo.findComprobantesPendientesDeFraccionamiento(ctx.user.fraccionamientoId);
    }),

  // ── Tesorería: listar todos los comprobantes (con filtro de estado) ─────────
  obtenerTodosComprobantes: operationalRoleProcedure('tesorera', 'admin')
    .input(z.object({
      estado: z.enum(['todos', 'pendiente_validacion', 'aprobado', 'rechazado']).default('todos'),
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.fraccionamientoId) return [];
      return pagoRepo.findTodosComprobantesDeFraccionamiento(ctx.user.fraccionamientoId, input.estado);
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
      if (!ctx.user.fraccionamientoId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sin fraccionamiento asignado' });
      }

      try {
        // 1. Obtener y verificar el comprobante (consultas sin transacción externa para evitar deadlock en Neon max:1)
        const comprobante = await pagoRepo.findComprobanteForAprobacion(
          input.comprobanteId,
          ctx.user.fraccionamientoId,
        );

        if (!comprobante) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Comprobante no encontrado o ya procesado' });
        }

        const perfil = await residenteRepo.findById(comprobante.perfilId as string);
        if (!perfil) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado' });
        }
        if (perfil.fraccionamientoId !== ctx.user.fraccionamientoId || (comprobante.fraccionamientoId as string) !== perfil.fraccionamientoId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'El comprobante y el residente no pertenecen a tu fraccionamiento' });
        }

        const fraccionamiento = await pagoRepo.findFraccionamientoForCobro(ctx.user.fraccionamientoId);
        if (!fraccionamiento) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Fraccionamiento no disponible' });
        }

        // 2. Extraer metadatos de forma segura (sin depender de lectura de archivos en disco)
        let metadatos: {
          meses?: Array<{ mes: number; anio: number }>;
          esReconexion?: boolean;
          cargosServicioIds?: string[];
        } = {};
        if (comprobante.metadatos && typeof comprobante.metadatos === 'object') {
          metadatos = comprobante.metadatos as typeof metadatos;
        } else if (typeof comprobante.metadatos === 'string') {
          try {
            metadatos = JSON.parse(comprobante.metadatos);
          } catch {
            metadatos = {};
          }
        }

        // Determinar meses a registrar (del input o de los metadatos)
        const mesesInput = input.meses ?? metadatos.meses;
        const cargosIds = metadatos.cargosServicioIds ?? [];
        if (input.meses) {
          const storedPeriods = new Set((metadatos.meses ?? []).map(periodoKey));
          const requestedPeriods = new Set(input.meses.map(periodoKey));
          if (storedPeriods.size !== requestedPeriods.size
            || [...storedPeriods].some(periodo => !requestedPeriods.has(periodo))) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Los periodos aprobados deben coincidir con los incluidos en el comprobante.' });
          }
        }
        if ((!mesesInput || mesesInput.length === 0) && cargosIds.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'El comprobante no contiene periodos ni cargos por acreditar. Solicita al residente que lo envíe de nuevo.',
          });
        }

        let pagoId: string | null = null;
        let comprobanteAprobadoEnTransaccion = false;
        if (mesesInput && mesesInput.length > 0) {
          const servicioAgua = residenteRepo.findWaterServiceConfig
            ? await residenteRepo.findWaterServiceConfig(perfil.id)
            : null;
          const esReconexion = metadatos.esReconexion ?? false;
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

          // createManualBatchWithLock maneja su propia transacción atómica internamente
          try {
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
              aprobarComprobante: {
                comprobanteId: input.comprobanteId,
                fraccionamientoId: ctx.user.fraccionamientoId,
                revisadoPor: ctx.user.id,
                meses: mesesInput,
                cargoServicioIds: cargosIds,
              },
            });
            pagoId = batchResult.pagos[0]?.id ?? null;
            comprobanteAprobadoEnTransaccion = true;
            if (batchResult.pagos.length > 0) {
              scheduleTransferPushDispatch('approved', input.comprobanteId);
            }
          } catch (batchErr) {
            logger.warn('comprobante_transferencia.batch_aviso', {
              comprobanteId: input.comprobanteId,
              error: batchErr instanceof Error ? batchErr.message : String(batchErr),
            });
            if (batchErr instanceof TRPCError) throw batchErr;
            throw new TRPCError({
              code: 'CONFLICT',
              message: batchErr instanceof Error ? batchErr.message : 'No se pudo registrar el lote de pago',
            });
          }
        }

        // Transferencias solo de servicios usan la misma transacción que cargos, tickets y auditoría.
        if (!comprobanteAprobadoEnTransaccion) {
          const batchResult = await pagoRepo.createManualBatchWithLock({
            perfilId: perfil.id,
            pagos: [],
            actualizarEstadoAgua: false,
            pushNotification: {
              userId: perfil.userId, perfilId: perfil.id, tipo: 'pago_confirmado',
              mensaje: 'Tu transferencia fue verificada y tu pago confirmado. Abre la app para ver los detalles.',
              dedupeKey: `pago_transferencia_confirmado:${perfil.id}:${input.comprobanteId}`,
            },
            auditoria: { actorId: ctx.user.id, accion: 'pago.transferencia.aprobado', metodo: 'transferencia' },
            politica: { tipo: 'admin_retroactivo' },
            aprobarComprobante: {
              comprobanteId: input.comprobanteId,
              fraccionamientoId: ctx.user.fraccionamientoId,
              revisadoPor: ctx.user.id,
              meses: [],
              cargoServicioIds: cargosIds,
            },
          });
          pagoId = batchResult.pagos[0]?.id ?? null;
          comprobanteAprobadoEnTransaccion = true;
          scheduleTransferPushDispatch('approved', input.comprobanteId);
        }

        logger.info('comprobante_transferencia.aprobado', { id: input.comprobanteId, pagoId, tesoreraId: ctx.user.id });
        return { ok: true, pagoId };
      } catch (err) {
        logger.error('comprobante_transferencia.aprobar_error', err, {
          comprobanteId: input.comprobanteId,
          tesoreraId: ctx.user.id,
        });
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : 'Error al aprobar el comprobante',
        });
      }
    }),

  // ── Tesorería: rechazar comprobante ──────────────────────────────────────
  rechazarComprobante: operationalRoleProcedure('tesorera', 'admin')
    .input(z.object({
      comprobanteId: z.string().uuid(),
      motivoRechazo: z.string().trim().min(5, 'El motivo debe tener al menos 5 caracteres').max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.fraccionamientoId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sin fraccionamiento asignado' });
      }

      try {
        const comprobante = await pagoRepo.findComprobanteForRechazo(
          input.comprobanteId,
          ctx.user.fraccionamientoId,
        );

        if (!comprobante) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Comprobante no encontrado o ya procesado' });
        }

        const perfil = await residenteRepo.findById(comprobante.perfilId);
        if (!perfil || perfil.fraccionamientoId !== ctx.user.fraccionamientoId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'El residente no pertenece a tu fraccionamiento' });
        }

        await pagoRepo.rechazarComprobante({
          comprobanteId: input.comprobanteId,
          fraccionamientoId: ctx.user.fraccionamientoId,
          motivoRechazo: input.motivoRechazo,
          revisadoPor: ctx.user.id,
          perfilId: comprobante.perfilId,
        });

        if (perfil) {
          scheduleTransferPushDispatch('rejected', input.comprobanteId);
        }

        logger.info('comprobante_transferencia.rechazado', { id: input.comprobanteId, tesoreraId: ctx.user.id });
        return { ok: true };
      } catch (err) {
        logger.error('comprobante_transferencia.rechazar_error', err, {
          comprobanteId: input.comprobanteId,
          tesoreraId: ctx.user.id,
        });
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : 'Error al rechazar el comprobante',
        });
      }
    }),
});
