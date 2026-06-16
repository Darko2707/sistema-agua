import { router, protectedProcedure, roleProcedure } from '../trpc';
import { z } from 'zod';
import { db } from '@/db';
import { perfilesResidente, circuitos, user, cortes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { obtenerPeriodoVigente, esMoroso } from '../utils';
import bcrypt from 'bcryptjs';

export const usuariosRouter = router({
  // El residente recién registrado completa su perfil
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
      const existente = await db.query.perfilesResidente.findFirst({
        where: (p, { eq }) => eq(p.userId, ctx.user.id),
      });
      if (existente) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ya tienes un perfil registrado' });
      }

      const [perfil] = await db.insert(perfilesResidente).values({
        userId: ctx.user.id,
        ...input,
      }).returning();

      return perfil;
    }),

  // Obtiene mi propio perfil (residente)
  miPerfil: protectedProcedure.query(async ({ ctx }) => {
    return db.query.perfilesResidente.findFirst({
      where: (p, { eq }) => eq(p.userId, ctx.user.id),
      with: { circuito: true },
    });
  }),

  // Lista de circuitos para el formulario de registro
  listarCircuitos: protectedProcedure.query(async () => {
    return db.select().from(circuitos);
  }),

  // Admin / Representante: lista residentes con estado de pago del mes
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

    // Mapear resultados con estado de pago del mes y lógica de moroso por fecha
    return perfiles.map((p) => ({
      id: p.id,
      edificio: p.edificio,
      departamento: p.departamento,
      estadoAgua: p.estadoAgua,
      usuario: p.usuario,
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

  // ✅ NUEVO: Admin: cambiar rol de un usuario
  cambiarRol: roleProcedure('admin')
    .input(z.object({
      userId: z.string(),
      rol: z.enum(['admin', 'representante', 'operador_pozo', 'cuadrilla_cortes', 'residente']),
    }))
    .mutation(async ({ input }) => {
      await db.update(user)
        .set({ role: input.rol })
        .where(eq(user.id, input.userId));
      return { ok: true };
    }),

  // Admin: lista de personal (no residentes)
  listarPersonal: roleProcedure('admin').query(async () => {
    return db.query.user.findMany({
      where: (u, { ne }) => ne(u.role, 'residente'),
      orderBy: (u, { desc }) => [desc(u.createdAt)],
    });
  }),
});