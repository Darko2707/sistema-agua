import { logger } from '@/lib/logger';
import type { UserRepository, UserRole } from '@/src/application/ports/user.repository';

export type CambiarRolCommand = {
  actorId: string;
  userId:  string;
  nuevoRol: UserRole;
};

type Deps = { userRepo: UserRepository };

export class CambiarRolHandler {
  constructor(private deps: Deps) {}

  async execute(cmd: CambiarRolCommand): Promise<void> {
    await this.deps.userRepo.cambiarRol({ userId: cmd.userId, nuevoRol: cmd.nuevoRol });
    logger.info('usuario.rol.cambiado', { actorId: cmd.actorId, userId: cmd.userId, nuevoRol: cmd.nuevoRol });
  }
}
