import { TRPCError } from '@trpc/server';
import { encryptToken } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { hashAccountPassword } from '@/lib/password';
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

    const target = await userRepo.findById(cmd.id);
    if (!target) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });
    }
    if (target.role !== cmd.role) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'El usuario no corresponde al tipo de personal indicado' });
    }

    // Validate the target circuit before changing profile data. A failed
    // reassignment must not persist unrelated edits.
    if (cmd.circuitoId) {
      const circuitoDestinoValidado = await circuitoRepo.findById(cmd.circuitoId);
      if (!circuitoDestinoValidado?.fraccionamientoId || !circuitoDestinoValidado.activo) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El circuito destino no existe o no estÃ¡ activo' });
      }
    }

    await userRepo.update(cmd.id, { nombre: cmd.nombre, email: cmd.email });

    if (cmd.password) {
      const hashed = await hashAccountPassword(cmd.password);
      await userRepo.updatePassword(cmd.id, hashed);
    }

    if (cmd.circuitoId !== undefined && circuitoRepo.assignPersonalWithUser && (cmd.role === 'representante' || cmd.role === 'tesorera')) {
      const circuitoDestino = cmd.circuitoId ? await circuitoRepo.findById(cmd.circuitoId) : null;
      const mpAccessToken = cmd.mercadoPagoAccessToken
        ? encryptToken(cmd.mercadoPagoAccessToken) : undefined;
      await circuitoRepo.assignPersonalWithUser({
        userId: cmd.id,
        role: cmd.role,
        circuitoId: cmd.circuitoId,
        fraccionamientoId: circuitoDestino?.fraccionamientoId ?? null,
        encryptedAccessToken: mpAccessToken,
        collectorId: cmd.mercadoPagoCollectorId,
      });
    } else if (cmd.circuitoId !== undefined) {
      const circuitoDestino = cmd.circuitoId ? await circuitoRepo.findById(cmd.circuitoId) : null;
      if (cmd.circuitoId && (!circuitoDestino?.fraccionamientoId || !circuitoDestino.activo)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El circuito destino no existe o está inactivo' });
      }
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
      if (circuitoDestino?.fraccionamientoId) {
        await userRepo.update(cmd.id, { fraccionamientoId: circuitoDestino.fraccionamientoId });
      }
    }

    logger.info(`admin.${cmd.role}.actualizado`, { actorId: cmd.actorId, userId: cmd.id });
  }
}
