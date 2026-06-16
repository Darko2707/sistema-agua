import { router, protectedProcedure, roleProcedure } from '../trpc';
import { z } from 'zod';
import { db } from '@/db';
import { perfilesResidente, circuitos, user, cortes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { obtenerPeriodoVigente, esMoroso } from '../utils';

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

  miPerfil: protectedProcedure.query(async ({ ctx }) => {
    return db.query.perfilesResidente.findFirst({
      where: (p, { eq }) => eq(p.userId, ctx.user.id),
      with: { circuito: true },
    });
  }),

  listarCircuitos: protectedProcedure.query(async () => {
    return db.select().from(circuitos);
  }),

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

  // ✅ Cambiar rol con validación mejorada
  cambiarRol: roleProcedure('admin')
    .input(z.object({
      userId: z.string().min(1, 'userId es requerido'),
      rol: z.enum(['admin', 'representante', 'operador_pozo', 'cuadrilla_cortes', 'residente']),
    }))
    .mutation(async ({ input }) => {
      console.log('📝 Cambiando rol - input:', JSON.stringify(input, null, 2));
      
      const usuario = await db.query.user.findFirst({
        where: (u, { eq }) => eq(u.id, input.userId),
      });
      if (!usuario) {
        console.error(`❌ Usuario con ID ${input.userId} no encontrado`);
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });
      }
      
      console.log(`✅ Usuario: ${usuario.email} - rol actual: ${usuario.role} -> nuevo: ${input.rol}`);
      
      await db.update(user)
        .set({ role: input.rol })
        .where(eq(user.id, input.userId));
      
      return { ok: true };
    }),

  listarPersonal: roleProcedure('admin').query(async () => {
    return db.query.user.findMany({
      where: (u, { ne }) => ne(u.role, 'residente'),
      orderBy: (u, { desc }) => [desc(u.createdAt)],
    });
  }),
});