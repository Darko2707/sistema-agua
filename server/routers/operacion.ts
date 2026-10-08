import { z } from 'zod';
import { TRPCError } from '@trpc/server';
// Legacy operations in this router still share a transaction boundary directly.
// eslint-disable-next-line no-restricted-imports
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { router, authenticatedProcedure, protectedProcedure, roleProcedure } from '../trpc';
// eslint-disable-next-line no-restricted-imports
import { db } from '@/db';
// eslint-disable-next-line no-restricted-imports
import {
  auditoria,
  bitacoraCortes,
  consentimientosLegales,
  circuitos,
  cortes,
  fraccionamientos,
  notificaciones,
  pagos,
  perfilesResidente,
  asignacionesCircuito,
  fraccionamientoServicios,
  servicios,
} from '@/db/schema';
import { circuitoRepo, residenteRepo } from '@/src/infrastructure/db/repositories';
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';
import { schedulePushDispatch } from '@/lib/push-dispatcher';
import { clientIpFromHeaders } from '@/lib/request-security';
import { reversarPagoAtomico } from '@/src/infrastructure/db/services/drizzle-pago-reversal.service';

const LEGAL_VERSION = '2026-08-05';

function getRequestMeta(headers?: Headers) {
  const clientIp = headers ? clientIpFromHeaders(headers) : 'anonymous';
  return {
    ip: clientIp === 'anonymous' ? null : clientIp,
    userAgent: headers?.get('user-agent') ?? null,
  };
}

async function assertPerfilVisible(userId: string, role: string, perfilId: string) {
  const perfil = await residenteRepo.findById(perfilId);
  if (!perfil) throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado' });
  if (role === 'admin') return;
  if (role === 'residente') {
    if (perfil.userId !== userId) throw new TRPCError({ code: 'FORBIDDEN' });
    return;
  }

  if (role === 'representante') {
    const circuito = await circuitoRepo.findByRepresentante(userId);
    if (!circuito || perfil.circuitoId !== circuito.id) throw new TRPCError({ code: 'FORBIDDEN' });
    return;
  }

  if (role === 'tesorera') {
    const circuitos = await circuitoRepo.findAll();
    const circuito = circuitos.find(c => c.tesoreraId === userId);
    if (!circuito || perfil.circuitoId !== circuito.id) throw new TRPCError({ code: 'FORBIDDEN' });
    return;
  }

  if (role === 'cuadrilla_cortes') {
    if (!perfil.fraccionamientoId) throw new TRPCError({ code: 'FORBIDDEN' });
    const [assignment] = await db.select({ id: asignacionesCircuito.id })
      .from(asignacionesCircuito)
      .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, asignacionesCircuito.fraccionamientoServicioId))
      .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
      .where(and(
        eq(asignacionesCircuito.usuarioId, userId),
        eq(asignacionesCircuito.fraccionamientoId, perfil.fraccionamientoId),
        eq(asignacionesCircuito.rol, 'cuadrilla_cortes'),
        eq(asignacionesCircuito.activo, true),
        eq(fraccionamientoServicios.estado, 'activo'),
        eq(servicios.clave, 'agua'),
      )).limit(1);
    if (!assignment) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return;
  }
  throw new TRPCError({ code: 'FORBIDDEN' });
}

const auditoriaPublicColumns = {
  id:        auditoria.id,
  actorId:   auditoria.actorId,
  accion:    auditoria.accion,
  entidad:   auditoria.entidad,
  entidadId: auditoria.entidadId,
  detalle:   auditoria.detalle,
  creadoEn:  auditoria.creadoEn,
};

