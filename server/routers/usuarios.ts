import { router, publicProcedure, authenticatedProcedure, roleProcedure } from '../trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { Ratelimit } from '@upstash/ratelimit';

import { residenteRepo, circuitoRepo, userRepo } from '@/src/infrastructure/db/repositories';
import {
  representativeResetGenerateAccountLimiter,
  representativeResetGenerateIpLimiter,
  representativeResetRequestAccountLimiter,
  representativeResetRequestIpLimiter,
  representativeResetRedeemAccountLimiter,
  representativeResetRedeemIpLimiter,
} from '@/lib/ratelimit';
import { consumeRateLimit } from '@/lib/rate-limit-guard';
import { clientIpFromHeaders, opaqueRateLimitKey } from '@/lib/request-security';
import { CrearPerfilHandler } from '@/src/application/residentes/commands/crear-perfil.handler';
import { ListarResidentesHandler } from '@/src/application/residentes/queries/listar-residentes.handler';
import { CrearPersonalHandler } from '@/src/application/usuarios/commands/crear-personal.handler';
import { ActualizarPersonalHandler } from '@/src/application/usuarios/commands/actualizar-personal.handler';
import { EliminarPersonalHandler } from '@/src/application/usuarios/commands/eliminar-personal.handler';
import { CambiarRolHandler } from '@/src/application/usuarios/commands/cambiar-rol.handler';
import { CambiarRolEnCircuitoHandler } from '@/src/application/usuarios/commands/cambiar-rol-circuito.handler';
import { ListarPersonalHandler } from '@/src/application/usuarios/queries/listar-personal.handler';
import { representativePasswordResetService } from '@/src/infrastructure/db/services/representative-password-reset.service';
import { isRepresentativeResetCodeValid } from '@/src/domain/usuarios/representative-reset-code';

const crearPerfilHandler        = new CrearPerfilHandler({ residenteRepo, circuitoRepo });
const listarResidentesHandler   = new ListarResidentesHandler({ residenteRepo, circuitoRepo });
const crearPersonalHandler      = new CrearPersonalHandler({ userRepo, circuitoRepo });
const actualizarPersonalHandler = new ActualizarPersonalHandler({ userRepo, circuitoRepo });
const eliminarPersonalHandler   = new EliminarPersonalHandler({ userRepo, circuitoRepo });
const cambiarRolHandler         = new CambiarRolHandler({ userRepo });
const cambiarRolCircuitoHandler = new CambiarRolEnCircuitoHandler({ userRepo });
const listarPersonalHandler     = new ListarPersonalHandler({ userRepo, circuitoRepo });

async function limitOrThrow(
  limiter: Ratelimit | null,
  key: string,
  scope: 'representative_reset_request' | 'representative_reset_generate' | 'representative_reset_redeem',
  message = 'Demasiados intentos. Intenta de nuevo mas tarde.',
) {
  const result = await consumeRateLimit({
    limiter,
    key,
    boundary: 'trpc_procedure',
    scope,
  });
  if (result && !result.success) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message });
  }
}

