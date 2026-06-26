import { cache } from 'react';
import { initTRPC, TRPCError } from '@trpc/server';
import { auth } from '@/lib/auth';
import { residenteRepo, circuitoRepo } from '@/src/infrastructure/db/repositories';
import {
  VerificarAccesoService,
  CircuitoInhabilitadoError,
} from '@/src/application/acceso/verificar-acceso.service';

// ── Shared auth types ──────────────────────────────────────────────────────────
// Re-export from domain port so routers can import UserRole from this file.
export type { UserRole } from '@/src/application/ports/user.repository';
import type { UserRole } from '@/src/application/ports/user.repository';

export type AuthUser = {
  id:            string;
  name:          string;
  email:         string;
  emailVerified: boolean;
  image?:        string | null;
  createdAt:     Date;
  updatedAt:     Date;
  role:          UserRole;
};

// ── Domain error → TRPCError mapper ───────────────────────────────────────────
// Throw from any router or handler to convert a known domain error to the
// correct HTTP status. Unknown errors are re-thrown for Sentry to capture.
export function mapDomainError(err: unknown): never {
  if (err instanceof TRPCError) throw err;

  if (err instanceof CircuitoInhabilitadoError) {
    throw new TRPCError({ code: 'FORBIDDEN', message: err.message });
  }

  // Known domain errors by conventional `code` property
  if (typeof err === 'object' && err !== null) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'NOT_FOUND')   throw new TRPCError({ code: 'NOT_FOUND',   message: e.message });
    if (e.code === 'FORBIDDEN')   throw new TRPCError({ code: 'FORBIDDEN',   message: e.message });
    if (e.code === 'BAD_REQUEST') throw new TRPCError({ code: 'BAD_REQUEST', message: e.message });
    if (e.code === 'CONFLICT')    throw new TRPCError({ code: 'CONFLICT',    message: e.message });
  }

  // Let the error propagate — Sentry will capture it as an unhandled error.
  throw err;
}

// ── Circuit access guard ───────────────────────────────────────────────────────
// Instantiated once at module load; React.cache() deduplicates within one
// HTTP request batch — the service call runs at most once per (userId, role) pair.
const accesService = new VerificarAccesoService({ residenteRepo, circuitoRepo });
const verificarAcceso = cache((userId: string, role: UserRole) =>
  accesService.execute(userId, role),
);

// ── Context ────────────────────────────────────────────────────────────────────
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth.api.getSession({ headers: opts.headers });
  if (!session?.user) return { user: null };

  const raw = session.user as Record<string, unknown>;
  const user: AuthUser = {
    id:            session.user.id,
    name:          session.user.name,
    email:         session.user.email,
    emailVerified: session.user.emailVerified,
    image:         session.user.image ?? null,
    createdAt:     session.user.createdAt,
    updatedAt:     session.user.updatedAt,
    role:          (raw.role as UserRole | null | undefined) ?? 'residente',
  };

  return { user };
};

// ── tRPC instance ──────────────────────────────────────────────────────────────
const t = initTRPC.context<typeof createTRPCContext>().create();

export const router          = t.router;
export const publicProcedure = t.procedure;

// ── Procedures ─────────────────────────────────────────────────────────────────
// Requires a session but NOT email verification — use for onboarding flows
// that run before the user has had a chance to click the verification link.
export const authenticatedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  if (!ctx.user.emailVerified && ctx.user.role !== 'admin') {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Verifica tu correo electrónico para continuar. Revisa tu bandeja de entrada.',
    });
  }
  try {
    await verificarAcceso(ctx.user.id, ctx.user.role);
  } catch (e) {
    mapDomainError(e);
  }
  return next({ ctx: { user: ctx.user } });
});

export function roleProcedure(...roles: UserRole[]) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!roles.includes(ctx.user.role)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes permisos' });
    }
    return next({ ctx });
  });
}
