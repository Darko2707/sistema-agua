import { TRPCError } from '@trpc/server';
import { DIA_CORTE } from '@/src/domain/pagos/constants';
import type { ResidenteRepository } from '../../ports/residente.repository';
import type { CircuitoRepository } from '../../ports/circuito.repository';
import { logger } from '@/lib/logger';

export type CrearPerfilCommand = {
  userId: string;
  telefono: string;
  sexo: 'masculino' | 'femenino' | 'otro';
  tenencia: 'propietario' | 'inquilino';
  circuitoId: string;
  edificio: string;
  departamento: string;
  nombrePropietario?: string;
  telefonoPropietario?: string;
};

type Deps = {
  residenteRepo: ResidenteRepository;
  circuitoRepo: CircuitoRepository;
};

export class CrearPerfilHandler {
  constructor(private deps: Deps) {}

  async execute(cmd: CrearPerfilCommand) {
    const { residenteRepo, circuitoRepo } = this.deps;

    const circuito = await circuitoRepo.findById(cmd.circuitoId);
    if (!circuito?.activo) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Este circuito está inhabilitado temporalmente.' });
    }

    const existente = await residenteRepo.findByUserId(cmd.userId);
    if (existente) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ya tienes un perfil registrado' });
    }

    const estadoInicial = new Date().getDate() > DIA_CORTE ? 'pendiente_corte' : 'activo';
    logger.info('usuario.perfil.creado', { userId: cmd.userId, estadoInicial });

    return residenteRepo.create({
      userId:              cmd.userId,
      circuitoId:          cmd.circuitoId,
      edificio:            cmd.edificio,
      departamento:        cmd.departamento,
      estadoAgua:          estadoInicial,
      telefono:            cmd.telefono,
      sexo:                cmd.sexo,
      tenencia:            cmd.tenencia,
      nombrePropietario:   cmd.nombrePropietario ?? null,
      telefonoPropietario: cmd.telefonoPropietario ?? null,
    });
  }
}
