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
    test: /demasiadas solicitudes|too many requests|rate limit/i,
    code: 'SISCO-429',
    titulo: 'Límite de solicitudes alcanzado',
    causa: 'Se han realizado demasiados intentos en poco tiempo.',
    accion: 'Espera un minuto antes de volver a intentarlo.',
  },
  {
    test: /fraccionamiento.*desactivad|desactivad.*fraccionamiento/i,
    code: 'SISCO-423',
    titulo: 'El fraccionamiento esta desactivado',
    causa: 'El administrador suspendió temporalmente el acceso y los cobros de este fraccionamiento.',
    accion: 'Contacta al administrador para confirmar cuándo volverá a estar disponible.',
  },
  {
    test: /suscripcion operativa|no tiene una suscripcion/i,
    code: 'SISCO-423',
    titulo: 'Fraccionamiento temporalmente no disponible',
    causa: 'El fraccionamiento no cuenta con una suscripción operativa vigente en el sistema.',
    accion: 'Contacta a la administración de tu fraccionamiento.',
  },
  {
    test: /uq_perfiles_residente_ubicacion|duplicate key.*perfiles_residente|registro por fraccionamiento.*edificio.*departamento|edificio y departamento.*cuenta registrada/i,
    code: 'SISCO-409',
    titulo: 'Esta vivienda ya está registrada',
    causa: 'Ya existe un residente con el mismo fraccionamiento, edificio y departamento.',
    accion: 'Verifica los datos de la vivienda o inicia sesión con la cuenta ya registrada.',
  },
  {
    test: /no hay suficientes periodos|cargos ya no estan disponibles|programar todos los periodos/i,
    code: 'SISCO-202',
    titulo: 'Los cargos seleccionados cambiaron',
    causa: 'Uno o más periodos ya no están disponibles para pago o cambiaron de estado.',
    accion: 'Actualiza la página para revisar el estado actual de tus cargos.',
  },
  {
    test: /reconexion esta pendiente/i,
    code: 'SISCO-203',
    titulo: 'Reconexión en proceso',
    causa: 'Tu servicio tiene una reconexión física pendiente de ser realizada.',
    accion: 'Espera a que la cuadrilla complete la reconexión antes de realizar nuevos pagos.',
  },
  {
    test: /cuadrilla.*asignaci.n operativa|asignaci.n operativa activa/i,
    code: 'SISCO-403',
    titulo: 'La cuadrilla aún no tiene servicios asignados',
    causa: 'La cuenta debe pertenecer a un fraccionamiento y tener al menos una asignación operativa activa.',
    accion: 'El administrador debe asignar la cuadrilla al fraccionamiento y al servicio correspondiente.',
  },
  {
    test: /no tiene cargos de vivienda|perfil sin fraccionamiento/i,
    code: 'SISCO-403',
    titulo: 'Cuenta no habilitada para cobros',
    causa: 'Esta cuenta no está registrada como responsable de cargos de vivienda o no tiene fraccionamiento asignado.',
    accion: 'Contacta a la administración para habilitar los cargos en tu cuenta.',
  },
  {
    test: /periodos?.*(pagad|registrad)|ya existe un pago|ya fueron pagados/i,
    code: 'SISCO-201',
    titulo: 'El periodo ya fue pagado',
    causa: 'La informacion cambio o alguien registro ese mes antes que tu.',
    accion: 'Actualiza la lista y revisa el historial antes de registrar otro pago.',
  },
  {
    test: /circuito|no tienes acceso|forbidden|no autorizado/i,
    code: 'SISCO-403',
    titulo: 'No tienes permiso para esta accion',
    causa: 'Tu usuario no esta asignado al circuito o la sesion ya no es valida.',
    accion: 'Cierra sesion, vuelve a entrar y contacta al administrador si el problema continua.',
  },
  {
    test: /selecciona conceptos validos|selecciona al menos un concepto/i,
    code: 'SISCO-400',
    titulo: 'Selección de conceptos requerida',
    causa: 'Debes seleccionar al menos un mes de agua o un servicio para continuar.',
    accion: 'Marca los conceptos que deseas pagar y vuelve a presionar el botón de pago.',
  },
  {
    test: /telefono/i,
    code: 'SISCO-101',
    titulo: 'Telefono invalido',
    causa: 'El telefono debe tener exactamente 10 digitos.',
    accion: 'Captura solo numeros, sin espacios, guiones ni lada.',
  },
  {
    test: /mercado pago|checkout|pago|preferencia/i,
    code: 'SISCO-301',
    titulo: 'No pudimos iniciar el pago',
    causa: 'Mercado Pago no acepto la solicitud o la sesion expiro.',
    accion: 'Verifica tu sesion, actualiza la pagina y vuelve a intentar. Si el pago aparece pendiente, no lo repitas.',
  },
  {
    test: /codigo|recuperacion|contrase/i,
    code: 'SISCO-401',
    titulo: 'No pudimos validar el codigo',
    causa: 'El codigo puede estar vencido, usado o escrito con un formato incorrecto.',
    accion: 'Captura exactamente 6 numeros o pide un nuevo codigo a tu representante.',
  },
  {
    test: /SISCO-302|servicio de pago/i,
    code: 'SISCO-302',
    titulo: 'Error en el servicio de pago',
    causa: 'Ocurrió un error al procesar la solicitud con la pasarela de pagos.',
    accion: 'Actualiza la pantalla y vuelve a intentarlo. Si el problema persiste, contacta al administrador.',
  },
];

function rawMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

export function userFacingError(error: unknown, fallbackCode = 'SISCO-000'): string {
  const raw = rawMessage(error);
  const explicitCode = typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : null;
  const correlationId = typeof error === 'object' && error !== null && 'correlationId' in error && typeof (error as { correlationId?: unknown }).correlationId === 'string'
    ? (error as { correlationId: string }).correlationId
    : null;

  const knownByCode = explicitCode ? KNOWN_ERRORS.find(item => item.code === explicitCode) : null;
  const knownByTest = KNOWN_ERRORS.find(item => item.test.test(raw));
  const known = knownByCode ?? knownByTest;

  const detail = known ?? { code: explicitCode || fallbackCode, ...DEFAULT_MESSAGE };
  const refSuffix = correlationId ? ` (Ref: ${correlationId})` : '';

  return `${detail.code}: ${detail.titulo}. ${detail.causa} ${detail.accion}${refSuffix}`;
}
