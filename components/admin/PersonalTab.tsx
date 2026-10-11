import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield } from 'lucide-react';
import { ROLES_ASIGNABLES, ROLES, type FraccionamientoOpcion, type Personal } from '@/hooks/useAdmin';

type Props = {
  personal:              Personal[];
  fraccionamientos:      FraccionamientoOpcion[];
  actualizando:          string | null;
  onCambiarRol:          (userId: string, rol: string) => void;
  onCambiarResponsabilidadCargos: (userId: string, responsableCargos: boolean) => void;
  onAsignarCuentaSinCargos: (userId: string, fraccionamientoId: string, rol: 'residente' | 'cuadrilla_cortes' | 'operador_pozo') => void;
};

export function PersonalTab({
  personal,
  fraccionamientos,
  actualizando,
  onCambiarRol,
  onCambiarResponsabilidadCargos,
  onAsignarCuentaSinCargos,
}: Props) {
  const [fraccionamientoPendiente, setFraccionamientoPendiente] = useState<Record<string, string>>({});
  const [rolPendiente, setRolPendiente] = useState<Record<string, 'residente' | 'cuadrilla_cortes' | 'operador_pozo'>>({});
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
                    <Badge variant={p.responsableCargos ? 'default' : 'secondary'} className="ml-2 mt-1">
                      {p.responsableCargos ? 'Con cargos' : 'Sin cargos'}
                    </Badge>
                  </div>
                  <select
                    value={p.fraccionamientoId ? p.role : (rolPendiente[p.id] ?? 'cuadrilla_cortes')}
                    disabled={actualizando === p.id}
                    onChange={(e) => {
                      if (p.fraccionamientoId) onCambiarRol(p.id, e.target.value);
                      else setRolPendiente((prev) => ({ ...prev, [p.id]: e.target.value as 'residente' | 'cuadrilla_cortes' | 'operador_pozo' }));
                    }}
                    className="h-10 rounded-lg border bg-background px-3 md:w-72"
                  >
                    {ROLES_ASIGNABLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  {!p.fraccionamientoId && (
                    <>
                      <select
                        value={fraccionamientoPendiente[p.id] ?? ''}
                        disabled={actualizando === p.id}
                        onChange={(e) => setFraccionamientoPendiente((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        className="h-10 rounded-lg border bg-background px-3 md:w-56"
                        aria-label={`Fraccionamiento para ${p.name}`}
                      >
                        <option value="">Asignar fraccionamiento…</option>
                        {fraccionamientos.map((fraccionamiento) => <option key={fraccionamiento.id} value={fraccionamiento.id}>{fraccionamiento.nombre}</option>)}
                      </select>
                      <button
                        type="button"
                        disabled={actualizando === p.id || !fraccionamientoPendiente[p.id]}
                        onClick={() => onAsignarCuentaSinCargos(p.id, fraccionamientoPendiente[p.id], rolPendiente[p.id] ?? 'cuadrilla_cortes')}
                        className="h-10 rounded-lg border bg-background px-3 text-sm"
                      >
                        Asignar personal
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={actualizando === p.id}
                    onClick={() => onCambiarResponsabilidadCargos(p.id, !p.responsableCargos)}
                    className="h-10 rounded-lg border bg-background px-3 text-sm"
                  >
                    {p.responsableCargos ? 'Quitar cargos' : 'Activar cargos'}
                  </button>
                </div>
              ))}
            </section>
          ))}
        </CardContent>
      </Card>

    </div>
  );
}
