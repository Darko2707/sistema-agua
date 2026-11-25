import type { PushNotificationInput } from './push-notification';

export type MetodoPago = 'efectivo' | 'transferencia' | 'mercado_pago';

export type PagoData = {
  id: string;
  perfilId: string;
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
  fraccionamientoId?: string;
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
  fraccionamientoId?: string;
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
    accion: 'pago.manual.tesorera' | 'pago.retroactivo.admin' | 'pago.transferencia.aprobado';
    metodo: 'efectivo' | 'transferencia';
  };
  aprobarComprobante?: {
    comprobanteId: string;
    fraccionamientoId: string;
    revisadoPor: string;
    meses: Array<{ mes: number; anio: number }>;
    cargoServicioIds?: string[];
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
  porFraccionamiento: Array<{
    fraccionamientoId: string;
    nombre: string;
    totalRecaudado: number;
    pagosRecibidos: number;
    residentesAlCorriente: number;
    residentesConAdeudos: number;
    montoPendientePorCobrar: number;
    comisionesOnline: number;
  }>;
};

// ── Types for new query methods ───────────────────────────────────────────

export type ComprobanteEnriquecido = {
  id: string;
  pagoId: string | null;
  monto: string;
  concepto: string;
  comprobanteUrl: string;
  estado: string;
};

export type FraccionamientoParaCobro = {
  montoMensual: string;
  montoReconexion: string;
  representanteId: string | null;
};

export type FraccionamientoParaCobroRepresentante = {
  montoMensual: string;
  montoReconexion: string;
};

export type MetodoPagoMercadoPago = {
  collectorId: string | null;
};

export type FolioRow = {
  id: string;
  folio: string | null;
  mes: number;
  anio: number;
  monto: string;
  estado: string | null;
  esReconexion: boolean | null;
  fechaPago: Date | null;
  fraccionamiento: string;
  residente: string;
};

export type ComprobantePendienteRow = {
  id: string;
  estado: string;
  monto: string;
  concepto: string;
  fechaEmision: Date;
  motivoRechazo: string | null;
  metadatos: unknown;
};

export type ComprobanteConResidente = {
  id: string;
  estado: string;
  monto: string;
  concepto: string;
  comprobanteUrl: string;
  fechaEmision: Date;
  motivoRechazo: string | null;
  metadatos: unknown;
  perfilId: string;
  residenteNombre: string | null;
  residenteEmail: string | null;
  edificio: string;
  departamento: string;
};

export type ComprobanteConResidenteCompleto = ComprobanteConResidente & {
  fechaRevision: Date | null;
  pagoId: string | null;
};

export type CargoServicioPendiente = {
  id: string;
  perfilId: string;
  mes: number;
  anio: number;
  monto: string;
  servicio: string;
};

export type ResidentesParaPagoTesorera = {
  fraccionamiento: {
    id: string;
    nombre: string;
    montoMensual: string;
    montoReconexion: string;
  } | null;
  perfiles: Array<{
    id: string;
    fraccionamientoId: string | null;
    edificio: string;
    departamento: string;
    estadoAgua: string;
    creadoEn: Date | null;
    userId: string;
    usuario: { id: string; name: string | null; email: string } | null;
    pagos: Array<{ mes: number; anio: number }>;
  }>;
  cargosPendientes: CargoServicioPendiente[];
};

export type RechazarComprobanteInput = {
  comprobanteId: string;
  fraccionamientoId: string;
  motivoRechazo: string;
  revisadoPor: string;
  perfilId: string;
};

export type RegistrarCargosObligatoriosManualesInput = {
  perfilId: string;
  fraccionamientoId: string;
  cargoIds: string[];
  metodo: 'efectivo' | 'transferencia';
  actorId: string;
  comprobanteId?: string;
};

export type CrearComprobanteTransferenciaInput = {
  perfilId: string;
  fraccionamientoId: string;
  monto: string;
  concepto: string;
  comprobanteUrl: string;
  metadatos: {
    meses?: Array<{ mes: number; anio: number }>;
    cargosServicioIds?: string[];
    servicios?: Array<{ fraccionamientoServicioId: string; periodos: Array<{ mes: number; anio: number }> }>;
    [key: string]: unknown;
  } | null;
  periodosSolicitados: Array<{ mes: number; anio: number }>;
  cargosSolicitados: string[];
  serviciosSolicitados: Array<{
    fraccionamientoServicioId: string;
    periodos: Array<{ mes: number; anio: number }>;
  }>;
  cargosEnRevision?: Set<string>;
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

  // ── New query methods moved from router ─────────────────────────────────
  enrichComprobantesByPagoIds?(pagoIds: string[]): Promise<ComprobanteEnriquecido[]>;
  findFraccionamientoForCobroRepresentante?(
    fraccionamientoId: string,
    representanteId: string,
  ): Promise<FraccionamientoParaCobroRepresentante | null>;
  findMetodoPagoMercadoPago?(fraccionamientoId: string): Promise<MetodoPagoMercadoPago | null>;
  findFoliosByPerfilUserId?(userId: string): Promise<FolioRow[]>;
  findPagosForReporteRepresentante?(fraccionamientoId: string): Promise<unknown[]>;
  findPagosByFraccionamientoAndPeriodo?(
    fraccionamientoId: string,
    mes: number,
    anio: number,
  ): Promise<unknown[]>;
  findResidentesParaPagoTesorera?(
    fraccionamientoId: string,
    tesoreraId: string,
  ): Promise<ResidentesParaPagoTesorera>;
  findFraccionamientoForCobro?(fraccionamientoId: string): Promise<FraccionamientoParaCobro | null>;
  findFraccionamientoForCobroTesorera?(
    fraccionamientoId: string,
    tesoreraId: string,
  ): Promise<FraccionamientoParaCobro | null>;
  findComprobantePendiente?(
    perfilId: string,
    fraccionamientoId: string,
  ): Promise<ComprobantePendienteRow | null>;
  findComprobantesPendientesDeResidente?(
    perfilId: string,
    fraccionamientoId: string,
  ): Promise<ComprobantePendienteRow[]>;
  findComprobantesPendientesDeFraccionamiento?(
    fraccionamientoId: string,
  ): Promise<ComprobanteConResidente[]>;
  findTodosComprobantesDeFraccionamiento?(
    fraccionamientoId: string,
    estado?: string,
  ): Promise<ComprobanteConResidenteCompleto[]>;
  findComprobanteForAprobacion?(
    comprobanteId: string,
    fraccionamientoId: string,
  ): Promise<Record<string, unknown> | null>;
  findComprobanteForRechazo?(
    comprobanteId: string,
    fraccionamientoId: string,
  ): Promise<{ id: string; perfilId: string } | null>;
  rechazarComprobante?(input: RechazarComprobanteInput): Promise<void>;
  registrarCargosObligatoriosManuales?(
    input: RegistrarCargosObligatoriosManualesInput,
  ): Promise<{ cargos: number; monto: number }>;
  crearComprobanteTransferencia?(
    input: CrearComprobanteTransferenciaInput,
  ): Promise<{ id: string }>;
}
