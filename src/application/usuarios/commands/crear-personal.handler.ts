import { TRPCError } from '@trpc/server';
import { encryptToken } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import type { UserRepository, UserRole } from '@/src/application/ports/user.repository';
import type { CircuitoRepository } from '@/src/application/ports/circuito.repository';

export type CrearPersonalCommand = {
  actorId:                string;
  nombre:                 string;
  email:                  string;
  password:               string;
  role:                   UserRole;
  circuitoId?:            string;
  mercadoPagoAccessToken?: string;
  mercadoPagoCollectorId?: string;
};

type Deps = { userRepo: UserRepository; circuitoRepo: CircuitoRepository };

export class CrearPersonalHandler {
  constructor(private deps: Deps) {}

  async execute(cmd: CrearPersonalCommand): Promise<string> {
    const { userRepo, circuitoRepo } = this.deps;

    const existe = await userRepo.findByEmail(cmd.email);
    if (existe) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ya existe un usuario con ese correo' });

    if (cmd.role === 'admin') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'El administrador global no se crea desde este flujo' });
    }
    if (!cmd.circuitoId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Debes asignar un circuito al personal' });
    }
    const circuito = await circuitoRepo.findById(cmd.circuitoId);
    if (!circuito?.fraccionamientoId || !circuito.activo) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'El circuito no tiene fraccionamiento asignado o esta inactivo' });
    }

    const mpAccessToken = cmd.mercadoPagoAccessToken
      ? encryptToken(cmd.mercadoPagoAccessToken) : undefined;
    const userId = userRepo.createWithCircuit
      ? await userRepo.createWithCircuit({
          nombre: cmd.nombre,
          email: cmd.email,
          password: cmd.password,
          role: cmd.role,
          fraccionamientoId: circuito.fraccionamientoId,
          circuitoId: cmd.circuitoId,
          encryptedAccessToken: mpAccessToken,
          collectorId: cmd.mercadoPagoCollectorId,
        })
      : await userRepo.create({
          nombre: cmd.nombre,
          email: cmd.email,
          password: cmd.password,
          role: cmd.role,
          fraccionamientoId: circuito.fraccionamientoId,
        });

    // Compatibility fallback for test/legacy repositories without the atomic method.
    if (!userRepo.createWithCircuit && cmd.role === 'representante') {
      await circuitoRepo.updateRepresentanteWithMp(cmd.circuitoId, userId, {
        encryptedAccessToken: mpAccessToken,
        collectorId: cmd.mercadoPagoCollectorId,
      });
    } else if (!userRepo.createWithCircuit && cmd.role === 'tesorera') {
      await circuitoRepo.updateTesoreraWithMp(cmd.circuitoId, userId, {
        encryptedAccessToken: mpAccessToken,
        collectorId: cmd.mercadoPagoCollectorId,
      });
    }

    logger.info(`admin.${cmd.role}.creado`, { actorId: cmd.actorId, userId });
    return userId;
  }
}
