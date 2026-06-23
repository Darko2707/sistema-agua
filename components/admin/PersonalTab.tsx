import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield } from 'lucide-react';
import { CircuitoForm } from './CircuitoForm';
import { ROLES, type Personal, type Circuito } from '@/hooks/useAdmin';

type Props = {
  personal:              Personal[];
  circuitos:             Circuito[];
  actualizando:          string | null;
  onCambiarRol:          (userId: string, rol: string) => void;
  onAsignarRepresentante:(circuitoId: string, userId: string) => void;
};

export function PersonalTab({
  personal,
  circuitos,
  actualizando,
  onCambiarRol,
  onAsignarRepresentante,
}: Props) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Personal del sistema</CardTitle>
          <p className="text-sm text-muted-foreground">
            Cambia el rol de los usuarios desde el selector
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {personal.length === 0 && (
            <p className="py-10 text-center text-muted-foreground">Sin personal registrado.</p>
          )}
          {personal.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <p className="font-medium">{p.name}</p>
                </div>
                <p className="text-sm text-muted-foreground">{p.email}</p>
                <Badge variant="outline" className="mt-1">
                  {ROLES.find((r) => r.value === p.role)?.label ?? p.role}
                </Badge>
              </div>
              <select
                value={p.role}
                disabled={actualizando === p.id}
                onChange={(e) => onCambiarRol(p.id, e.target.value)}
                className="h-10 rounded-lg border bg-background px-3 md:w-72"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          ))}
        </CardContent>
      </Card>

      <CircuitoForm
        circuitos={circuitos}
        personal={personal}
        actualizando={actualizando}
        onAsignar={onAsignarRepresentante}
      />
    </div>
  );
}
