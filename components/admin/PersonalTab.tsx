import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield } from 'lucide-react';
import { ROLES_ASIGNABLES, ROLES, type Personal } from '@/hooks/useAdmin';

type Props = {
  personal:              Personal[];
  actualizando:          string | null;
  onCambiarRol:          (userId: string, rol: string) => void;
};

export function PersonalTab({
  personal,
  actualizando,
  onCambiarRol,
}: Props) {
  const personalPorFraccionamiento = personal.reduce<Record<string, Personal[]>>((grupos, persona) => {
    const nombre = persona.fraccionamientoNombre ?? 'Sin fraccionamiento asignado';
    (grupos[nombre] ??= []).push(persona);
    return grupos;
  }, {});

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Personal por fraccionamiento</CardTitle>
          <p className="text-sm text-muted-foreground">
            El administrador global no forma parte del personal. Cada grupo pertenece a un fraccionamiento.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {personal.length === 0 && (
            <p className="py-10 text-center text-muted-foreground">Sin personal registrado.</p>
          )}
          {Object.entries(personalPorFraccionamiento).map(([fraccionamiento, personas]) => (
            <section key={fraccionamiento} className="space-y-3 rounded-xl border bg-slate-50/60 p-4">
              <h3 className="font-semibold">{fraccionamiento}</h3>
              {personas.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-4 rounded-xl border bg-background p-4 md:flex-row md:items-center md:justify-between"
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
                    {ROLES_ASIGNABLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </section>
          ))}
        </CardContent>
      </Card>

    </div>
  );
}
