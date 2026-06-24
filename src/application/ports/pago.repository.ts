export type PagoData = {
  id: string;
  perfilId: string;
  circuitoId: string | null;
  representanteId: string | null;
  mes: number;
  anio: number;
  monto: string;
  montoBase: string | null;
  iva: string | null;
  comisionMercadoPago: string | null;
  retencionIsr: string | null;
  retencionIva: string | null;
  montoNetoRepresentante: string | null;
  mercadoPagoPaymentId: string | null;
  mercadoPagoCollectorId: string | null;
  estado: 'pendiente' | 'pagado' | 'vencido' | null;
  metodo: string | null;
  folio: string | null;
  esReconexion: boolean | null;
  fechaPago: Date | null;
  creadoEn: Date | null;
};

export type CrearPagoInput = {
  perfilId: string;
  circuitoId: string;
  representanteId: string | null;
  mes: number;
  anio: number;
  monto: string;
  montoBase: string;
  iva: string;
  comisionMercadoPago: string;
  retencionIsr: string;
  retencionIva: string;
  montoNetoRepresentante: string;
  mercadoPagoPaymentId?: string;
  mercadoPagoCollectorId?: string | null;
  estado: 'pagado';
  metodo: string;
  folio: string;
  esReconexion: boolean;
  fechaPago: Date;
};

export type CorteData = {
  id: string;
  perfilId: string;
  trabajadorId: string | null;
  motivo: string;
  activo: boolean | null;
  fechaCorte: Date | null;
  fechaReconexion: Date | null;
  reconectadoPor: string | null;
};

export interface PagoRepository {
  findByPerfilYMes(perfilId: string, mes: number, anio: number): Promise<PagoData | null>;
  findByPerfilId(perfilId: string, limit?: number): Promise<PagoData[]>;
  findAllPagadosPorMes(mes: number, anio: number): Promise<PagoData[]>;
  findPagadosByMes(mes: number, anio: number): Promise<Array<{ perfilId: string }>>;
  createWithLock(perfilId: string, input: CrearPagoInput): Promise<PagoData>;
  findCorteActivo(perfilId: string): Promise<CorteData | null>;
  crearCorte(data: { perfilId: string; trabajadorId: string; motivo: string }): Promise<CorteData>;
  cerrarCorte(corteId: string, fecha: Date, reconectadoPor?: string): Promise<void>;
  crearTicket(pagoId: string, folio: string): Promise<void>;
}
