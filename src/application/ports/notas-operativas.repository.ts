export type NotaOperativaData = {
  id: string;
  fraccionamientoId: string;
  autorId: string;
  rolAutor: string;
  rolDestino: string | null;
  contenido: string;
  createdAt: Date;
  autorNombre?: string;
  autorEmail?: string;
};

export type CrearNotaOperativaInput = {
  fraccionamientoId: string;
  autorId: string;
  rolAutor: string;
  rolDestino: string | null;
  contenido: string;
};

export interface NotasOperativasRepository {
  listarPorFraccionamiento(fraccionamientoId: string, rolConsulta?: string): Promise<NotaOperativaData[]>;
  crear(input: CrearNotaOperativaInput): Promise<NotaOperativaData>;
}
