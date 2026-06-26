import { router, publicProcedure, protectedProcedure, authenticatedProcedure, roleProcedure } from '../trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { residenteRepo, circuitoRepo, userRepo } from '@/src/infrastructure/db/repositories';
import { CrearPerfilHandler } from '@/src/application/residentes/commands/crear-perfil.handler';
import { ListarResidentesHandler } from '@/src/application/residentes/queries/listar-residentes.handler';
import { CrearPersonalHandler } from '@/src/application/usuarios/commands/crear-personal.handler';
import { ActualizarPersonalHandler } from '@/src/application/usuarios/commands/actualizar-personal.handler';
import { EliminarPersonalHandler } from '@/src/application/usuarios/commands/eliminar-personal.handler';
import { CambiarRolHandler } from '@/src/application/usuarios/commands/cambiar-rol.handler';
import { CambiarRolEnCircuitoHandler } from '@/src/application/usuarios/commands/cambiar-rol-circuito.handler';
import { ListarPersonalHandler } from '@/src/application/usuarios/queries/listar-personal.handler';

const crearPerfilHandler        = new CrearPerfilHandler({ residenteRepo, circuitoRepo });
const listarResidentesHandler   = new ListarResidentesHandler({ residenteRepo, circuitoRepo });
const crearPersonalHandler      = new CrearPersonalHandler({ userRepo, circuitoRepo });
const actualizarPersonalHandler = new ActualizarPersonalHandler({ userRepo, circuitoRepo });
const eliminarPersonalHandler   = new EliminarPersonalHandler({ userRepo, circuitoRepo });
const cambiarRolHandler         = new CambiarRolHandler({ userRepo });
const cambiarRolCircuitoHandler = new CambiarRolEnCircuitoHandler({ userRepo });
const listarPersonalHandler     = new ListarPersonalHandler({ userRepo, circuitoRepo });

export const usuariosRouter = router({
  crearPerfil: authenticatedProcedure
    .input(z.object({
      telefono:            z.string().min(10),
      sexo:                z.enum(['masculino', 'femenino', 'otro']),
      tenencia:            z.enum(['propietario', 'inquilino']),
      circuitoId:          z.string().uuid(),
      edificio:            z.string().min(1),
      departamento:        z.string().regex(/^\d+[a-zA-Z]?$/, 'El departamento debe ser un número con letra opcional (ej: 314 o 314a)'),
      nombrePropietario:   z.string().min(2).optional(),
      telefonoPropietario: z.string().min(10).optional(),
    }).refine(d => d.tenencia === 'propietario' || (!!d.nombrePropietario && !!d.telefonoPropietario), {
      message: 'Los datos del propietario son requeridos cuando eres inquilino',
      path: ['nombrePropietario'],
    }))
    .mutation(async ({ ctx, input }) => {
      return crearPerfilHandler.execute({ userId: ctx.user.id, ...input });
    }),

  miPerfil: protectedProcedure.query(async ({ ctx }) => {
    return residenteRepo.findByUserId(ctx.user.id);
  }),

  listarCircuitos: publicProcedure.query(async () => {
    return circuitoRepo.findActivos();
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
    .mutation(async ({ ctx, input }) => {
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
