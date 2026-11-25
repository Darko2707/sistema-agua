export class LimiteViviendasAlcanzadoError extends Error {
  constructor(public readonly limite: number) {
    super(`Se ha alcanzado el límite máximo de viviendas contratadas (${limite}) para este fraccionamiento. Contacta a la administración para ampliar tu plan.`);
    this.name = 'LimiteViviendasAlcanzadoError';
  }
}
