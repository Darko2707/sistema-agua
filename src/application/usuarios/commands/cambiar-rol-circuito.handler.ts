import { logger } from '@/lib/logger';
import type { UserRepository } from '@/src/application/ports/user.repository';

export type CambiarRolCircuitoCommand = {
  actorId:    string;
  userId:     string;
  nuevoRol:   'residente' | 'tesorera' | 'cuadrilla_cortes';
  circuitoId: string;
};

type Deps = { userRepo: UserRepository };

export class CambiarRolEnCircuitoHandler {
  constructor(private deps: Deps) {}

  async execute(cmd: CambiarRolCircuitoCommand): Promise<void> {
    await this.deps.userRepo.cambiarRolEnCircuito({
      userId:     cmd.userId,
      nuevoRol:   cmd.nuevoRol,
      circuitoId: cmd.circuitoId,
    });
    logger.info('representante.rol.cambiado', { actorId: cmd.actorId, userId: cmd.userId, nuevoRol: cmd.nuevoRol });
  }
}
