// ─── Estados ────────────────────────────────────────────────────────────────

export const ESTADOS = {
  ACTIVO:                'activo',
  PENDIENTE_CORTE:       'pendiente_corte',
  CORTADO:               'cortado',
  PENDIENTE_RECONEXION:  'pendiente_reconexion',
} as const;

export type EstadoAgua = (typeof ESTADOS)[keyof typeof ESTADOS];

// ─── Acciones ────────────────────────────────────────────────────────────────

export const ACCIONES = {
  MARCAR_MOROSO:       'MARCAR_MOROSO',
  PAGAR_PENDIENTE:     'PAGAR_PENDIENTE',
  EJECUTAR_CORTE:      'EJECUTAR_CORTE',
  PAGAR_RECONEXION:    'PAGAR_RECONEXION',
  EJECUTAR_RECONEXION: 'EJECUTAR_RECONEXION',
  RECONEXION_DIRECTA:  'RECONEXION_DIRECTA',
} as const;

export type AccionEstado = (typeof ACCIONES)[keyof typeof ACCIONES];

// ─── Contexto ────────────────────────────────────────────────────────────────

export type ContextoTransicion = {
  fecha: Date;
  actorId?: string;
};

// ─── Efectos ─────────────────────────────────────────────────────────────────

export type EfectoCrearCorte = {
  tipo: 'crear_corte';
  trabajadorId: string;
  motivo: 'falta_pago';
  fecha: Date;
};

export type EfectoCerrarCorte = {
  tipo: 'cerrar_corte';
  fecha: Date;
  reconectadoPor?: string;
};

export type Efecto = EfectoCrearCorte | EfectoCerrarCorte;

// ─── Resultado ───────────────────────────────────────────────────────────────

export type ResultadoTransicion = {
  nuevoEstado: EstadoAgua;
  efectos: Efecto[];
};

// ─── Tabla de transiciones ───────────────────────────────────────────────────

type DefinicionTransicion = {
  destino: EstadoAgua;
  efectos: (ctx: ContextoTransicion) => Efecto[];
};

type MapaTransiciones = {
  [estado in EstadoAgua]?: { [accion in AccionEstado]?: DefinicionTransicion };
};

const TRANSICIONES: MapaTransiciones = {
  [ESTADOS.ACTIVO]: {
    [ACCIONES.MARCAR_MOROSO]: {
      destino: ESTADOS.PENDIENTE_CORTE,
      efectos: () => [],
    },
  },

  [ESTADOS.PENDIENTE_CORTE]: {
    [ACCIONES.PAGAR_PENDIENTE]: {
      destino: ESTADOS.ACTIVO,
      efectos: () => [],
    },
    [ACCIONES.EJECUTAR_CORTE]: {
      destino: ESTADOS.CORTADO,
      efectos: (ctx) => [
        {
          tipo: 'crear_corte',
          trabajadorId: ctx.actorId ?? '',
          motivo: 'falta_pago',
          fecha: ctx.fecha,
        },
      ],
    },
  },

  [ESTADOS.CORTADO]: {
    [ACCIONES.PAGAR_RECONEXION]: {
      destino: ESTADOS.PENDIENTE_RECONEXION,
      efectos: (ctx) => [{ tipo: 'cerrar_corte', fecha: ctx.fecha }],
    },
    [ACCIONES.RECONEXION_DIRECTA]: {
      destino: ESTADOS.ACTIVO,
      efectos: (ctx) => [
        { tipo: 'cerrar_corte', fecha: ctx.fecha, reconectadoPor: ctx.actorId },
      ],
    },
  },

  [ESTADOS.PENDIENTE_RECONEXION]: {
    [ACCIONES.EJECUTAR_RECONEXION]: {
      destino: ESTADOS.ACTIVO,
      efectos: (ctx) => [
        { tipo: 'cerrar_corte', fecha: ctx.fecha, reconectadoPor: ctx.actorId },
      ],
    },
  },
};

// ─── API pública ─────────────────────────────────────────────────────────────

export function aplicarTransicion(
  estadoActual: EstadoAgua,
  accion: AccionEstado,
  contexto: ContextoTransicion,
): ResultadoTransicion {
  const def = TRANSICIONES[estadoActual]?.[accion];

  if (!def) {
    const permitidas =
      Object.keys(TRANSICIONES[estadoActual] ?? {}).join(', ') || 'ninguna';
    throw new Error(
      `Transición inválida: "${estadoActual}" + "${accion}". ` +
      `Acciones permitidas desde "${estadoActual}": ${permitidas}`,
    );
  }

  return { nuevoEstado: def.destino, efectos: def.efectos(contexto) };
}

export function puedeTransicionar(
  estadoActual: EstadoAgua,
  accion: AccionEstado,
): boolean {
  return !!TRANSICIONES[estadoActual]?.[accion];
}

export function transicionesDisponibles(
  estadoActual: EstadoAgua,
): Array<{ accion: AccionEstado; destino: EstadoAgua }> {
  return Object.entries(TRANSICIONES[estadoActual] ?? {}).map(
    ([accion, def]) => ({ accion: accion as AccionEstado, destino: def!.destino }),
  );
}
