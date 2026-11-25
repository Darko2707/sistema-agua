import { z } from 'zod';
import { notasOperativasRepo } from '@/src/infrastructure/db/repositories/drizzle-notas-operativas.repository';
import { protectedProcedure, router } from '../trpc';
import { TRPCError } from '@trpc/server';

function formatRolAutor(role: string): string {
  switch (role) {
    case 'admin': return 'Admin';
    case 'representante': return 'Representante';
    case 'tesorera': return 'Tesorero';
    case 'cuadrilla_cortes': return 'Cuadrilla';
    case 'operador_pozo': return 'Operador Pozo';
    default: return role;
  }
}

export const notasOperativasRouter = router({
  listar: protectedProcedure
    .input(z.object({
      fraccionamientoId: z.string().uuid().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      if (ctx.user.role === 'residente') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Los residentes no tienen acceso a notas operativas' });
      }

      if (ctx.user.role !== 'admin' && input?.fraccionamientoId && input.fraccionamientoId !== ctx.user.fraccionamientoId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes acceso a notas operativas de otro fraccionamiento' });
      }

      const tenantId = ctx.user.role === 'admin'
        ? (input?.fraccionamientoId ?? ctx.user.fraccionamientoId)
        : ctx.user.fraccionamientoId;

      if (!tenantId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Fraccionamiento requerido' });
      }

      return await notasOperativasRepo.listarPorFraccionamiento(tenantId);
    }),

  crear: protectedProcedure
    .input(z.object({
      contenido: z.string().trim().min(1, 'El contenido de la nota no puede estar vacío').max(2000),
      fraccionamientoId: z.string().uuid().optional(),
      rolAutor: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role === 'residente') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Los residentes no tienen acceso a notas operativas' });
      }

      if (ctx.user.role !== 'admin' && input.fraccionamientoId && input.fraccionamientoId !== ctx.user.fraccionamientoId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'No puedes crear notas operativas en otro fraccionamiento' });
      }

      const tenantId = ctx.user.role === 'admin'
        ? (input.fraccionamientoId ?? ctx.user.fraccionamientoId)
        : ctx.user.fraccionamientoId;

      if (!tenantId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Fraccionamiento requerido' });
      }

      const rolAutor = input.rolAutor ?? formatRolAutor(ctx.user.role);

      return await notasOperativasRepo.crear({
        fraccionamientoId: tenantId,
        autorId: ctx.user.id,
        rolAutor,
        contenido: input.contenido,
      });
    }),
});
