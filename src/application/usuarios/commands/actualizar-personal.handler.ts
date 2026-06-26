import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import { encryptToken } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import type { UserRepository, UserRole } from '@/src/application/ports/user.repository';
import type { CircuitoRepository } from '@/src/application/ports/circuito.repository';

export type ActualizarPersonalCommand = {
  actorId:                 string;
  id:                      string;
  role:                    UserRole;
  nombre?:                 string;
  email?:                  string;
  password?:               string;
  circuitoId?:             string | null;
  mercadoPagoAccessToken?: string;
  mercadoPagoCollectorId?: string;
};

type Deps = { userRepo: UserRepository; circuitoRepo: CircuitoRepository };

export class ActualizarPersonalHandler {
  constructor(private deps: Deps) {}

  async execute(cmd: ActualizarPersonalCommand): Promise<void> {
    const { userRepo, circuitoRepo } = this.deps;

    await userRepo.update(cmd.id, { nombre: cmd.nombre, email: cmd.email });

    if (cmd.password) {
      const hashed = await bcrypt.hash(cmd.password, 10);
      await userRepo.updatePassword(cmd.id, hashed);
    }

    if (cmd.circuitoId !== undefined) {
      if (cmd.role === 'representante') {
        await circuitoRepo.clearRepresentanteByUserId(cmd.id);
        if (cmd.circuitoId) {
          const mpAccessToken = cmd.mercadoPagoAccessToken
            ? encryptToken(cmd.mercadoPagoAccessToken) : undefined;
          await circuitoRepo.updateRepresentanteWithMp(cmd.circuitoId, cmd.id, {
            encryptedAccessToken: mpAccessToken,
            collectorId:          cmd.mercadoPagoCollectorId,
          });
        }
      } else if (cmd.role === 'tesorera') {
        await circuitoRepo.clearTesoreraByUserId(cmd.id);
        if (cmd.circuitoId) {
          const mpAccessToken = cmd.mercadoPagoAccessToken
            ? encryptToken(cmd.mercadoPagoAccessToken) : undefined;
          await circuitoRepo.updateTesoreraWithMp(cmd.circuitoId, cmd.id, {
            encryptedAccessToken: mpAccessToken,
            collectorId:          cmd.mercadoPagoCollectorId,
          });
        }
      }
    }

    logger.info(`admin.${cmd.role}.actualizado`, { actorId: cmd.actorId, userId: cmd.id });
  }
}
