export type UserRole = 'admin' | 'representante' | 'tesorera' | 'cuadrilla_cortes' | 'operador_pozo' | 'residente';

export type UserData = {
  id:    string;
  name:  string;
  email: string;
  role:  UserRole;
  fraccionamientoId?: string | null;
  fraccionamientoNombre?: string | null;
};

export type RepresentanteData = UserData & {
  fraccionamiento: { id: string; nombre: string | null } | null;
};

export type TesoreraData = UserData & {
  fraccionamiento: { id: string; nombre: string | null; mercadoPagoCollectorId: string | null } | null;
};

export type CreatePersonalInput = {
  nombre:   string;
  email:    string;
  password: string;
  role:     UserRole;
  /** Tenant is mandatory for every non-admin account. */
  fraccionamientoId: string;
};

export type UpdatePersonalInput = {
  nombre?: string;
  email?:  string;
  fraccionamientoId?: string | null;
};

export type CambiarRolInput = {
  userId:   string;
  nuevoRol: UserRole;
};

export type CambiarRolEnFraccionamientoInput = {
  userId:     string;
  nuevoRol:   'residente' | 'tesorera' | 'cuadrilla_cortes' | 'operador_pozo';
  fraccionamientoId: string;
};

export interface UserRepository {
  findById(id: string): Promise<UserData | null>;
  findByEmail(email: string): Promise<UserData | null>;
  create(input: CreatePersonalInput): Promise<string>;
  update(id: string, data: UpdatePersonalInput): Promise<void>;
  updatePassword(userId: string, hashedPassword: string): Promise<void>;
  updateRole(id: string, role: UserRole): Promise<void>;
  delete(id: string): Promise<void>;
  hasFinancialRecords(id: string): Promise<boolean>;

  // List queries
  listarRepresentantes(): Promise<RepresentanteData[]>;
  listarTesoreras(): Promise<TesoreraData[]>;
  listarNonResidente(): Promise<UserData[]>;

  // Atomic role transitions (DB transaction encapsulated internally)
  cambiarRol(input: CambiarRolInput): Promise<void>;
  cambiarRolEnFraccionamiento(input: CambiarRolEnFraccionamientoInput): Promise<void>;
}
