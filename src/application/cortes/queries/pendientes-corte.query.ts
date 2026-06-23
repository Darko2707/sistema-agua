export type PendientesCortQuery = {
  rol: 'representante' | 'cuadrilla_cortes' | 'admin';
  userId: string;
  tipo: 'corte' | 'reconexion';
};
