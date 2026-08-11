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

  async execute(tesoreraId: string): Promise<CircuitoResuelto | null> {
    const { circuitoRepo, residenteRepo } = this.deps;

    let circuito = await circuitoRepo.findByTesorera(tesoreraId);
    if (circuito) return circuito as CircuitoResuelto;

    // Fallback de datos historicos: permite leer el circuito asociado al perfil,
    // pero nunca reasigna tesoreras desde una consulta de lectura.
    const perfil = await residenteRepo.findByUserId(tesoreraId);
    if (!perfil?.circuito) return null;

    const circuitoId = perfil.circuito.id;
    circuito = await circuitoRepo.findById(circuitoId);
    if (!circuito || (circuito.tesoreraId && circuito.tesoreraId !== tesoreraId)) return null;
    return circuito as CircuitoResuelto;
  }
}
