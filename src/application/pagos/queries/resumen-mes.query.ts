export type ResumenMesQuery = {
  rol: 'admin' | 'representante';
  userId: string;
  fraccionamientoId?: string | null;
};
