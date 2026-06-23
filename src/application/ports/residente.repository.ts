import type { EstadoAgua } from '@/src/domain/agua/state-machine';

export type ResidenteData = {
  id: string;
  userId: string;
  circuitoId: string;
  edificio: string;
  departamento: string;
  estadoAgua: EstadoAgua;
  creadoEn: Date | null;
};

export type CircuitoRef = {
  id: string;
  nombre: string;
  montoMensual: string;
  montoReconexion: string;
  mercadoPagoAccessToken: string | null;
  mercadoPagoCollectorId: string | null;
  representanteId: string | null;
  activo: boolean;
};

export type UsuarioRef = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type PagoRef = { mes: number; anio: number; estado: string | null };
export type CorteRef = { activo: boolean | null };

export type ResidenteConRelaciones = ResidenteData & {
  usuario?: UsuarioRef | null;
  circuito?: CircuitoRef | null;
  pagos?: PagoRef[];
  cortes?: CorteRef[];
};

export interface ResidenteRepository {
  findById(id: string): Promise<ResidenteData | null>;
  findByUserId(id: string): Promise<(ResidenteData & { circuito?: CircuitoRef | null }) | null>;
  findByCircuito(circuitoId: string): Promise<ResidenteConRelaciones[]>;
  findAll(): Promise<ResidenteConRelaciones[]>;
  findByEstado(estado: EstadoAgua): Promise<ResidenteConRelaciones[]>;
  findByCircuitoYEstado(circuitoId: string, estado: EstadoAgua): Promise<ResidenteConRelaciones[]>;
  create(data: Omit<ResidenteData, 'id' | 'creadoEn'>): Promise<ResidenteData>;
  updateEstado(id: string, estadoAgua: EstadoAgua): Promise<void>;
}
