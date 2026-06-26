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

// Text -800 on bg-100 achieves ≥ 5:1 contrast ratio (WCAG AA).
const CLASES_VARIANTE: Record<VarianteSemántica, string> = {
  success:     'border-green-300 bg-green-100 text-green-800',
  warning:     'border-amber-300 bg-amber-100 text-amber-800',
  destructive: 'border-red-300   bg-red-100   text-red-800',
  info:        'border-sky-300   bg-sky-100   text-sky-800',
};

type Props = {
  estado: EstadoAgua | string;
  className?: string;
};

export function EstadoAguaBadge({ estado, className }: Props) {
  const config = ESTADO_CONFIG[estado as EstadoAgua];

  if (!config) {
    return (
      <Badge role="status" variant="outline" className={className}>
        {estado}
      </Badge>
    );
  }

  return (
    <Badge
      role="status"
      aria-label={`Estado del servicio: ${config.label}`}
      variant="outline"
      className={`font-medium ${CLASES_VARIANTE[config.variante]}${className ? ` ${className}` : ''}`}
    >
      {config.label}
    </Badge>
  );
}
