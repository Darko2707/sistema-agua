import type { PushNotificationInput } from './push-notification';

export type MetodoPago = 'efectivo' | 'transferencia' | 'mercado_pago';

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
  metodo: MetodoPago | null;
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
  metodo: MetodoPago;
  folio: string;
  esReconexion: boolean;
  fechaPago: Date;
};

export type CrearPagoAuditInput = {
  actorId: string;
  accion: 'pago.manual.representante';
  metodo: 'efectivo' | 'transferencia';
};

export type CrearPagosMercadoPagoBatchInput = {
  perfilId: string;
  circuitoId: string;
  paymentIntentReference?: string;
  mercadoPagoPaymentId: string;
  pagos: CrearPagoInput[];
  pushNotification: PushNotificationInput;
};

export type CrearPagosMercadoPagoBatchResult = {
  pagos: PagoData[];
  yaRegistrado: boolean;
};

export type CrearPagosManualBatchInput = {
  perfilId: string;
  pagos: CrearPagoInput[];
  politica:
    | { tipo: 'tesorera_escalonada' }
    | { tipo: 'admin_retroactivo' };
  actualizarEstadoAgua: boolean;
  pushNotification: PushNotificationInput;
  auditoria: {
    actorId: string;
    accion: 'pago.manual.tesorera' | 'pago.retroactivo.admin';
    metodo: 'efectivo' | 'transferencia';
  };
};

export type CrearPagosManualBatchResult = {
  pagos: PagoData[];
  omitidos: Array<{ mes: number; anio: number }>;
};

export type CorteData = {
  id: string;
  perfilId: string;
  trabajadorId: string;
  motivo: string;
  activo: boolean | null;
  fechaCorte: Date | null;
  fechaReconexion: Date | null;
  reconectadoPor: string | null;
};

export type MetricasDia = {
  fecha: string; // ISO date string YYYY-MM-DD
  cantidad: number;
  monto: number;
};

export type MetricasAdmin = {
  pagosPorDia: MetricasDia[];
  revenueMes: number;
  totalPagadosMes: number;
  totalResidentes: number;
  morosidadPct: number;
  reconexionesMes: number;
  porCircuito: Array<{
    circuitoId: string;
    nombre: string;
    totalRecaudado: number;
    pagosRecibidos: number;
    residentesAlCorriente: number;
    residentesConAdeudos: number;
    montoPendientePorCobrar: number;
    comisionesOnline: number;
  }>;
};

export interface PagoRepository {
  findByPerfilYMes(perfilId: string, mes: number, anio: number): Promise<PagoData | null>;
  findByPerfilId(perfilId: string, limit?: number): Promise<PagoData[]>;
  findAllPagadosPorMes(mes: number, anio: number): Promise<PagoData[]>;
  findPagadosByMes(mes: number, anio: number): Promise<Array<{ perfilId: string }>>;
  createWithLock(
    perfilId: string,
    input: CrearPagoInput,
    pushNotification?: PushNotificationInput,
    audit?: CrearPagoAuditInput,
  ): Promise<PagoData>;
  createMercadoPagoBatchWithLock(
    input: CrearPagosMercadoPagoBatchInput,
  ): Promise<CrearPagosMercadoPagoBatchResult>;
  createManualBatchWithLock(
    input: CrearPagosManualBatchInput,
  ): Promise<CrearPagosManualBatchResult>;
  findCorteActivo(perfilId: string): Promise<CorteData | null>;
  crearCorte(data: { perfilId: string; trabajadorId: string; motivo: string }): Promise<CorteData>;
  cerrarCorte(corteId: string, fecha: Date, reconectadoPor?: string): Promise<void>;
  crearTicket(pagoId: string, folio: string): Promise<void>;
  marcarPendientesVencidos(antes: Date): Promise<number>;
  getMetricasAdmin(mes: number, anio: number): Promise<MetricasAdmin>;
}
