import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { donativoRepo } from '@/src/infrastructure/db/repositories';
import { DonativoRepositoryError } from '@/src/infrastructure/db/repositories/drizzle-donativo.repository';
import { router, roleProcedure } from '../trpc';

const periodSchema = z.object({
  mes: z.number().int().min(1).max(12),
  anio: z.number().int().min(2020).max(2100),
});

const periodsSchema = z.array(periodSchema).min(1).max(24).refine(
  periods => new Set(periods.map(period => `${period.anio}-${period.mes}`)).size === periods.length,
  'No repitas un periodo mensual',
);

const requestSchema = z.object({
  fraccionamientoId: z.string().uuid(),
  monto: z.number().finite().positive().max(1_000_000)
    .refine(amount => Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-7, 'El importe debe tener como máximo dos decimales'),
  periodos: periodsSchema,
});

function traducirError(error: unknown): never {
  if (error instanceof DonativoRepositoryError) {
    throw new TRPCError({ code: error.code, message: error.message });
  }
  throw error;
}

export const donativosRouter = router({
  previsualizar: roleProcedure('admin').input(requestSchema).query(async ({ input }) => {
    try {
      return await donativoRepo.previsualizar(input);
    } catch (error) {
      traducirError(error);
    }
  }),

  generar: roleProcedure('admin').input(requestSchema).mutation(async ({ ctx, input }) => {
    try {
      return await donativoRepo.generar(input, ctx.user.id);
    } catch (error) {
      traducirError(error);
    }
  }),
});
