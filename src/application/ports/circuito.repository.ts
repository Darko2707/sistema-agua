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

export type MpFields = {
  encryptedAccessToken?: string;
  collectorId?:          string;
};

export interface CircuitoRepository {
  findById(id: string): Promise<CircuitoData | null>;
  findByRepresentante(representanteId: string): Promise<CircuitoData | null>;
  findByTesorera(tesoreraId: string): Promise<CircuitoData | null>;
  findAll(): Promise<CircuitoData[]>;
  findActivos(): Promise<Pick<CircuitoData, 'id' | 'nombre' | 'activo' | 'representanteId'>[]>;
  updateActivo(id: string, activo: boolean): Promise<void>;
  updateMontos(id: string, montoMensual: string, montoReconexion: string): Promise<void>;
  updateRepresentante(id: string, representanteId: string | null): Promise<void>;
  updateTesorera(id: string, tesoreraId: string | null): Promise<void>;
  updateRepresentanteWithMp(id: string, representanteId: string, mp: MpFields): Promise<void>;
  updateTesoreraWithMp(id: string, tesoreraId: string, mp: MpFields): Promise<void>;
  clearRepresentanteByUserId(userId: string): Promise<void>;
  clearTesoreraByUserId(userId: string): Promise<void>;
}
