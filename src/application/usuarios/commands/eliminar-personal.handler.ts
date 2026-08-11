import { TRPCError } from '@trpc/server';
import { logger } from '@/lib/logger';
import type { UserRepository, UserRole } from '@/src/application/ports/user.repository';
import type { CircuitoRepository } from '@/src/application/ports/circuito.repository';

export type EliminarPersonalCommand = {
  actorId: string;
  id:      string;
  role:    UserRole;
};

type Deps = { userRepo: UserRepository; circuitoRepo: CircuitoRepository };

export class EliminarPersonalHandler {
  constructor(private deps: Deps) {}

  async execute(cmd: EliminarPersonalCommand): Promise<void> {
    const { userRepo, circuitoRepo } = this.deps;

    const target = await userRepo.findById(cmd.id);
    if (!target) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });
    }
    if (target.role !== cmd.role) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'El usuario no corresponde al tipo de personal indicado' });
    }

    const tieneRegistros = await userRepo.hasFinancialRecords(cmd.id);
    if (tieneRegistros) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'No se puede eliminar: el usuario tiene ingresos o gastos registrados. Desasígnalo del circuito en su lugar.',
      });
    }

    if (cmd.role === 'representante') {
      await circuitoRepo.clearRepresentanteByUserId(cmd.id);
    } else if (cmd.role === 'tesorera') {
      await circuitoRepo.clearTesoreraByUserId(cmd.id);
    }

    await userRepo.delete(cmd.id);
    logger.info(`admin.${cmd.role}.eliminado`, { actorId: cmd.actorId, userId: cmd.id });
  }
}
