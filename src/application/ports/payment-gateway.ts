export type PreferenciaPago = {
  url: string;
  preferenceId: string;
};

export type CrearPreferenciaInput = {
  accessToken: string;
  titulo: string;
  descripcion: string;
  monto: number;
  externalReference: string;
  notificationUrl: string;
  backUrls: { success: string; pending: string; failure: string };
  payerEmail: string;
  payerName: string;
};

export interface PaymentGateway {
  crearPreferencia(input: CrearPreferenciaInput): Promise<PreferenciaPago>;
  obtenerPago(paymentId: string, accessToken: string): Promise<{
    id: string | number;
    status: string;
    externalReference: string | null;
    collectorId: string | number | null;
  }>;
}
