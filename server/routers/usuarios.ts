// server/routers/usuarios.ts

import { router, protectedProcedure, roleProcedure } from '../trpc';
import { z } from 'zod';
import { db } from '@/db';
import { perfilesResidente, circuitos, user } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { obtenerPeriodoVigente, esMoroso } from '../utils';
import { determinarEstadoInicial } from '../utils/fechas';

export const usuariosRouter = router({
  // ============================================
  // crearPerfil: El residente recién registrado completa su perfil
  // ============================================
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
      // ✅ Verificar que el circuito exista y esté activo
      const circuito = await db.query.circuitos.findFirst({
        where: (c, { eq }) => eq(c.id, input.circuitoId),
      });
      
      if (!circuito?.activo) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Este circuito está inhabilitado temporalmente.',
        });
      }

      const existente = await db.query.perfilesResidente.findFirst({
        where: (p, { eq }) => eq(p.userId, ctx.user.id),
      });
      if (existente) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ya tienes un perfil registrado' });
      }

      // Calcular estado inicial según fecha
      const estadoInicial = determinarEstadoInicial();
      console.log(`📝 Nuevo residente: estado inicial = ${estadoInicial}`);

      const [perfil] = await db.insert(perfilesResidente).values({
        userId: ctx.user.id,
        ...input,
        estadoAgua: estadoInicial,
      }).returning();

      return perfil;
    }),

  // ============================================
  // miPerfil: Obtiene mi propio perfil (residente)
  // ============================================
  miPerfil: protectedProcedure.query(async ({ ctx }) => {
    return db.query.perfilesResidente.findFirst({
      where: (p, { eq }) => eq(p.userId, ctx.user.id),
      with: { circuito: true },
    });
  }),

  // ============================================
  // listarCircuitos: Lista de circuitos para el formulario de registro
  // ============================================
  listarCircuitos: protectedProcedure.query(async () => {
    return db.select().from(circuitos);
  }),

  // ============================================
  // listarResidentes: Admin / Representante: lista residentes con estado de pago del mes
  // ============================================
  listarResidentes: roleProcedure('admin', 'representante').query(async ({ ctx }) => {
    const { mes, anio } = obtenerPeriodoVigente();
    const rol = (ctx.user as any).role;

    let perfiles;

    if (rol === 'admin') {
      perfiles = await db.query.perfilesResidente.findMany({
        with: { 
          usuario: true, 
          circuito: true, 
          pagos: true, 
          cortes: true 
        },
        orderBy: (p, { desc }) => [desc(p.creadoEn)],
      });
    } else {
      // Representante: solo su circuito
      const miCircuito = await db.query.circuitos.findFirst({
        where: (c, { eq }) => eq(c.representanteId, ctx.user.id),
      });
      if (!miCircuito) return [];

      perfiles = await db.query.perfilesResidente.findMany({
        where: (p, { eq }) => eq(p.circuitoId, miCircuito.id),
        with: { 
          usuario: true, 
          circuito: true, 
          pagos: true, 
          cortes: true 
        },
        orderBy: (p, { desc }) => [desc(p.creadoEn)],
      });
    }

    return perfiles.map((p) => ({
      id: p.id,
      edificio: p.edificio,
      departamento: p.departamento,
      estadoAgua: p.estadoAgua,
      usuario: {
        id: p.usuario?.id,
        name: p.usuario?.name,
        email: p.usuario?.email,
        role: p.usuario?.role,
      },
      circuito: p.circuito,
      pagoEsteMes: p.pagos.some(
        (pg) => pg.mes === mes && pg.anio === anio && pg.estado === 'pagado'
      ),
      esMoroso: esMoroso(
        p.pagos.map((pg) => ({
          mes: pg.mes,
          anio: pg.anio,
          estado: pg.estado ?? 'pendiente',
        })),
        mes,
        anio
      ),
      corteActivo: p.cortes.some((c) => c.activo),
    }));
  }),

  // ============================================
  // cambiarRol: Admin: cambiar rol de un usuario
  // ============================================
  cambiarRol: roleProcedure('admin')
    .input(z.object({
      userId: z.string(),
      rol: z.enum(['admin', 'representante', 'cuadrilla_cortes', 'residente']),
    }))
    .mutation(async ({ input }) => {
      console.log('📝 Cambiando rol:', input);
      
      const usuario = await db.query.user.findFirst({
        where: (u, { eq }) => eq(u.id, input.userId),
      });
      if (!usuario) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });
      }
      
      await db.update(user)
        .set({ role: input.rol })
        .where(eq(user.id, input.userId));
      
      return { ok: true };
    }),

  // ============================================
  // asignarRepresentante: Admin: asignar representante a un circuito
  // ============================================
  asignarRepresentante: roleProcedure('admin')
    .input(z.object({
      circuitoId: z.string().uuid(),
      userId: z.string(),
    }))
    .mutation(async ({ input }) => {
      console.log('📝 Asignando representante:', input);
      
      const circuito = await db.query.circuitos.findFirst({
        where: (c, { eq }) => eq(c.id, input.circuitoId),
      });
      if (!circuito) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Circuito no encontrado' });
      }

      if (!input.userId) {
        await db.update(circuitos)
          .set({ representanteId: null })
          .where(eq(circuitos.id, input.circuitoId));

        return { ok: true };
      }

      const usuario = await db.query.user.findFirst({
        where: (u, { eq }) => eq(u.id, input.userId),
      });
      if (!usuario) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });
      }

      await db.update(circuitos)
        .set({ representanteId: input.userId })
        .where(eq(circuitos.id, input.circuitoId));
      
      await db.update(user)
        .set({ role: 'representante' })
        .where(eq(user.id, input.userId));
      
      return { ok: true };
    }),

  // ============================================
  // listarPersonal: Admin: lista de personal (no residentes)
  // ============================================
  listarPersonal: roleProcedure('admin').query(async () => {
    return db.query.user.findMany({
      where: (u, { ne }) => ne(u.role, 'residente'),
      orderBy: (u, { desc }) => [desc(u.createdAt)],
    });
  }),
});
