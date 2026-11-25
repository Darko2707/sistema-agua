export type NotaOperativaData = {
  id: string;
  fraccionamientoId: string;
  autorId: string;
  rolAutor: string;
  contenido: string;
  createdAt: Date;
  autorNombre?: string;
  autorEmail?: string;
};

export type CrearNotaOperativaInput = {
  fraccionamientoId: string;
  autorId: string;
  rolAutor: string;
  contenido: string;
};

export interface NotasOperativasRepository {
  listarPorFraccionamiento(fraccionamientoId: string): Promise<NotaOperativaData[]>;
  crear(input: CrearNotaOperativaInput): Promise<NotaOperativaData>;
}
