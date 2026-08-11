import type { ResidenteRepository } from '../ports/residente.repository';
import type { CircuitoRepository } from '../ports/circuito.repository';
import type { UserRole } from '../ports/user.repository';

export class CircuitoInhabilitadoError extends Error {
  readonly code = 'FORBIDDEN' as const;
  constructor(message: string) {
    super(message);
    this.name = 'CircuitoInhabilitadoError';
  }
}

export class PerfilIncompletoError extends Error {
  readonly code = 'FORBIDDEN' as const;
  constructor() {
    super('Completa tu perfil antes de continuar.');
    this.name = 'PerfilIncompletoError';
  }
}

type Deps = {
  residenteRepo: ResidenteRepository;
  circuitoRepo:  CircuitoRepository;
};

export class VerificarAccesoService {
  constructor(private deps: Deps) {}

  async execute(userId: string, role: UserRole): Promise<void> {
    if (role === 'residente') {
      const perfil = await this.deps.residenteRepo.findByUserId(userId);
      if (!perfil) throw new PerfilIncompletoError();
      if (perfil?.circuito && !perfil.circuito.activo) {
        throw new CircuitoInhabilitadoError('Tu circuito esta inhabilitado. Contacta al administrador.');
      }
    } else if (role === 'representante') {
      const circuito = await this.deps.circuitoRepo.findByRepresentante(userId);
      if (circuito && !circuito.activo) {
        throw new CircuitoInhabilitadoError('Tu circuito esta inhabilitado. Contacta al administrador.');
      }
    }
    // admin, tesorera, cuadrilla_cortes: sin restricción de circuito
  }
}
