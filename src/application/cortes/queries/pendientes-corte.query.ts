export type PendientesCortQuery = {
  rol: 'representante' | 'cuadrilla_cortes' | 'admin';
  userId: string;
  fraccionamientoId?: string | null;
  tipo: 'corte' | 'reconexion';
};
