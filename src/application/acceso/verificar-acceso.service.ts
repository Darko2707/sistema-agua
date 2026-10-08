import type { ResidenteRepository } from '../ports/residente.repository';
import type { UserRole } from '../ports/user.repository';

export class PerfilIncompletoError extends Error {
  readonly code = 'FORBIDDEN' as const;
  constructor() {
    super('Completa tu perfil antes de continuar.');
    this.name = 'PerfilIncompletoError';
  }
}

export class RolNoConfiguradoError extends Error {
  readonly code = 'FORBIDDEN' as const;
  constructor() {
    super('Tu rol no tiene un espacio de trabajo configurado. Contacta al administrador.');
    this.name = 'RolNoConfiguradoError';
  }
}

type Deps = {
  residenteRepo: ResidenteRepository;
};

export class VerificarAccesoService {
  constructor(private deps: Deps) {}

  async execute(userId: string, role: UserRole): Promise<void> {
    // Fail closed for legacy roles that remain in the database enum but do not
    // have a defined set of capabilities or a dedicated workspace.
    if (role === 'operador_pozo') throw new RolNoConfiguradoError();

    if (role === 'residente') {
      const perfil = await this.deps.residenteRepo.findByUserId(userId);
      if (!perfil) throw new PerfilIncompletoError();
    }
    // admin, tesorera, cuadrilla_cortes: sin restricción de circuito
  }
}
