import { Badge } from '@/components/ui/badge';
import { ESTADOS, type EstadoAgua } from '@/src/domain/agua/state-machine';

// ─── Mapa canónico: estado → presentación ────────────────────────────────────
// Única fuente de verdad para labels y colores del estado del servicio de agua.
// Variantes semánticas se traducen a clases Tailwind aquí para no extender
// el componente Badge de shadcn con variantes custom.

type VarianteSemántica = 'success' | 'warning' | 'destructive' | 'info';

type EstadoConfig = {
  label: string;
  variante: VarianteSemántica;
};

const ESTADO_CONFIG: Record<EstadoAgua, EstadoConfig> = {
  [ESTADOS.ACTIVO]: {
    label: 'Activo',
    variante: 'success',
  },
  [ESTADOS.PENDIENTE_CORTE]: {
    label: 'Pendiente corte',
    variante: 'warning',
  },
  [ESTADOS.CORTADO]: {
    label: 'Cortado',
    variante: 'destructive',
  },
  [ESTADOS.PENDIENTE_RECONEXION]: {
    label: 'Pendiente reconexión',
    variante: 'info',
  },
};

const CLASES_VARIANTE: Record<VarianteSemántica, string> = {
  success:     'border-green-200 bg-green-100 text-green-700',
  warning:     'border-amber-200 bg-amber-100 text-amber-700',
  destructive: 'border-red-200   bg-red-100   text-red-700',
  info:        'border-sky-200   bg-sky-100   text-sky-700',
};

type Props = {
  estado: EstadoAgua | string;
  className?: string;
};

export function EstadoAguaBadge({ estado, className }: Props) {
  const config = ESTADO_CONFIG[estado as EstadoAgua];

  if (!config) {
    return (
      <Badge variant="outline" className={className}>
        {estado}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={`font-medium ${CLASES_VARIANTE[config.variante]}${className ? ` ${className}` : ''}`}
    >
      {config.label}
    </Badge>
  );
}
