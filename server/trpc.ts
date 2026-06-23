import { initTRPC, TRPCError } from '@trpc/server';
import { auth } from '@/lib/auth';
import { db } from '@/db';

async function verificarAccesoPorCircuito(userId: string, role?: string | null) {
  if (role === 'residente') {
    const perfil = await db.query.perfilesResidente.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
      with: { circuito: true },
    });
    if (perfil?.circuito && !perfil.circuito.activo) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Tu circuito esta inhabilitado. Contacta al administrador.' });
    }
    return perfil;
  }
  if (role === 'representante') {
    const circuito = await db.query.circuitos.findFirst({
      where: (c, { eq }) => eq(c.representanteId, userId),
    });
    if (circuito && !circuito.activo) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Tu circuito esta inhabilitado. Contacta al administrador.' });
    }
    return circuito;
  }
  return null;
}

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth.api.getSession({ headers: opts.headers });
  let user: any = session?.user ?? null;

  if (user) {
    // Buscar el rol en la tabla 'user' (no en la sesión)
    const userId = user.id;
    const dbUser = await db.query.user.findFirst({
      where: (u, { eq }) => eq(u.id, userId),
    });
    if (dbUser) {
      user = { ...user, role: dbUser.role };
    }
  }

  return { user };
};

const t = initTRPC.context<typeof createTRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  await verificarAccesoPorCircuito(ctx.user.id, (ctx.user as any).role);
  return next({ ctx: { user: ctx.user } });
});

export function roleProcedure(...roles: string[]) {
  return protectedProcedure.use(({ ctx, next }) => {
    const userRole = (ctx.user as any).role;
    if (!roles.includes(userRole)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes permisos' });
    }
    return next({ ctx });
  });
}
