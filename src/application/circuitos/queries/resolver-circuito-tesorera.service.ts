import type { CircuitoRepository } from '../../ports/circuito.repository';

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
};

export class ResolverCircuitoTesoreraService {
  constructor(private readonly deps: Deps) {}

  async execute(tesoreraId: string): Promise<CircuitoResuelto | null> {
    const circuito = await this.deps.circuitoRepo.findByTesorera(tesoreraId);
    if (!circuito || circuito.tesoreraId !== tesoreraId) return null;
    return circuito as CircuitoResuelto;
  }
}
