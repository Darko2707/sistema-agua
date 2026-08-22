const DEFAULT_MESSAGE = {
  titulo: 'No pudimos completar la accion',
  causa: 'La conexion pudo fallar o el sistema rechazo la operacion por seguridad.',
  accion: 'Actualiza la pantalla, verifica los datos y vuelve a intentarlo.',
};

const KNOWN_ERRORS: Array<{
  test: RegExp;
  code: string;
  titulo: string;
  causa: string;
  accion: string;
}> = [
  {
    test: /periodos?.*(pagad|registrad)|ya existe un pago|ya fueron pagados/i,
    code: 'SIS4S-201',
    titulo: 'El periodo ya fue pagado',
    causa: 'La informacion cambio o alguien registro ese mes antes que tu.',
    accion: 'Actualiza la lista y revisa el historial antes de registrar otro pago.',
  },
  {
    test: /circuito|no tienes acceso|forbidden|no autorizado/i,
    code: 'SIS4S-403',
    titulo: 'No tienes permiso para esta accion',
    causa: 'Tu usuario no esta asignado al circuito o la sesion ya no es valida.',
    accion: 'Cierra sesion, vuelve a entrar y contacta al administrador si el problema continua.',
  },
  {
    test: /telefono/i,
    code: 'SIS4S-101',
    titulo: 'Telefono invalido',
    causa: 'El telefono debe tener exactamente 10 digitos.',
    accion: 'Captura solo numeros, sin espacios, guiones ni lada.',
  },
  {
    test: /mercado pago|checkout|pago/i,
    code: 'SIS4S-301',
    titulo: 'No pudimos iniciar el pago',
    causa: 'Mercado Pago no acepto la solicitud o la sesion expiro.',
    accion: 'Verifica tu sesion, actualiza la pagina y vuelve a intentar. Si el pago aparece pendiente, no lo repitas.',
  },
  {
    test: /codigo|recuperacion|contrase/i,
    code: 'SIS4S-401',
    titulo: 'No pudimos validar el codigo',
    causa: 'El codigo puede estar vencido, usado o escrito con un formato incorrecto.',
    accion: 'Captura exactamente 6 numeros o pide un nuevo codigo a tu representante.',
  },
];

function rawMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return '';
}

export function userFacingError(error: unknown, fallbackCode = 'SIS4S-000'): string {
  const raw = rawMessage(error);
  const known = KNOWN_ERRORS.find(item => item.test.test(raw));
  const detail = known ?? { code: fallbackCode, ...DEFAULT_MESSAGE };

  return `${detail.code}: ${detail.titulo}. ${detail.causa} ${detail.accion}`;
}
