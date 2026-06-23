import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RepresentanteForm } from './RepresentanteForm';
import type { Circuito, Personal } from '@/hooks/useAdmin';

type Props = {
  circuitos:    Circuito[];
  personal:     Personal[];
  actualizando: string | null;
  onAsignar:    (circuitoId: string, userId: string) => void;
};

export function CircuitoForm({ circuitos, personal, actualizando, onAsignar }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Circuitos y representantes</CardTitle>
        <p className="text-sm text-muted-foreground">Asigna un representante a cada circuito</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {circuitos.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">Sin circuitos registrados.</p>
        )}
        {circuitos.map((c) => (
          <RepresentanteForm
            key={c.id}
            circuito={c}
            personal={personal}
            actualizando={actualizando}
            onAsignar={onAsignar}
          />
        ))}
      </CardContent>
    </Card>
  );
}
