export type CircuitoData = {
  id: string;
  nombre: string;
  representanteId: string | null;
  montoMensual: string;
  montoReconexion: string;
  mercadoPagoAccessToken: string | null;
  mercadoPagoCollectorId: string | null;
  activo: boolean;
};

export interface CircuitoRepository {
  findById(id: string): Promise<CircuitoData | null>;
  findByRepresentante(representanteId: string): Promise<CircuitoData | null>;
  findAll(): Promise<CircuitoData[]>;
  updateActivo(id: string, activo: boolean): Promise<void>;
  updateMontos(id: string, montoMensual: string, montoReconexion: string): Promise<void>;
  updateRepresentante(id: string, representanteId: string | null): Promise<void>;
}
