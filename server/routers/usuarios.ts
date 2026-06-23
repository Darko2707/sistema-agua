import { router, protectedProcedure, roleProcedure } from '../trpc';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

import { db } from '@/db';
import { user, circuitos, perfilesResidente } from '@/db/schema';
import { residenteRepo, circuitoRepo } from '@/src/infrastructure/db/repositories';
import { CrearPerfilHandler } from '@/src/application/residentes/commands/crear-perfil.handler';
import { ListarResidentesHandler } from '@/src/application/residentes/queries/listar-residentes.handler';
import { logger } from '@/lib/logger';

const crearPerfilHandler    = new CrearPerfilHandler({ residenteRepo, circuitoRepo });
const listarResidentesHandler = new ListarResidentesHandler({ residenteRepo, circuitoRepo });

export const usuariosRouter = router({
  crearPerfil: protectedProcedure
    .input(z.object({
      telefono:     z.string().min(10),
      sexo:         z.enum(['masculino', 'femenino', 'otro']),
      tenencia:     z.enum(['propietario', 'inquilino']),
      circuitoId:   z.string().uuid(),
      edificio:     z.string().min(1),
      departamento: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      // crearPerfilHandler handles validation, but telefono/sexo/tenencia need DB insert
      // Use direct DB insert to include those fields
      const circuito = await circuitoRepo.findById(input.circuitoId);
      if (!circuito?.activo) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Este circuito está inhabilitado temporalmente.' });
      }
      const existente = await residenteRepo.findByUserId(ctx.user.id);
      if (existente) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ya tienes un perfil registrado' });
      }
      const estadoInicial = new Date().getDate() > 5 ? 'pendiente_corte' : 'activo';
      logger.info('usuario.perfil.creado', { userId: ctx.user.id, estadoInicial });
      const [perfil] = await db.insert(perfilesResidente).values({
        userId: ctx.user.id,
        ...input,
        estadoAgua: estadoInicial,
      }).returning();
      return perfil;
    }),

  miPerfil: protectedProcedure.query(async ({ ctx }) => {
    return residenteRepo.findByUserId(ctx.user.id);
  }),

  listarCircuitos: protectedProcedure.query(async () => {
    return circuitoRepo.findAll();
  }),

  listarResidentes: roleProcedure('admin', 'representante').query(async ({ ctx }) => {
    const rol = (ctx.user as { role?: string }).role as 'admin' | 'representante';
    return listarResidentesHandler.execute({ rol, userId: ctx.user.id });
  }),

  cambiarRol: roleProcedure('admin')
    .input(z.object({
      userId: z.string(),
      rol:    z.enum(['admin', 'representante', 'cuadrilla_cortes', 'residente']),
    }))
    .mutation(async ({ ctx, input }) => {
      logger.info('usuario.rol.cambiado', { actorId: ctx.user.id, userId: input.userId, rol: input.rol });
      const usuario = await db.query.user.findFirst({ where: (u, { eq }) => eq(u.id, input.userId) });
      if (!usuario) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });
      await db.update(user).set({ role: input.rol }).where(eq(user.id, input.userId));
      return { ok: true };
    }),

  asignarRepresentante: roleProcedure('admin')
    .input(z.object({
      circuitoId: z.string().uuid(),
      userId:     z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      logger.info('usuario.representante.asignado', { actorId: ctx.user.id, circuitoId: input.circuitoId, userId: input.userId || null });
      const circuito = await db.query.circuitos.findFirst({ where: (c, { eq }) => eq(c.id, input.circuitoId) });
      if (!circuito) throw new TRPCError({ code: 'NOT_FOUND', message: 'Circuito no encontrado' });

      if (!input.userId) {
        await db.update(circuitos).set({ representanteId: null }).where(eq(circuitos.id, input.circuitoId));
        return { ok: true };
      }

      const usuario = await db.query.user.findFirst({ where: (u, { eq }) => eq(u.id, input.userId) });
      if (!usuario) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });
      await db.update(circuitos).set({ representanteId: input.userId }).where(eq(circuitos.id, input.circuitoId));
      await db.update(user).set({ role: 'representante' }).where(eq(user.id, input.userId));
      return { ok: true };
    }),

  listarPersonal: roleProcedure('admin').query(async () => {
    return db.query.user.findMany({
      where: (u, { ne }) => ne(u.role, 'residente'),
      orderBy: (u, { desc }) => [desc(u.createdAt)],
    });
  }),
});
