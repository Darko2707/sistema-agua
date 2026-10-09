/* eslint-disable no-restricted-imports -- legacy router boundary; migrate queries to repositories incrementally. */
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { auditoria, cargosServicios, fraccionamientos, fraccionamientoServicios, perfilesResidente, perfilesServicios, servicios, tickets } from '@/db/schema';
import { subscriptionService } from '@/src/infrastructure/db/services/subscription.service';
import { generateMonthlyServiceCharges } from '@/src/infrastructure/db/services/service-charge.service';
import { residenteRepo } from '@/src/infrastructure/db/repositories';
import { router, roleProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { generarFolioServicio } from '@/src/domain/pagos/folio.vo';

const tenantInput = z.object({ fraccionamientoId: z.string().uuid() });

export const serviciosRouter = router({
  catalogo: roleProcedure('admin', 'representante', 'tesorera', 'cuadrilla_cortes', 'operador_pozo', 'residente')
    .query(async () => db.query.servicios.findMany({ where: (s, { eq }) => eq(s.activo, true) })),

  misServicios: roleProcedure('residente').query(async ({ ctx }) => {
    if (!ctx.user.fraccionamientoId) return [];
    // Los servicios no son optativos: el administrador los activa para todo
    // el fraccionamiento. Esta consulta no depende de una suscripción elegida
    // por el residente.
    return db
      .select({
        id: fraccionamientoServicios.id,
        fraccionamientoServicioId: fraccionamientoServicios.id,
        servicioId: servicios.id,
        clave: servicios.clave,
        nombre: servicios.nombre,
        montoMensual: fraccionamientoServicios.montoMensual,
      })
      .from(fraccionamientoServicios)
      .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
      .where(and(
        eq(fraccionamientoServicios.fraccionamientoId, ctx.user.fraccionamientoId),
        eq(fraccionamientoServicios.estado, 'activo'),
        eq(servicios.activo, true),
      ));
  }),

  listarTenant: roleProcedure('admin')
    .input(tenantInput)
    .query(async ({ input }) => db
      .select({
        id: fraccionamientoServicios.id,
        servicioId: servicios.id,
        clave: servicios.clave,
        nombre: servicios.nombre,
        estado: fraccionamientoServicios.estado,
        montoMensual: fraccionamientoServicios.montoMensual,
        montoReconexion: fraccionamientoServicios.montoReconexion,
      })
      .from(fraccionamientoServicios)
      .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
      .where(eq(fraccionamientoServicios.fraccionamientoId, input.fraccionamientoId))),

  configurar: roleProcedure('admin')
    .input(tenantInput.extend({
      servicioId: z.string().uuid(),
      estado: z.enum(['activo', 'inactivo']),
      montoMensual: z.number().min(0),
      montoReconexion: z.number().min(0).default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      await subscriptionService.requireOperational(input.fraccionamientoId);
      const [service] = await db.query.servicios.findMany({ where: (s, { eq }) => eq(s.id, input.servicioId), limit: 1 });
      if (!service || !service.activo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Servicio no encontrado' });
      if (service.clave === 'agua' && input.estado === 'inactivo') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El servicio de agua es obligatorio y no se puede desactivar' });
      }

      await db.transaction(async (tx) => {
        await tx.insert(fraccionamientoServicios).values({
          fraccionamientoId: input.fraccionamientoId,
          servicioId: input.servicioId,
          estado: input.estado,
          montoMensual: input.montoMensual.toFixed(2),
          montoReconexion: input.montoReconexion.toFixed(2),
        }).onConflictDoUpdate({
          target: [fraccionamientoServicios.fraccionamientoId, fraccionamientoServicios.servicioId],
          set: {
            estado: input.estado,
            montoMensual: input.montoMensual.toFixed(2),
            montoReconexion: input.montoReconexion.toFixed(2),
            actualizadoEn: new Date(),
          },
        });

        const [activation] = await tx.select({ id: fraccionamientoServicios.id })
          .from(fraccionamientoServicios)
          .where(and(
            eq(fraccionamientoServicios.fraccionamientoId, input.fraccionamientoId),
            eq(fraccionamientoServicios.servicioId, input.servicioId),
          ))
          .limit(1);
        if (activation && input.estado === 'inactivo') {
          // Desactivar la oferta del tenant también desactiva las suscripciones
          // individuales; reactivarla no las reactiva automáticamente.
          await tx.update(perfilesServicios)
            .set({ activo: false, actualizadoEn: new Date() })
            .where(and(
              eq(perfilesServicios.fraccionamientoServicioId, activation.id),
              eq(perfilesServicios.fraccionamientoId, input.fraccionamientoId),
            ));
        }

        // Todo servicio activo es obligatorio para todos los perfiles del
        // fraccionamiento, incluidos los que ya existían antes de configurarlo.
        if (input.estado === 'activo') {
          const perfiles = await tx.select({ id: perfilesResidente.id, estadoAgua: perfilesResidente.estadoAgua })
            .from(perfilesResidente)
            .where(eq(perfilesResidente.fraccionamientoId, input.fraccionamientoId));
          if (activation && perfiles.length > 0) {
            await tx.insert(perfilesServicios).values(perfiles.map((perfil) => ({
              perfilId: perfil.id,
              fraccionamientoId: input.fraccionamientoId,
              fraccionamientoServicioId: activation.id,
              estadoAgua: perfil.estadoAgua,
              activo: true,
            }))).onConflictDoUpdate({
              target: [perfilesServicios.perfilId, perfilesServicios.fraccionamientoServicioId],
              set: { activo: true, actualizadoEn: new Date() },
            });
          }
        }
      });
      // Al activar un servicio obligatorio, su cargo del periodo vigente queda
      // disponible de inmediato en el checkout combinado del residente.
      if (input.estado === 'activo') {
        const ahora = new Date();
        await generateMonthlyServiceCharges({
          fraccionamientoId: input.fraccionamientoId,
          mes: ahora.getUTCMonth() + 1,
          anio: ahora.getUTCFullYear(),
        });
      }
      await db.insert(auditoria).values({
        actorId: ctx.user.id,
        accion: 'servicio.fraccionamiento.configurado',
        entidad: 'fraccionamiento_servicios',
        entidadId: input.servicioId,
        detalle: {
          fraccionamientoId: input.fraccionamientoId,
          estado: input.estado,
          montoMensual: input.montoMensual,
          montoReconexion: input.montoReconexion,
        },
      });
      return { ok: true };
    }),

  misCargos: roleProcedure('residente').query(async ({ ctx }) => {
    if (!ctx.user.fraccionamientoId) return [];
    const perfil = await residenteRepo.findByUserId(ctx.user.id);
    if (!perfil) throw new TRPCError({ code: 'NOT_FOUND', message: 'Perfil no encontrado' });
    return db.select({
      id: cargosServicios.id,
      mes: cargosServicios.mes,
      anio: cargosServicios.anio,
      monto: cargosServicios.monto,
      estado: cargosServicios.estado,
      metodo: cargosServicios.metodo,
      folio: cargosServicios.folio,
      servicio: servicios.clave,
      nombreServicio: servicios.nombre,
    }).from(cargosServicios)
      .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, cargosServicios.fraccionamientoServicioId))
      .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
      .where(and(eq(cargosServicios.perfilId, perfil.id), eq(cargosServicios.fraccionamientoId, ctx.user.fraccionamientoId)));
  }),

  generarCargosMes: roleProcedure('admin')
    .input(tenantInput.extend({ mes: z.number().int().min(1).max(12), anio: z.number().int().min(2020).max(2100) }))
    .mutation(async ({ input }) => generateMonthlyServiceCharges(input)),

  registrarCargoManual: roleProcedure('admin', 'representante', 'tesorera')
    .input(z.object({ cargoId: z.string().uuid(), metodo: z.enum(['efectivo', 'transferencia']) }))
    .mutation(async ({ ctx, input }) => {
      const [cargo] = await db.select({
        id: cargosServicios.id,
        estado: cargosServicios.estado,
        perfilId: cargosServicios.perfilId,
        fraccionamientoId: cargosServicios.fraccionamientoId,
        servicioClave: servicios.clave,
      }).from(cargosServicios)
        .innerJoin(perfilesResidente, eq(perfilesResidente.id, cargosServicios.perfilId))
        .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, cargosServicios.fraccionamientoServicioId))
        .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
        .where(eq(cargosServicios.id, input.cargoId)).limit(1);
      if (!cargo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cargo no encontrado' });
      if (ctx.user.role !== 'admin' && cargo.fraccionamientoId !== ctx.user.fraccionamientoId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cargo fuera de tu fraccionamiento' });
      }
      if (ctx.user.role !== 'admin') {
        const [fraccionamiento] = await db.select({ id: fraccionamientos.id }).from(fraccionamientos).where(and(
          eq(fraccionamientos.id, cargo.fraccionamientoId),
          ctx.user.role === 'representante' ? eq(fraccionamientos.representanteId, ctx.user.id) : eq(fraccionamientos.tesoreraId, ctx.user.id),
        )).limit(1);
        if (!fraccionamiento) throw new TRPCError({ code: 'FORBIDDEN', message: 'No puedes registrar cargos de este fraccionamiento' });
      }
      if (cargo.estado !== 'pendiente') throw new TRPCError({ code: 'CONFLICT', message: 'El cargo ya fue resuelto' });
      if (cargo.servicioClave === 'agua') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Los pagos de agua deben registrarse desde el módulo de pagos de agua' });
      }
      const folio = generarFolioServicio();
      await db.transaction(async (tx) => {
        const [updated] = await tx.update(cargosServicios).set({
          estado: 'pagado', metodo: input.metodo, folio, pagadoEn: new Date(),
        }).where(and(eq(cargosServicios.id, input.cargoId), eq(cargosServicios.estado, 'pendiente'))).returning({ id: cargosServicios.id });
        if (!updated) throw new TRPCError({ code: 'CONFLICT', message: 'El cargo ya fue resuelto' });
        await tx.insert(tickets).values({
          pagoId: null,
          cargoServicioId: cargo.id,
          tipo: 'servicio',
          folio,
          pdfUrl: null,
        });
        await tx.insert(auditoria).values({
          actorId: ctx.user.id,
          accion: 'servicio.cargo.pagado_manual',
          entidad: 'cargos_servicios',
          entidadId: cargo.id,
          detalle: { perfilId: cargo.perfilId, fraccionamientoId: cargo.fraccionamientoId, metodo: input.metodo, folio },
        });
      });
      return { ok: true, folio };
    }),
});