export const operacionRouter = router({
  aceptarLegales: authenticatedProcedure
    .input(z.object({
      privacidadVersion: z.literal(LEGAL_VERSION).default(LEGAL_VERSION),
      cookiesVersion:    z.literal(LEGAL_VERSION).default(LEGAL_VERSION),
      terminosVersion:   z.literal(LEGAL_VERSION).default(LEGAL_VERSION),
    }))
    .mutation(async ({ ctx, input }) => {
      const meta = getRequestMeta(ctx.headers);
      await db.transaction(async (tx) => {
        await tx.insert(consentimientosLegales).values({
          userId: ctx.user.id,
          privacidadVersion: input.privacidadVersion,
          cookiesVersion: input.cookiesVersion,
          terminosVersion: input.terminosVersion,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
        await tx.insert(auditoria).values({
          actorId: ctx.user.id,
          accion: 'legales.aceptados',
          entidad: 'user',
          entidadId: ctx.user.id,
          detalle: input,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
      });
      return { ok: true };
    }),

  miConsentimiento: protectedProcedure.query(async ({ ctx }) => {
    return db.query.consentimientosLegales.findFirst({
      where: eq(consentimientosLegales.userId, ctx.user.id),
      orderBy: [desc(consentimientosLegales.aceptadoEn)],
    });
  }),

  auditoria: roleProcedure('admin', 'representante')
    .input(z.object({
      entidad:   z.string().optional(),
      entidadId: z.string().optional(),
      limit:     z.number().int().min(1).max(200).default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      const entidad = input?.entidad;
      if (ctx.user.role !== 'admin' && entidad !== 'pago' && entidad !== 'corte') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo admin puede ver auditoria global' });
      }
      if (ctx.user.role === 'representante') {
        const entidadRepresentante: 'pago' | 'corte' = entidad === 'pago' ? 'pago' : 'corte';
        const circuito = await circuitoRepo.findByRepresentante(ctx.user.id);
        if (!circuito) return [];
        const pagoIds = entidadRepresentante === 'pago'
          ? await db.select({ id: pagos.id }).from(pagos).where(eq(pagos.circuitoId, circuito.id))
          : [];
        const corteIds = entidadRepresentante === 'corte'
          ? await db.select({ id: bitacoraCortes.corteId })
            .from(bitacoraCortes)
            .innerJoin(perfilesResidente, eq(perfilesResidente.id, bitacoraCortes.perfilId))
            .where(eq(perfilesResidente.circuitoId, circuito.id))
          : [];
        const ids = (entidadRepresentante === 'pago' ? pagoIds : corteIds)
          .map(row => row.id)
          .filter((id): id is string => Boolean(id));
        if (input?.entidadId && !ids.includes(input.entidadId)) throw new TRPCError({ code: 'FORBIDDEN' });
        if (ids.length === 0) return [];
        return db.select(auditoriaPublicColumns)
          .from(auditoria)
          .where(input?.entidadId
            ? and(eq(auditoria.entidad, entidadRepresentante), eq(auditoria.entidadId, input.entidadId))
            : and(eq(auditoria.entidad, entidadRepresentante), inArray(auditoria.entidadId, ids)))
          .orderBy(desc(auditoria.creadoEn))
          .limit(input?.limit ?? 50);
      }
      return db.select(auditoriaPublicColumns)
        .from(auditoria)
        .where(input?.entidad
          ? input.entidadId
            ? and(eq(auditoria.entidad, input.entidad), eq(auditoria.entidadId, input.entidadId))
            : eq(auditoria.entidad, input.entidad)
          : undefined)
        .orderBy(desc(auditoria.creadoEn))
        .limit(input?.limit ?? 50);
    }),

  resumenDeuda: protectedProcedure
    .input(z.object({ perfilId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const perfil = input?.perfilId
        ? await residenteRepo.findById(input.perfilId)
        : await residenteRepo.findByUserId(ctx.user.id);
      if (!perfil) throw new TRPCError({ code: 'NOT_FOUND', message: 'Perfil no encontrado' });
      if (input?.perfilId) await assertPerfilVisible(ctx.user.id, ctx.user.role, perfil.id);

      const periodo = PeriodoVO.vigente();
      const rows = await db.query.pagos.findMany({
        where: and(eq(pagos.perfilId, perfil.id), eq(pagos.estado, 'pagado')),
        orderBy: (p, { asc }) => [asc(p.anio), asc(p.mes)],
      });
      const paid = new Set(rows.map(p => `${p.anio}-${p.mes}`));
      const atrasados: Array<{ mes: number; anio: number }> = [];
      const adelantados: Array<{ mes: number; anio: number }> = [];
      const pagados = rows.map(p => ({ mes: p.mes, anio: p.anio, folio: p.folio, metodo: p.metodo, monto: p.monto }));

      for (let offset = -24; offset <= 12; offset++) {
        const total = periodo.mes - 1 + offset;
        const mes = (total % 12 + 12) % 12 + 1;
        const anio = periodo.anio + Math.floor(total / 12);
        const key = `${anio}-${mes}`;
        if (offset < 0 && !paid.has(key)) atrasados.push({ mes, anio });
        if (offset > 0 && paid.has(key)) adelantados.push({ mes, anio });
      }

      const circuito = perfil.circuitoId ? await circuitoRepo.findById(perfil.circuitoId) : null;
      const agua = residenteRepo.findWaterServiceConfig
        ? await residenteRepo.findWaterServiceConfig(perfil.id)
        : null;
      const saldoPendiente = atrasados.length * Number(agua?.montoMensual ?? circuito?.montoMensual ?? 0);
      return {
        perfilId: perfil.id,
        periodoActual: periodo,
        pagados,
        atrasados,
        adelantados,
        proximoMes: (() => {
          for (let offset = 0; offset < 36; offset++) {
            const total = periodo.mes - 1 + offset;
            const mes = (total % 12) + 1;
            const anio = periodo.anio + Math.floor(total / 12);
            if (!paid.has(`${anio}-${mes}`)) return { mes, anio };
          }
          return null;
        })(),
        saldoPendiente: saldoPendiente.toFixed(2),
      };
    }),

  reversarPago: roleProcedure('admin', 'representante', 'tesorera')
    .input(z.object({
      pagoId: z.string().uuid(),
      motivo: z.string().min(10, 'Explica el motivo del reverso'),
    }))
    .mutation(async ({ ctx, input }) => {
      const { notificarReverso } = await reversarPagoAtomico({
        pagoId: input.pagoId,
        motivo: input.motivo,
        actorId: ctx.user.id,
        actorRole: ctx.user.role,
      });
      if (notificarReverso) schedulePushDispatch();
      return { ok: true };
    }),

  bitacoraCorte: roleProcedure('admin', 'cuadrilla_cortes', 'representante')
    .input(z.object({ perfilId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertPerfilVisible(ctx.user.id, ctx.user.role, input.perfilId);
      return db.query.bitacoraCortes.findMany({
        where: eq(bitacoraCortes.perfilId, input.perfilId),
        orderBy: [desc(bitacoraCortes.creadoEn)],
      });
    }),

  agregarBitacoraCorte: roleProcedure('admin', 'cuadrilla_cortes')
    .input(z.object({
      perfilId: z.string().uuid(),
      corteId:  z.string().uuid().optional(),
      // Las confirmaciones solo pueden originarse en CorteOperacionService,
      // donde el cambio de estado y la bitacora comparten transaccion.
      accion:   z.enum(['nota', 'visita_sin_acceso']),
      nota:     z.string().min(3).max(500).optional(),
      fotoUrl:  z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const requestMeta = getRequestMeta(ctx.headers);
      return db.transaction(async (tx) => {
        const [perfil] = await tx.select({
          id: perfilesResidente.id,
          fraccionamientoId: perfilesResidente.fraccionamientoId,
          circuitoId: perfilesResidente.circuitoId,
        })
          .from(perfilesResidente)
          .where(eq(perfilesResidente.id, input.perfilId))
          .limit(1);
        if (!perfil) throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado' });
        if (ctx.user.role === 'cuadrilla_cortes') {
          if (
            !perfil.fraccionamientoId
            || perfil.fraccionamientoId !== ctx.user.fraccionamientoId
          ) {
            throw new TRPCError({ code: 'FORBIDDEN' });
          }
          const [assignment] = await tx.select({ id: asignacionesCircuito.id })
            .from(asignacionesCircuito)
            .innerJoin(
              fraccionamientoServicios,
              eq(fraccionamientoServicios.id, asignacionesCircuito.fraccionamientoServicioId),
            )
            .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
            .where(and(
              eq(asignacionesCircuito.usuarioId, ctx.user.id),
              eq(asignacionesCircuito.fraccionamientoId, perfil.fraccionamientoId),
              eq(asignacionesCircuito.rol, 'cuadrilla_cortes'),
              eq(asignacionesCircuito.activo, true),
              eq(fraccionamientoServicios.fraccionamientoId, perfil.fraccionamientoId),
              eq(fraccionamientoServicios.estado, 'activo'),
              eq(servicios.clave, 'agua'),
            ))
            .limit(1);
          if (!assignment) throw new TRPCError({ code: 'FORBIDDEN' });
        }

        if (input.corteId) {
          const [corte] = await tx.select({
            id: cortes.id,
            perfilId: cortes.perfilId,
            fraccionamientoId: perfilesResidente.fraccionamientoId,
          })
            .from(cortes)
            .innerJoin(perfilesResidente, eq(perfilesResidente.id, cortes.perfilId))
            .where(and(
              eq(cortes.id, input.corteId),
              eq(cortes.perfilId, input.perfilId),
            ))
            .limit(1);
          if (!corte || corte.fraccionamientoId !== perfil.fraccionamientoId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'El corte no pertenece al perfil indicado',
            });
          }
        }

        const [row] = await tx.insert(bitacoraCortes).values({
          perfilId: input.perfilId,
          corteId: input.corteId ?? null,
          actorId: ctx.user.id,
          accion: input.accion,
          nota: input.nota,
          fotoUrl: input.fotoUrl,
        }).returning();
        await tx.insert(auditoria).values({
          actorId: ctx.user.id,
          accion: `corte.${input.accion}`,
          entidad: 'corte',
          entidadId: input.corteId ?? input.perfilId,
          detalle: { perfilId: input.perfilId, nota: input.nota, fotoUrl: input.fotoUrl },
          ip: requestMeta.ip,
          userAgent: requestMeta.userAgent,
        });
        return row;
      });
    }),

  notificaciones: roleProcedure('admin', 'representante')
    .input(z.object({
      estado: z.enum(['pendiente', 'enviada', 'fallida']).optional(),
      limit:  z.number().int().min(1).max(200).default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      const estadoFilter = input?.estado ? eq(notificaciones.estado, input.estado) : undefined;
      let visibilityFilter = estadoFilter;

      if (ctx.user.role === 'representante') {
        const circuito = await circuitoRepo.findByRepresentante(ctx.user.id);
        if (!circuito) return [];
        visibilityFilter = and(
          estadoFilter,
          eq(perfilesResidente.circuitoId, circuito.id),
        );
      }

      // Never return Web Push endpoints/keys (stored in push_subscriptions) or
      // the legacy destination field. They are capability secrets.
      return db.select({
        id: notificaciones.id,
        tipo: notificaciones.tipo,
        canal: notificaciones.canal,
        estado: notificaciones.estado,
        creadoEn: notificaciones.creadoEn,
      })
        .from(notificaciones)
        .leftJoin(perfilesResidente, eq(perfilesResidente.id, notificaciones.perfilId))
        .where(visibilityFilter)
        .orderBy(desc(notificaciones.creadoEn))
        .limit(input?.limit ?? 50);
    }),

  exportacionCompleta: roleProcedure('admin').query(async () => {
    const [residentes, pagosRows, cortesRows, foliosRows, auditoriaRows] = await Promise.all([
      db.query.perfilesResidente.findMany({
        columns: {
          id: true,
          userId: true,
          fraccionamientoId: true,
          telefono: true,
          sexo: true,
          tenencia: true,
          circuitoId: true,
          edificio: true,
          departamento: true,
          nombrePropietario: true,
          telefonoPropietario: true,
          estadoAgua: true,
          creadoEn: true,
        },
        with: {
          usuario: {
            columns: {
              id: true,
              name: true,
              email: true,
              emailVerified: true,
              role: true,
              fraccionamientoId: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          circuito: {
            columns: {
              id: true,
              nombre: true,
              fraccionamientoId: true,
              representanteId: true,
              tesoreraId: true,
              montoMensual: true,
              montoReconexion: true,
              diaCorte: true,
              activo: true,
              updatedAt: true,
            },
          },
        },
      }),
      db.query.pagos.findMany({
        columns: {
          id: true,
          fraccionamientoId: true,
          perfilId: true,
          circuitoId: true,
          representanteId: true,
          mes: true,
          anio: true,
          monto: true,
          montoBase: true,
          iva: true,
          comisionMercadoPago: true,
          retencionIsr: true,
          retencionIva: true,
          montoNetoRepresentante: true,
          estado: true,
          metodo: true,
          folio: true,
          esReconexion: true,
          fechaPago: true,
          creadoEn: true,
        },
        orderBy: [desc(pagos.creadoEn)],
      }),
      db.query.cortes.findMany({
        columns: {
          id: true,
          perfilId: true,
          trabajadorId: true,
          motivo: true,
          activo: true,
          fechaCorte: true,
          fechaReconexion: true,
          reconectadoPor: true,
          updatedAt: true,
        },
      }),
      db.query.tickets.findMany({
        columns: {
          id: true,
          pagoId: true,
          cargoServicioId: true,
          tipo: true,
          folio: true,
          emitidoEn: true,
        },
      }),
      db.query.auditoria.findMany({
        columns: {
          id: true,
          actorId: true,
          accion: true,
          entidad: true,
          entidadId: true,
          detalle: true,
          creadoEn: true,
        },
        orderBy: [desc(auditoria.creadoEn)],
        limit: 500,
      }),
    ]);
    return {
      generadoEn: new Date().toISOString(),
      residentes,
      pagos: pagosRows,
      cortes: cortesRows,
      folios: foliosRows,
      auditoria: auditoriaRows,
    };
  }),

  dashboardEjecutivo: roleProcedure('admin', 'representante').query(async ({ ctx }) => {
    const periodo = PeriodoVO.vigente();
    const fraccionamientoId = ctx.user.role === 'representante' ? ctx.user.fraccionamientoId : null;
    if (ctx.user.role === 'representante' && !fraccionamientoId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes un fraccionamiento asignado' });
    }
    const fraccionamientoFilter = fraccionamientoId ? eq(perfilesResidente.fraccionamientoId, fraccionamientoId) : undefined;
    const pagoFraccionamientoFilter = fraccionamientoId ? eq(pagos.fraccionamientoId, fraccionamientoId) : undefined;

    const [residentesRow] = await db.select({ total: sql<number>`count(*)::int` }).from(perfilesResidente).where(fraccionamientoFilter);
    const [pagosRow] = await db.select({
      total: sql<number>`count(*)::int`,
      monto: sql<number>`coalesce(sum(${pagos.montoBase}::numeric), 0)::float`,
      efectivo: sql<number>`count(*) filter (where ${pagos.metodo} = 'efectivo')::int`,
      transferencia: sql<number>`count(*) filter (where ${pagos.metodo} = 'transferencia')::int`,
      mercadoPago: sql<number>`count(*) filter (where ${pagos.metodo} = 'mercado_pago')::int`,
    }).from(pagos).where(and(eq(pagos.estado, 'pagado'), eq(pagos.mes, periodo.mes), eq(pagos.anio, periodo.anio), pagoFraccionamientoFilter));
    const [cortesPendientes] = await db.select({ total: sql<number>`count(*)::int` }).from(perfilesResidente).where(and(eq(perfilesResidente.estadoAgua, 'pendiente_corte'), fraccionamientoFilter));
    const [reconexionesPendientes] = await db.select({ total: sql<number>`count(*)::int` }).from(perfilesResidente).where(and(eq(perfilesResidente.estadoAgua, 'pendiente_reconexion'), fraccionamientoFilter));
    const porFraccionamientoRows = ctx.user.role === 'admin'
      ? await db
        .select({
          fraccionamientoId: fraccionamientos.id,
          nombre: fraccionamientos.nombre,
          residentes: sql<number>`count(distinct ${perfilesResidente.id})::int`,
          pagosMes: sql<number>`count(${pagos.id})::int`,
          ingresosMes: sql<number>`coalesce(sum(${pagos.montoBase}::numeric), 0)::float`,
          efectivo: sql<number>`count(${pagos.id}) filter (where ${pagos.metodo} = 'efectivo')::int`,
          transferencia: sql<number>`count(${pagos.id}) filter (where ${pagos.metodo} = 'transferencia')::int`,
          mercadoPago: sql<number>`count(${pagos.id}) filter (where ${pagos.metodo} = 'mercado_pago')::int`,
          cortesPendientes: sql<number>`count(distinct ${perfilesResidente.id}) filter (where ${perfilesResidente.estadoAgua} = 'pendiente_corte')::int`,
          reconexionesPendientes: sql<number>`count(distinct ${perfilesResidente.id}) filter (where ${perfilesResidente.estadoAgua} = 'pendiente_reconexion')::int`,
        })
        .from(fraccionamientos)
        .leftJoin(perfilesResidente, eq(perfilesResidente.fraccionamientoId, fraccionamientos.id))
        .leftJoin(
          pagos,
          and(
            eq(pagos.perfilId, perfilesResidente.id),
            eq(pagos.fraccionamientoId, fraccionamientos.id),
            eq(pagos.estado, 'pagado'),
            eq(pagos.mes, periodo.mes),
            eq(pagos.anio, periodo.anio),
          ),
        )
        .where(eq(fraccionamientos.activo, true))
        .groupBy(fraccionamientos.id, fraccionamientos.nombre)
        .orderBy(fraccionamientos.nombre)
      : [];

    const totalResidentes = residentesRow?.total ?? 0;
    const totalPagos = pagosRow?.total ?? 0;
    return {
      periodo,
      ingresosMes: pagosRow?.monto ?? 0,
      residentesActivos: totalResidentes,
      pagosMes: totalPagos,
      morosidadPct: totalResidentes > 0 ? Math.round(((totalResidentes - totalPagos) / totalResidentes) * 100) : 0,
      pagosPorMetodo: {
        efectivo: pagosRow?.efectivo ?? 0,
        transferencia: pagosRow?.transferencia ?? 0,
        mercadoPago: pagosRow?.mercadoPago ?? 0,
      },
      cortesPendientes: cortesPendientes?.total ?? 0,
      reconexionesPendientes: reconexionesPendientes?.total ?? 0,
      porFraccionamiento: porFraccionamientoRows.map((row) => ({
        fraccionamientoId: row.fraccionamientoId,
        nombre: row.nombre,
        ingresosMes: row.ingresosMes ?? 0,
        residentesActivos: row.residentes ?? 0,
        pagosMes: row.pagosMes ?? 0,
        morosidadPct: (row.residentes ?? 0) > 0
          ? Math.round((((row.residentes ?? 0) - (row.pagosMes ?? 0)) / (row.residentes ?? 0)) * 100)
          : 0,
        cortesPendientes: row.cortesPendientes ?? 0,
        reconexionesPendientes: row.reconexionesPendientes ?? 0,
        pagosPorMetodo: {
          efectivo: row.efectivo ?? 0,
          transferencia: row.transferencia ?? 0,
          mercadoPago: row.mercadoPago ?? 0,
        },
      })),
    };
  }),
});
