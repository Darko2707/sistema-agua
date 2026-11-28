import { z } from 'zod';
import { notasOperativasRepo } from '@/src/infrastructure/db/repositories/drizzle-notas-operativas.repository';
import { protectedProcedure, router } from '../trpc';
import { TRPCError } from '@trpc/server';

const OPERATIONAL_ROLES = ['admin', 'representante', 'tesorera', 'cuadrilla_cortes'] as const;
type OperationalRole = (typeof OPERATIONAL_ROLES)[number];

const rolOperativoSchema = z.enum(OPERATIONAL_ROLES);

function formatRolAutor(role: string): string {
  switch (role) {
    case 'admin': return 'Admin';
    case 'representante': return 'Representante';
    case 'tesorera': return 'Tesorero';
    case 'cuadrilla_cortes': return 'Cuadrilla';
    default: return role;
  }
}

function resolveOperationalContext(
  user: { role: string; roles?: string[]; fraccionamientoId?: string | null },
  panelRol?: OperationalRole,
): { activeRole: OperationalRole; isAdmin: boolean } {
  const userRoles = new Set([user.role, ...(user.roles ?? [])]);
  const isAdmin = userRoles.has('admin');
  const firstOperational = OPERATIONAL_ROLES.find((r) => userRoles.has(r));

  if (!firstOperational) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Los residentes no tienen acceso a notas operativas' });
  }

  if (panelRol) {
    if (!userRoles.has(panelRol)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes permiso para acceder a notas de ese rol' });
    }
    return { activeRole: panelRol, isAdmin };
  }

  const primaryIsOperational = (OPERATIONAL_ROLES as readonly string[]).includes(user.role);
  return {
    activeRole: primaryIsOperational ? (user.role as OperationalRole) : firstOperational,
    isAdmin,
  };
}

export const notasOperativasRouter = router({
  listar: protectedProcedure
    .input(z.object({
      fraccionamientoId: z.string().uuid().optional(),
      panelRol: rolOperativoSchema.optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const { activeRole, isAdmin } = resolveOperationalContext(ctx.user, input?.panelRol);

      if (!isAdmin && input?.fraccionamientoId && input.fraccionamientoId !== ctx.user.fraccionamientoId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes acceso a notas operativas de otro fraccionamiento' });
      }

      const tenantId = isAdmin
        ? (input?.fraccionamientoId ?? ctx.user.fraccionamientoId)
        : ctx.user.fraccionamientoId;

      if (!tenantId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Fraccionamiento requerido' });
      }

      return await notasOperativasRepo.listarPorFraccionamiento(tenantId, activeRole);
    }),

  crear: protectedProcedure
    .input(z.object({
      contenido: z.string().trim().min(1, 'El contenido de la nota no puede estar vacío').max(2000),
      fraccionamientoId: z.string().uuid().optional(),
      rolAutor: z.string().optional(),
      alcance: z.enum(['global', 'rol']).default('rol'),
      panelRol: rolOperativoSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { activeRole, isAdmin } = resolveOperationalContext(ctx.user, input.panelRol);

      if (!isAdmin && input.fraccionamientoId && input.fraccionamientoId !== ctx.user.fraccionamientoId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'No puedes crear notas operativas en otro fraccionamiento' });
      }

      const tenantId = isAdmin
        ? (input.fraccionamientoId ?? ctx.user.fraccionamientoId)
        : ctx.user.fraccionamientoId;

      if (!tenantId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Fraccionamiento requerido' });
      }

      const rolAutor = input.rolAutor ?? formatRolAutor(activeRole);
      const rolDestino = input.alcance === 'global' ? null : activeRole;

      return await notasOperativasRepo.crear({
        fraccionamientoId: tenantId,
        autorId: ctx.user.id,
        rolAutor,
        rolDestino,
        contenido: input.contenido,
      });
    }),
});
