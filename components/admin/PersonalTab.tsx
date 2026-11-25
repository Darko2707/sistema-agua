import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Users, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpcReact } from '@/lib/trpc-react';
import { ROLES_ASIGNABLES, ROLES, type FraccionamientoOpcion, type Personal } from '@/hooks/useAdmin';

type Props = {
  personal:              Personal[];
  fraccionamientos:      FraccionamientoOpcion[];
  actualizando:          string | null;
  onCambiarRol:          (userId: string, rol: string) => void;
  onCambiarResponsabilidadCargos: (userId: string, responsableCargos: boolean) => void;
  onAsignarCuentaSinCargos: (userId: string, fraccionamientoId: string, rol: 'residente' | 'cuadrilla_cortes') => void;
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
  const [rolPendiente, setRolPendiente] = useState<Record<string, 'residente' | 'cuadrilla_cortes'>>({});
  const [modalMultiRolUser, setModalMultiRolUser] = useState<Personal | null>(null);
  const [rolesSeleccionados, setRolesSeleccionados] = useState<string[]>([]);
  const [errorMultiRol, setErrorMultiRol] = useState<string | null>(null);

  const asignarMultiplesRolesMutation = trpcReact.usuarios.asignarMultiplesRoles.useMutation();

  function abrirModalMultiRol(user: Personal) {
    setModalMultiRolUser(user);
    setRolesSeleccionados(user.roles && user.roles.length > 0 ? user.roles : [user.role]);
    setErrorMultiRol(null);
  }

  function toggleRol(rol: string) {
    setRolesSeleccionados((prev) =>
      prev.includes(rol) ? prev.filter((r) => r !== rol) : [...prev, rol]
    );
  }

  async function guardarMultiRoles(e: React.FormEvent) {
    e.preventDefault();
    if (!modalMultiRolUser) return;
    if (rolesSeleccionados.length === 0) {
      setErrorMultiRol('Selecciona al menos un rol.');
      return;
    }
    setErrorMultiRol(null);
    try {
      await asignarMultiplesRolesMutation.mutateAsync({
        userId: modalMultiRolUser.id,
        roles: rolesSeleccionados as ('representante' | 'tesorera' | 'cuadrilla_cortes' | 'operador_pozo' | 'residente')[],
        fraccionamientoId: modalMultiRolUser.fraccionamientoId ?? undefined,
      });
      // Actualizar visualmente el rol principal
      onCambiarRol(modalMultiRolUser.id, rolesSeleccionados[0]);
      setModalMultiRolUser(null);
    } catch (err: unknown) {
      setErrorMultiRol(err instanceof Error ? err.message : 'Error al asignar roles');
    }
  }
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
                      else setRolPendiente((prev) => ({ ...prev, [p.id]: e.target.value as 'residente' | 'cuadrilla_cortes' }));
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/10"
                    onClick={() => abrirModalMultiRol(p)}
                  >
                    <Users className="h-3.5 w-3.5" />
                    Multi-Rol
                  </Button>
                </div>
              ))}
            </section>
          ))}
        </CardContent>
      </Card>

      {/* Modal Multi-Rol */}
      {modalMultiRolUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl border">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold">Asignar Múltiples Roles Operativos</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Usuario: <span className="font-semibold text-foreground">{modalMultiRolUser.name}</span> ({modalMultiRolUser.email})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalMultiRolUser(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {errorMultiRol && (
              <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
                {errorMultiRol}
              </div>
            )}

            <form onSubmit={guardarMultiRoles} className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Selecciona uno o más roles simultáneos (ej. Representante y Tesorero en el mismo fraccionamiento):
              </p>
              <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
                {[
                  { id: 'representante', label: 'Representante', desc: 'Gestión vecinal, cortes y reportes' },
                  { id: 'tesorera', label: 'Tesorero', desc: 'Control de caja, gastos e insumos' },
                  { id: 'cuadrilla_cortes', label: 'Cuadrilla de Cortes', desc: 'Ejecución operativa en campo' },
                  { id: 'operador_pozo', label: 'Operador de Pozo', desc: 'Supervisión de bombeo e infraestructura' },
                  { id: 'residente', label: 'Residente', desc: 'Titular de vivienda y consulta de estado' },
                ].map((rol) => {
                  const seleccionado = rolesSeleccionados.includes(rol.id);
                  return (
                    <label
                      key={rol.id}
                      className={`flex items-start gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                        seleccionado
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border bg-background text-foreground hover:bg-muted/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={seleccionado}
                        onChange={() => toggleRol(rol.id)}
                        className="mt-0.5 rounded border-input"
                      />
                      <div className="text-xs">
                        <span className="font-bold block">{rol.label}</span>
                        <span className="text-muted-foreground">{rol.desc}</span>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t mt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalMultiRolUser(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={asignarMultiplesRolesMutation.isPending}
                >
                  {asignarMultiplesRolesMutation.isPending && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  Guardar roles
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
