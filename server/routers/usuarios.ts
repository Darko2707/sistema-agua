import { router, publicProcedure, protectedProcedure, roleProcedure } from '../trpc';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

import { db } from '@/db';
import { user, account, circuitos, perfilesResidente } from '@/db/schema';
import { residenteRepo, circuitoRepo } from '@/src/infrastructure/db/repositories';
import { CrearPerfilHandler } from '@/src/application/residentes/commands/crear-perfil.handler';
import { ListarResidentesHandler } from '@/src/application/residentes/queries/listar-residentes.handler';
import { encryptToken } from '@/lib/crypto';
import { logger } from '@/lib/logger';

function encryptMpToken(token: string | undefined): string | undefined {
  if (!token) return undefined;
  try { return encryptToken(token); } catch { return token; }
}

const crearPerfilHandler    = new CrearPerfilHandler({ residenteRepo, circuitoRepo });
const listarResidentesHandler = new ListarResidentesHandler({ residenteRepo, circuitoRepo });

export const usuariosRouter = router({
  crearPerfil: protectedProcedure
    .input(z.object({
      telefono:            z.string().min(10),
      sexo:                z.enum(['masculino', 'femenino', 'otro']),
      tenencia:            z.enum(['propietario', 'inquilino']),
      circuitoId:          z.string().uuid(),
      edificio:            z.string().min(1),
      departamento:        z.string().regex(/^\d+[abc]$/, 'El departamento debe ser un número seguido de a, b o c (ej: 314a)'),
      nombrePropietario:   z.string().min(2).optional(),
      telefonoPropietario: z.string().min(10).optional(),
    }).refine(d => d.tenencia === 'propietario' || (!!d.nombrePropietario && !!d.telefonoPropietario), {
      message: 'Los datos del propietario son requeridos cuando eres inquilino',
      path: ['nombrePropietario'],
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
        userId:              ctx.user.id,
        telefono:            input.telefono,
        sexo:                input.sexo,
        tenencia:            input.tenencia,
        circuitoId:          input.circuitoId,
        edificio:            input.edificio,
        departamento:        input.departamento,
        nombrePropietario:   input.nombrePropietario ?? null,
        telefonoPropietario: input.telefonoPropietario ?? null,
        estadoAgua:          estadoInicial,
      }).returning();
      return perfil;
    }),

  miPerfil: protectedProcedure.query(async ({ ctx }) => {
    return residenteRepo.findByUserId(ctx.user.id);
  }),

  listarCircuitos: publicProcedure.query(async () => {
    return circuitoRepo.findAll();
  }),

  listarResidentes: roleProcedure('admin', 'representante').query(async ({ ctx }) => {
    const rol = (ctx.user as { role?: string }).role as 'admin' | 'representante';
    return listarResidentesHandler.execute({ rol, userId: ctx.user.id });
  }),

  cambiarRol: roleProcedure('admin', 'representante')
    .input(z.object({
      userId: z.string(),
      rol:    z.enum(['admin', 'representante', 'tesorera', 'cuadrilla_cortes', 'residente']),
    }))
    .mutation(async ({ ctx, input }) => {
      const actorRole = (ctx.user as { role?: string }).role;
      if (actorRole === 'representante') {
        if (input.rol === 'admin' || input.rol === 'cuadrilla_cortes' || input.rol === 'representante') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes permiso para asignar ese rol' });
        }
        const miCircuito = await db.query.circuitos.findFirst({
          where: (c, { eq }) => eq(c.representanteId, ctx.user.id),
        });
        if (!miCircuito) throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes un circuito asignado' });
        const perfil = await db.query.perfilesResidente.findFirst({
          where: (p, { eq }) => eq(p.userId, input.userId),
        });
        if (!perfil || perfil.circuitoId !== miCircuito.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Este usuario no pertenece a tu circuito' });
        }
      }

      logger.info('usuario.rol.cambiado', { actorId: ctx.user.id, userId: input.userId, rol: input.rol });
      const usuario = await db.query.user.findFirst({ where: (u, { eq }) => eq(u.id, input.userId) });
      if (!usuario) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });

      if (usuario.role === 'representante' && input.rol !== 'representante') {
        await db.update(circuitos).set({ representanteId: null }).where(eq(circuitos.representanteId, input.userId));
      }
      if (usuario.role === 'tesorera' && input.rol !== 'tesorera') {
        await db.update(circuitos).set({ tesoreraId: null }).where(eq(circuitos.tesoreraId, input.userId));
      }

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

  listarPersonal: roleProcedure('admin', 'representante').query(async ({ ctx }) => {
    const actorRole = (ctx.user as { role?: string }).role;
    if (actorRole === 'representante') {
      const circuito = await db.query.circuitos.findFirst({
        where: (c, { eq }) => eq(c.representanteId, ctx.user.id),
      });
      if (!circuito?.tesoreraId) return [];
      const tesorero = await db.query.user.findFirst({
        where: (u, { eq }) => eq(u.id, circuito.tesoreraId!),
      });
      return tesorero ? [tesorero] : [];
    }
    return db.query.user.findMany({
      where: (u, { ne }) => ne(u.role, 'residente'),
      orderBy: (u, { desc }) => [desc(u.createdAt)],
    });
  }),

  listarRepresentantes: roleProcedure('admin').query(async () => {
    const reps = await db.query.user.findMany({
      where: (u, { eq }) => eq(u.role, 'representante'),
      orderBy: (u, { asc }) => [asc(u.name)],
    });
    const todos = await db.query.circuitos.findMany();
    return reps.map((r) => ({
      id:      r.id,
      name:    r.name,
      email:   r.email,
      circuito: todos.find((c) => c.representanteId === r.id) ?? null,
    }));
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
      const existe = await db.query.user.findFirst({ where: (u, { eq }) => eq(u.email, input.email) });
      if (existe) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ya existe un usuario con ese correo' });

      const userId   = nanoid();
      const hashed   = await bcrypt.hash(input.password, 10);

      await db.insert(user).values({
        id: userId, name: input.nombre, email: input.email, role: 'representante', emailVerified: false,
      });
      await db.insert(account).values({
        id: nanoid(), accountId: input.email, providerId: 'credential',
        userId, password: hashed,
      });

      if (input.circuitoId) {
        await db.update(circuitos)
          .set({
            representanteId: userId,
            ...(input.mercadoPagoAccessToken ? { mercadoPagoAccessToken: encryptMpToken(input.mercadoPagoAccessToken) } : {}),
            ...(input.mercadoPagoCollectorId ? { mercadoPagoCollectorId: input.mercadoPagoCollectorId } : {}),
          })
          .where(eq(circuitos.id, input.circuitoId));
      }
      logger.info('admin.representante.creado', { actorId: ctx.user.id, userId });
      return { ok: true };
    }),

  actualizarRepresentante: roleProcedure('admin')
    .input(z.object({
      id:                     z.string(),
      nombre:                 z.string().min(1).optional(),
      email:                  z.string().email().optional(),
      password:               z.string().min(8).optional(),
      circuitoId:             z.string().uuid().nullable().optional(),
      mercadoPagoAccessToken: z.string().optional(),
      mercadoPagoCollectorId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userUpdates: Record<string, unknown> = {};
      if (input.nombre) userUpdates.name  = input.nombre;
      if (input.email)  userUpdates.email = input.email;
      if (Object.keys(userUpdates).length) {
        await db.update(user).set(userUpdates).where(eq(user.id, input.id));
      }
      if (input.password) {
        const hashed = await bcrypt.hash(input.password, 10);
        await db.update(account).set({ password: hashed })
          .where(eq(account.userId, input.id));
      }
      // Desasignar circuito anterior
      await db.update(circuitos).set({ representanteId: null }).where(eq(circuitos.representanteId, input.id));
      // Asignar nuevo circuito si se proveyó
      if (input.circuitoId) {
        await db.update(circuitos)
          .set({
            representanteId: input.id,
            ...(input.mercadoPagoAccessToken ? { mercadoPagoAccessToken: encryptMpToken(input.mercadoPagoAccessToken) } : {}),
            ...(input.mercadoPagoCollectorId ? { mercadoPagoCollectorId: input.mercadoPagoCollectorId } : {}),
          })
          .where(eq(circuitos.id, input.circuitoId));
      }
      logger.info('admin.representante.actualizado', { actorId: ctx.user.id, userId: input.id });
      return { ok: true };
    }),

  eliminarRepresentante: roleProcedure('admin')
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(circuitos).set({ representanteId: null }).where(eq(circuitos.representanteId, input.id));
      await db.delete(user).where(eq(user.id, input.id));
      logger.info('admin.representante.eliminado', { actorId: ctx.user.id, userId: input.id });
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════════════════
  // CRUD TESORERAS
  // ══════════════════════════════════════════════════════════════════════════
  listarTesoreras: roleProcedure('admin').query(async () => {
    const tesoreras = await db.query.user.findMany({
      where: (u, { eq }) => eq(u.role, 'tesorera'),
      orderBy: (u, { asc }) => [asc(u.name)],
    });
    const todos = await db.query.circuitos.findMany();
    return tesoreras.map((t) => ({
      id:      t.id,
      name:    t.name,
      email:   t.email,
      circuito: todos.find((c) => c.tesoreraId === t.id) ?? null,
    }));
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
      const existe = await db.query.user.findFirst({ where: (u, { eq }) => eq(u.email, input.email) });
      if (existe) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ya existe un usuario con ese correo' });

      const userId = nanoid();
      const hashed = await bcrypt.hash(input.password, 10);

      await db.insert(user).values({
        id: userId, name: input.nombre, email: input.email, role: 'tesorera', emailVerified: false,
      });
      await db.insert(account).values({
        id: nanoid(), accountId: input.email, providerId: 'credential',
        userId, password: hashed,
      });

      if (input.circuitoId) {
        await db.update(circuitos)
          .set({
            tesoreraId: userId,
            ...(input.mercadoPagoAccessToken ? { mercadoPagoAccessToken: encryptMpToken(input.mercadoPagoAccessToken) } : {}),
            ...(input.mercadoPagoCollectorId ? { mercadoPagoCollectorId: input.mercadoPagoCollectorId } : {}),
          })
          .where(eq(circuitos.id, input.circuitoId));
      }
      logger.info('admin.tesorera.creada', { actorId: ctx.user.id, userId });
      return { ok: true };
    }),

  actualizarTesorera: roleProcedure('admin')
    .input(z.object({
      id:                     z.string(),
      nombre:                 z.string().min(1).optional(),
      email:                  z.string().email().optional(),
      password:               z.string().min(8).optional(),
      circuitoId:             z.string().uuid().nullable().optional(),
      mercadoPagoAccessToken: z.string().optional(),
      mercadoPagoCollectorId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userUpdates: Record<string, unknown> = {};
      if (input.nombre) userUpdates.name  = input.nombre;
      if (input.email)  userUpdates.email = input.email;
      if (Object.keys(userUpdates).length) {
        await db.update(user).set(userUpdates).where(eq(user.id, input.id));
      }
      if (input.password) {
        const hashed = await bcrypt.hash(input.password, 10);
        await db.update(account).set({ password: hashed }).where(eq(account.userId, input.id));
      }
      await db.update(circuitos).set({ tesoreraId: null }).where(eq(circuitos.tesoreraId, input.id));
      if (input.circuitoId) {
        await db.update(circuitos)
          .set({
            tesoreraId: input.id,
            ...(input.mercadoPagoAccessToken ? { mercadoPagoAccessToken: encryptMpToken(input.mercadoPagoAccessToken) } : {}),
            ...(input.mercadoPagoCollectorId ? { mercadoPagoCollectorId: input.mercadoPagoCollectorId } : {}),
          })
          .where(eq(circuitos.id, input.circuitoId));
      }
      logger.info('admin.tesorera.actualizada', { actorId: ctx.user.id, userId: input.id });
      return { ok: true };
    }),

  eliminarTesorera: roleProcedure('admin')
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(circuitos).set({ tesoreraId: null }).where(eq(circuitos.tesoreraId, input.id));
      await db.delete(user).where(eq(user.id, input.id));
      logger.info('admin.tesorera.eliminada', { actorId: ctx.user.id, userId: input.id });
      return { ok: true };
    }),
});
