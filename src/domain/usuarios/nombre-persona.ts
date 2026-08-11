const NOMBRE_PATTERN = /^[\p{L}][\p{L}\p{M}]*(?: [\p{L}][\p{L}\p{M}]*)*$/u;

export const NOMBRE_PERSONA_ERROR =
  'Usa \u00fanicamente letras y espacios; no se permiten n\u00fameros ni s\u00edmbolos.';

function prepararNombre(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

export function esNombrePersonaValido(value: string): boolean {
  const preparado = prepararNombre(value);
  return preparado.length >= 2
    && preparado.length <= 120
    && NOMBRE_PATTERN.test(preparado);
}

export function normalizarNombrePersona(value: string): string {
  const preparado = prepararNombre(value);
  if (!preparado) return '';

  return preparado
    .split(' ')
    .map((palabra) => {
      const [primera, ...resto] = Array.from(palabra);
      return `${primera.toLocaleUpperCase('es-MX')}${resto.join('').toLocaleLowerCase('es-MX')}`;
    })
    .join(' ');
}
