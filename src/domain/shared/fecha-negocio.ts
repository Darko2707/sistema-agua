export const APP_TIME_ZONE = 'America/Mexico_City';

export type FechaNegocio = {
  dia: number;
  mes: number;
  anio: number;
};

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
});

/** Fecha calendario del negocio, independiente de la zona horaria del servidor. */
export function fechaNegocio(fecha = new Date()): FechaNegocio {
  const parts = formatter.formatToParts(fecha);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(part => part.type === type)?.value);

  return { dia: value('day'), mes: value('month'), anio: value('year') };
}

/** Suma días a una fecha calendario sin depender de la zona horaria del servidor. */
export function sumarDiasFechaNegocio(fecha: FechaNegocio, dias: number): FechaNegocio {
  if (!Number.isInteger(dias)) {
    throw new Error('La cantidad de días debe ser un entero');
  }

  const resultado = new Date(Date.UTC(fecha.anio, fecha.mes - 1, fecha.dia + dias, 12));
  return {
    dia: resultado.getUTCDate(),
    mes: resultado.getUTCMonth() + 1,
    anio: resultado.getUTCFullYear(),
  };
}
