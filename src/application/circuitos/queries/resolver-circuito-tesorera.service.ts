import type { CircuitoRepository } from '../../ports/circuito.repository';
import type { ResidenteRepository } from '../../ports/residente.repository';

type CircuitoResuelto = {
  id: string;
  nombre: string;
  montoMensual: string;
  montoReconexion: string;
  mercadoPagoCollectorId: string | null;
  representanteId: string | null;
  activo: boolean;
};

type Deps = {
  circuitoRepo: CircuitoRepository;
  residenteRepo: ResidenteRepository;
};

export class ResolverCircuitoTesoreraService {
  constructor(private readonly deps: Deps) {}

  /**
   * Finds the circuit assigned to a tesorera.
   *
   * Some tesoreras were assigned via the residente profile before the `tesoreraId`
   * column existed on `circuitos`. As a fallback, look up the circuit via the
   * residente profile and auto-assign it on `circuitos.tesorera_id`.
   */
  async execute(tesoreraId: string): Promise<CircuitoResuelto | null> {
    const { circuitoRepo, residenteRepo } = this.deps;

    let circuito = await circuitoRepo.findByTesorera(tesoreraId);
    if (circuito) return circuito as CircuitoResuelto;

    // Legacy fallback: locate circuit via residente profile
    const perfil = await residenteRepo.findByUserId(tesoreraId);
    if (!perfil?.circuito) return null;

    const circuitoId = perfil.circuito.id;
    await circuitoRepo.updateTesorera(circuitoId, tesoreraId);

    circuito = await circuitoRepo.findById(circuitoId);
    return (circuito as CircuitoResuelto) ?? null;
  }
}
