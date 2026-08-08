import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { router, protectedProcedure, roleProcedure } from '../trpc';
import { db } from '@/db';
import {
  auditoria,
  bitacoraCortes,
  consentimientosLegales,
  notificaciones,
  pagos,
  perfilesResidente,
  reversosPago,
  tickets,
} from '@/db/schema';
import { circuitoRepo, residenteRepo } from '@/src/infrastructure/db/repositories';
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';

const LEGAL_VERSION = '2026-08-05';

function getRequestMeta(headers?: Headers) {
  return {
    ip: headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ?? headers?.get('x-real-ip') ?? null,
    userAgent: headers?.get('user-agent') ?? null,
  };
}

async function assertPerfilVisible(userId: string, role: string, perfilId: string) {
  if (role === 'admin') return;

  const perfil = await residenteRepo.findById(perfilId);
  if (!perfil) throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado' });

  if (role === 'representante') {
    const circuito = await circuitoRepo.findByRepresentante(userId);
    if (!circuito || perfil.circuitoId !== circuito.id) throw new TRPCError({ code: 'FORBIDDEN' });
  }

  if (role === 'tesorera') {
    const circuitos = await circuitoRepo.findAll();
    const circuito = circuitos.find(c => c.tesoreraId === userId);
    if (!circuito || perfil.circuitoId !== circuito.id) throw new TRPCError({ code: 'FORBIDDEN' });
  }
}

async function registrarAuditoria(input: {
  actorId: string;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  detalle?: Record<string, unknown>;
  headers?: Headers;
}) {
  const meta = getRequestMeta(input.headers);
  await db.insert(auditoria).values({
    actorId: input.actorId,
    accion: input.accion,
    entidad: input.entidad,
    entidadId: input.entidadId ?? null,
    detalle: input.detalle,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

export const operacionRouter = router({
  aceptarLegales: protectedProcedure
    .input(z.object({
      privacidadVersion: z.string().default(LEGAL_VERSION),
      cookiesVersion:    z.string().default(LEGAL_VERSION),
      terminosVersion:   z.string().default(LEGAL_VERSION),
    }))
    .mutation(async ({ ctx, input }) => {
      const meta = getRequestMeta();
      await db.insert(consentimientosLegales).values({
        userId: ctx.user.id,
        privacidadVersion: input.privacidadVersion,
        cookiesVersion: input.cookiesVersion,
        terminosVersion: input.terminosVersion,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      await registrarAuditoria({
        actorId: ctx.user.id,
        accion: 'legales.aceptados',
        entidad: 'user',
        entidadId: ctx.user.id,
        detalle: input,
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
      if (ctx.user.role !== 'admin' && input?.entidad !== 'pago' && input?.entidad !== 'corte') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo admin puede ver auditoria global' });
      }
      return db.query.auditoria.findMany({
        where: input?.entidad
          ? input.entidadId
            ? and(eq(auditoria.entidad, input.entidad), eq(auditoria.entidadId, input.entidadId))
            : eq(auditoria.entidad, input.entidad)
          : undefined,
        orderBy: [desc(auditoria.creadoEn)],
        limit: input?.limit ?? 50,
      });
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
      const saldoPendiente = atrasados.length * Number(circuito?.montoMensual ?? 0);
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
      const pago = await db.query.pagos.findFirst({ where: eq(pagos.id, input.pagoId), with: { perfil: true } });
      if (!pago) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pago no encontrado' });
      await assertPerfilVisible(ctx.user.id, ctx.user.role, pago.perfilId);
      if (pago.estado !== 'pagado') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Solo se pueden reversar pagos pagados' });

      await db.transaction(async (tx) => {
        await tx.update(pagos).set({ estado: 'vencido' }).where(eq(pagos.id, pago.id));
        await tx.insert(reversosPago).values({
          pagoId: pago.id,
          actorId: ctx.user.id,
          motivo: input.motivo,
          estadoAnterior: pago.estado ?? 'pagado',
        });
        await tx.delete(tickets).where(eq(tickets.pagoId, pago.id));
      });
      await registrarAuditoria({
        actorId: ctx.user.id,
        accion: 'pago.reversado',
        entidad: 'pago',
        entidadId: pago.id,
        detalle: { folio: pago.folio, motivo: input.motivo, mes: pago.mes, anio: pago.anio },
      });
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
      accion:   z.enum(['nota', 'corte_confirmado', 'reconexion_confirmada', 'visita_sin_acceso']),
      nota:     z.string().min(3).max(500).optional(),
      fotoUrl:  z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db.insert(bitacoraCortes).values({
        perfilId: input.perfilId,
        corteId: input.corteId ?? null,
        actorId: ctx.user.id,
        accion: input.accion,
        nota: input.nota,
        fotoUrl: input.fotoUrl,
      }).returning();
      await registrarAuditoria({
        actorId: ctx.user.id,
        accion: `corte.${input.accion}`,
        entidad: 'corte',
        entidadId: input.corteId ?? input.perfilId,
        detalle: { perfilId: input.perfilId, nota: input.nota, fotoUrl: input.fotoUrl },
      });
      return row;
    }),

  notificaciones: roleProcedure('admin', 'representante')
    .input(z.object({
      estado: z.enum(['pendiente', 'enviada', 'fallida']).optional(),
      limit:  z.number().int().min(1).max(200).default(50),
    }).optional())
    .query(async ({ input }) => {
      return db.query.notificaciones.findMany({
        where: input?.estado ? eq(notificaciones.estado, input.estado) : undefined,
        orderBy: [desc(notificaciones.creadoEn)],
        limit: input?.limit ?? 50,
      });
    }),

  exportacionCompleta: roleProcedure('admin').query(async () => {
    const [residentes, pagosRows, cortesRows, foliosRows, auditoriaRows] = await Promise.all([
      db.query.perfilesResidente.findMany({ with: { usuario: true, circuito: true } }),
      db.query.pagos.findMany({ orderBy: [desc(pagos.creadoEn)] }),
      db.query.cortes.findMany(),
      db.query.tickets.findMany(),
      db.query.auditoria.findMany({ orderBy: [desc(auditoria.creadoEn)], limit: 500 }),
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
    const circuito = ctx.user.role === 'representante' ? await circuitoRepo.findByRepresentante(ctx.user.id) : null;
    const circuitoFilter = circuito ? eq(perfilesResidente.circuitoId, circuito.id) : undefined;

    const [residentesRow] = await db.select({ total: sql<number>`count(*)::int` }).from(perfilesResidente).where(circuitoFilter);
    const [pagosRow] = await db.select({
      total: sql<number>`count(*)::int`,
      monto: sql<number>`coalesce(sum(${pagos.montoBase}::numeric), 0)::float`,
      efectivo: sql<number>`count(*) filter (where ${pagos.metodo} = 'efectivo')::int`,
      transferencia: sql<number>`count(*) filter (where ${pagos.metodo} = 'transferencia')::int`,
      mercadoPago: sql<number>`count(*) filter (where ${pagos.metodo} = 'mercado_pago')::int`,
    }).from(pagos).where(and(eq(pagos.estado, 'pagado'), eq(pagos.mes, periodo.mes), eq(pagos.anio, periodo.anio)));
    const [cortesPendientes] = await db.select({ total: sql<number>`count(*)::int` }).from(perfilesResidente).where(eq(perfilesResidente.estadoAgua, 'pendiente_corte'));
    const [reconexionesPendientes] = await db.select({ total: sql<number>`count(*)::int` }).from(perfilesResidente).where(eq(perfilesResidente.estadoAgua, 'pendiente_reconexion'));

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
    };
  }),
});
