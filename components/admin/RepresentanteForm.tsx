import type { Circuito, Personal } from '@/hooks/useAdmin';

type Props = {
  circuito:    Circuito;
  personal:    Personal[];
  actualizando: string | null;
  onAsignar:   (circuitoId: string, userId: string) => void;
};

export function RepresentanteForm({ circuito, personal, actualizando, onAsignar }: Props) {
  const representanteActual = personal.find((p) => p.id === circuito.representanteId);

  return (
    <div className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="font-medium">{circuito.nombre}</p>
        <p className="text-sm text-muted-foreground">
          {representanteActual
            ? `Representante: ${representanteActual.name}`
            : 'Sin representante asignado'}
        </p>
      </div>
      <select
        defaultValue={circuito.representanteId ?? ''}
        disabled={actualizando === circuito.id}
        onChange={(e) => onAsignar(circuito.id, e.target.value)}
        className="h-10 rounded-lg border bg-background px-3 md:w-64"
      >
        <option value="">Sin representante</option>
        {personal
          .filter((p) => p.role === 'representante' || p.role === 'admin')
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.email})
            </option>
          ))}
      </select>
    </div>
  );
}
