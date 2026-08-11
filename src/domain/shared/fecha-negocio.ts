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
