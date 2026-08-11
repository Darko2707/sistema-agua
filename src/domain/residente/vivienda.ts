const EDIFICIO_PATTERN = /^\d{1,6}$/;
const DEPARTAMENTO_PATTERN = /^(\d{1,6})([A-Z])?$/;

export class ViviendaInvalidaError extends Error {
  readonly code = 'BAD_REQUEST' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ViviendaInvalidaError';
  }
}

function preparar(value: string): string {
  return value.normalize('NFKC').trim().toUpperCase();
}

function sinCerosIniciales(value: string): string {
  return value.replace(/^0+(?=\d)/, '');
}

export function normalizarEdificio(value: string): string {
  const preparado = preparar(value);
  if (!EDIFICIO_PATTERN.test(preparado)) {
    throw new ViviendaInvalidaError('El edificio debe ser un numero de hasta 6 digitos.');
  }

  const normalizado = sinCerosIniciales(preparado);
  if (normalizado === '0') {
    throw new ViviendaInvalidaError('El edificio debe ser mayor que cero.');
  }
  return normalizado;
}

export function normalizarDepartamento(value: string): string {
  const preparado = preparar(value);
  const partes = DEPARTAMENTO_PATTERN.exec(preparado);
  if (!partes) {
    throw new ViviendaInvalidaError(
      'El departamento debe ser un numero de hasta 6 digitos con una letra opcional.',
    );
  }

  const numero = sinCerosIniciales(partes[1]);
  if (numero === '0') {
    throw new ViviendaInvalidaError('El departamento debe ser mayor que cero.');
  }
  return `${numero}${partes[2] ?? ''}`;
}

export function normalizarVivienda(edificio: string, departamento: string) {
  return {
    edificio: normalizarEdificio(edificio),
    departamento: normalizarDepartamento(departamento),
  };
}
