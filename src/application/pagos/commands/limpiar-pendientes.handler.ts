import type { PagoRepository } from '@/src/application/ports/pago.repository';

const VENTANA_HORAS = 72;

type Deps = { pagoRepo: PagoRepository };

export type LimpiarPendientesResult = {
  marcadosVencidos: number;
  antes: string;
};

export class LimpiarPendientesHandler {
  constructor(private deps: Deps) {}

  async execute(): Promise<LimpiarPendientesResult> {
    const antes = new Date(Date.now() - VENTANA_HORAS * 60 * 60 * 1000);
    const marcadosVencidos = await this.deps.pagoRepo.marcarPendientesVencidos(antes);
    return { marcadosVencidos, antes: antes.toISOString() };
  }
}
