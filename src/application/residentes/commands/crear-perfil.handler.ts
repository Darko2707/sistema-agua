import { TRPCError } from '@trpc/server';
import type { ResidenteRepository } from '../../ports/residente.repository';
import type { CircuitoRepository } from '../../ports/circuito.repository';
import { logger } from '@/lib/logger';
import {
  normalizarVivienda,
  ViviendaInvalidaError,
} from '@/src/domain/residente/vivienda';

const VIVIENDA_UNIQUE_CONSTRAINT = 'uq_perfiles_residente_ubicacion';
const VIVIENDA_OCUPADA_MESSAGE =
  'Ese edificio y departamento ya tienen una cuenta registrada en este circuito. Verifica los datos o solicita apoyo a la administracion.';

function esConflictoDeVivienda(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const databaseError = current as {
      code?: string;
      constraint?: string;
      message?: string;
      cause?: unknown;
    };
    if (
      databaseError.code === '23505'
      && (
        databaseError.constraint === VIVIENDA_UNIQUE_CONSTRAINT
        || databaseError.message?.includes(VIVIENDA_UNIQUE_CONSTRAINT)
      )
    ) {
      return true;
    }
    current = databaseError.cause;
  }

  return false;
}

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

    let vivienda: ReturnType<typeof normalizarVivienda>;
    try {
      vivienda = normalizarVivienda(cmd.edificio, cmd.departamento);
    } catch (error) {
      if (error instanceof ViviendaInvalidaError) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
      }
      throw error;
    }

    const circuito = await circuitoRepo.findById(cmd.circuitoId);
    if (!circuito?.activo) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Este circuito está inhabilitado temporalmente.' });
    }

    const existente = await residenteRepo.findByUserId(cmd.userId);
    if (existente) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ya tienes un perfil registrado' });
    }

    const estadoInicial = 'activo';
    try {
      const perfil = await residenteRepo.create({
        userId:              cmd.userId,
        circuitoId:          cmd.circuitoId,
        edificio:            vivienda.edificio,
        departamento:        vivienda.departamento,
        estadoAgua:          estadoInicial,
        telefono:            cmd.telefono,
        sexo:                cmd.sexo,
        tenencia:            cmd.tenencia,
        nombrePropietario:   cmd.nombrePropietario ?? null,
        telefonoPropietario: cmd.telefonoPropietario ?? null,
      });
      logger.info('usuario.perfil.creado', { userId: cmd.userId, estadoInicial });
      return perfil;
    } catch (error) {
      if (esConflictoDeVivienda(error)) {
        throw new TRPCError({ code: 'CONFLICT', message: VIVIENDA_OCUPADA_MESSAGE });
      }
      throw error;
    }
  }
}
