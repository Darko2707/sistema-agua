import { TRPCError } from '@trpc/server';

type Role = 'admin' | 'representante' | 'cuadrilla_cortes' | 'residente';
type AuthUser = { id: string; role?: string };

export function requireRole(user: AuthUser | null, ...roles: Role[]): asserts user is AuthUser {
  if (!user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No autenticado' });
  }
  const userRole = (user.role ?? 'residente') as Role;
  if (!roles.includes(userRole)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Se requiere rol: ${roles.join(' o ')}`,
    });
  }
}

export function requireAuth(user: AuthUser | null): asserts user is AuthUser {
  if (!user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No autenticado' });
  }
}
