import type { PagoRepository, MetricasAdmin } from '@/src/application/ports/pago.repository';

type Deps = { pagoRepo: PagoRepository };

export class MetricasAdminHandler {
  constructor(private readonly deps: Deps) {}

  async execute(mes: number, anio: number): Promise<MetricasAdmin> {
    return this.deps.pagoRepo.getMetricasAdmin(mes, anio);
  }
}