export const usuariosRouter = router({
  crearPerfil: authenticatedProcedure
    .input(z.object({
      telefono:            z.string().trim().regex(/^\d{10,15}$/, 'El telefono debe contener entre 10 y 15 digitos'),
      sexo:                z.enum(['masculino', 'femenino', 'otro']),
      tenencia:            z.enum(['propietario', 'inquilino']),
      circuitoId:          z.string().uuid(),
      edificio:            z.string().trim().min(1).max(8),
      departamento:        z.string().trim().min(1).max(8),
      nombrePropietario:   z.string().trim().min(2).max(120).optional(),
      telefonoPropietario: z.string().trim().regex(/^\d{10,15}$/, 'El telefono debe contener entre 10 y 15 digitos').optional(),
    }).refine(d => d.tenencia === 'propietario' || (!!d.nombrePropietario && !!d.telefonoPropietario), {
      message: 'Los datos del propietario son requeridos cuando eres inquilino',
      path: ['nombrePropietario'],
    }))
    .mutation(async ({ ctx, input }) => {
      return crearPerfilHandler.execute({ userId: ctx.user.id, ...input });
    }),

  miPerfil: authenticatedProcedure.query(async ({ ctx }) => {
    return residenteRepo.findByUserId(ctx.user.id);
  }),

  listarCircuitos: publicProcedure.query(async () => {
    return circuitoRepo.findActivos();
  }),

  solicitarCodigoRecuperacion: publicProcedure
    .input(z.object({ email: z.string().trim().email().max(254) }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.trim().toLowerCase();
      const ip = clientIpFromHeaders(ctx.headers);
      await limitOrThrow(
        representativeResetRequestIpLimiter,
        opaqueRateLimitKey('ip', ip),
        'representative_reset_request',
      );
      await limitOrThrow(
        representativeResetRequestAccountLimiter,
        opaqueRateLimitKey('account', email),
        'representative_reset_request',
      );
      await representativePasswordResetService.requestForResident({ email });

      // No revelar si el correo existe, esta eliminado o pertenece a otro rol.
      return { ok: true };
    }),

  listarSolicitudesRecuperacion: roleProcedure('representante')
    .query(async ({ ctx }) => {
      return representativePasswordResetService.listPendingForRepresentative(ctx.user.id);
    }),

  generarCodigoRecuperacion: roleProcedure('representante')
    .input(z.object({ perfilId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const ip = clientIpFromHeaders(ctx.headers);
      await limitOrThrow(
        representativeResetGenerateIpLimiter,
        opaqueRateLimitKey('ip', ip),
        'representative_reset_generate',
        'Generaste muchos codigos. Espera unos minutos.',
      );
      await limitOrThrow(
        representativeResetGenerateAccountLimiter,
        opaqueRateLimitKey('account', ctx.user.id),
        'representative_reset_generate',
        'Generaste muchos codigos. Espera unos minutos.',
      );
      return representativePasswordResetService.generateForResident({
        representanteId: ctx.user.id,
        perfilId:        input.perfilId,
      });
    }),

  restablecerConCodigoRepresentante: publicProcedure
    .input(z.object({
      email:       z.string().trim().email(),
      code:        z.string().refine(isRepresentativeResetCodeValid, {
        message: 'El codigo debe contener exactamente 6 digitos',
      }),
      newPassword: z.string().min(8).max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.trim().toLowerCase();
      const ip = clientIpFromHeaders(ctx.headers);
      await limitOrThrow(
        representativeResetRedeemIpLimiter,
        opaqueRateLimitKey('ip', ip),
        'representative_reset_redeem',
      );
      await limitOrThrow(
        representativeResetRedeemAccountLimiter,
        opaqueRateLimitKey('account', email),
        'representative_reset_redeem',
      );
      await representativePasswordResetService.redeem(input);
      return { ok: true };
    }),

  listarResidentes: roleProcedure('admin', 'representante')
    .input(z.object({
      page:     z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(200).default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      return listarResidentesHandler.execute({
        rol:      ctx.user.role as 'admin' | 'representante',
        userId:   ctx.user.id,
        page:     input?.page,
        pageSize: input?.pageSize,
      });
    }),

  cambiarRol: roleProcedure('admin')
    .input(z.object({
      userId: z.string().min(1),
      rol:    z.enum(['admin', 'representante', 'tesorera', 'cuadrilla_cortes', 'residente']),
    }))
    .mutation(async ({ ctx, input }) => {
      await cambiarRolHandler.execute({ actorId: ctx.user.id, userId: input.userId, nuevoRol: input.rol });
      return { ok: true };
    }),

  cambiarRolEnCircuito: roleProcedure('representante')
    .input(z.object({
      userId: z.string().min(1),
      rol:    z.enum(['residente', 'tesorera', 'cuadrilla_cortes']),
    }))
    .mutation(async ({ ctx, input }) => {
      const miCircuito = await circuitoRepo.findByRepresentante(ctx.user.id);
      if (!miCircuito) throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes un circuito asignado' });
      await cambiarRolCircuitoHandler.execute({
        actorId:    ctx.user.id,
        userId:     input.userId,
        nuevoRol:   input.rol,
        circuitoId: miCircuito.id,
      });
      return { ok: true };
    }),

  asignarRepresentante: roleProcedure('admin')
    .input(z.object({
      circuitoId: z.string().uuid(),
      userId:     z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const circuito = await circuitoRepo.findById(input.circuitoId);
      if (!circuito) throw new TRPCError({ code: 'NOT_FOUND', message: 'Circuito no encontrado' });

      if (!input.userId) {
        await circuitoRepo.updateRepresentante(input.circuitoId, null);
        return { ok: true };
      }

      const usuario = await userRepo.findById(input.userId);
      if (!usuario) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });

      await circuitoRepo.updateRepresentante(input.circuitoId, input.userId);
      await userRepo.updateRole(input.userId, 'representante');
      return { ok: true };
    }),

  listarPersonal: roleProcedure('admin', 'representante').query(async ({ ctx }) => {
    return listarPersonalHandler.execute({ rol: ctx.user.role as 'admin' | 'representante', userId: ctx.user.id });
  }),

  listarRepresentantes: roleProcedure('admin').query(async () => {
    return userRepo.listarRepresentantes();
  }),

  crearRepresentante: roleProcedure('admin')
    .input(z.object({
      nombre:                 z.string().min(1),
      email:                  z.string().email(),
      password:               z.string().min(8),
      circuitoId:             z.string().uuid().optional(),
      mercadoPagoAccessToken: z.string().optional(),
      mercadoPagoCollectorId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await crearPersonalHandler.execute({ actorId: ctx.user.id, role: 'representante', ...input });
      return { ok: true };
    }),

  actualizarRepresentante: roleProcedure('admin')
    .input(z.object({
      id:                     z.string().min(1),
      nombre:                 z.string().min(1).optional(),
      email:                  z.string().email().optional(),
      password:               z.string().min(8).optional(),
      circuitoId:             z.string().uuid().nullable().optional(),
      mercadoPagoAccessToken: z.string().optional(),
      mercadoPagoCollectorId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await actualizarPersonalHandler.execute({ actorId: ctx.user.id, role: 'representante', ...input });
      return { ok: true };
    }),

  eliminarRepresentante: roleProcedure('admin')
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await eliminarPersonalHandler.execute({ actorId: ctx.user.id, id: input.id, role: 'representante' });
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════════════════
  // CRUD TESORERAS
  // ══════════════════════════════════════════════════════════════════════════
  listarTesoreras: roleProcedure('admin').query(async () => {
    return userRepo.listarTesoreras();
  }),

  crearTesorera: roleProcedure('admin')
    .input(z.object({
      nombre:                 z.string().min(1),
      email:                  z.string().email(),
      password:               z.string().min(8),
      circuitoId:             z.string().uuid().optional(),
      mercadoPagoAccessToken: z.string().optional(),
      mercadoPagoCollectorId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await crearPersonalHandler.execute({ actorId: ctx.user.id, role: 'tesorera', ...input });
      return { ok: true };
    }),

  actualizarTesorera: roleProcedure('admin')
    .input(z.object({
      id:                     z.string().min(1),
      nombre:                 z.string().min(1).optional(),
      email:                  z.string().email().optional(),
      password:               z.string().min(8).optional(),
      circuitoId:             z.string().uuid().nullable().optional(),
      mercadoPagoAccessToken: z.string().optional(),
      mercadoPagoCollectorId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await actualizarPersonalHandler.execute({ actorId: ctx.user.id, role: 'tesorera', ...input });
      return { ok: true };
    }),

  eliminarTesorera: roleProcedure('admin')
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await eliminarPersonalHandler.execute({ actorId: ctx.user.id, id: input.id, role: 'tesorera' });
      return { ok: true };
    }),
});
