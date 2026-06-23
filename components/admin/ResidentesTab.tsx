import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EstadoAguaBadge } from '@/components/domain/EstadoAguaBadge';
import { ROLES, type Circuito, type ResidenteCompleto } from '@/hooks/useAdmin';

type Props = {
  residentesFiltrados: ResidenteCompleto[];
  circuitos:           Circuito[];
  filtroCircuito:      string;
  setFiltroCircuito:   (v: string) => void;
  filtroEstado:        string;
  setFiltroEstado:     (v: string) => void;
  actualizando:        string | null;
  onCambiarRol:        (userId: string, rol: string) => void;
  onLimpiarFiltros:    () => void;
};

export function ResidentesTab({
  residentesFiltrados,
  circuitos,
  filtroCircuito,
  setFiltroCircuito,
  filtroEstado,
  setFiltroEstado,
  actualizando,
  onCambiarRol,
  onLimpiarFiltros,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Todos los residentes</CardTitle>
        <div className="mt-2 flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Circuito:</label>
            <select
              value={filtroCircuito}
              onChange={(e) => setFiltroCircuito(e.target.value)}
              className="h-9 rounded-lg border bg-background px-3 text-sm"
            >
              <option value="todos">Todos</option>
              {circuitos.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Estado:</label>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="h-9 rounded-lg border bg-background px-3 text-sm"
            >
              <option value="todos">Todos</option>
              <option value="activo">Activo</option>
              <option value="pendiente_corte">Pendiente corte</option>
              <option value="cortado">Cortado</option>
              <option value="pendiente_reconexion">Pendiente reconexión</option>
            </select>
          </div>

          <Button variant="outline" size="sm" onClick={onLimpiarFiltros}>
            Limpiar filtros
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {residentesFiltrados.length === 0 && (
          <p className="py-10 text-center text-muted-foreground">
            No hay residentes que coincidan con los filtros.
          </p>
        )}
        {residentesFiltrados.map((r) => {
          const usuarioId = r.usuario?.id || r.id;
          return (
            <div
              key={r.id}
              className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex-1">
                <p className="font-medium">{r.usuario?.name || 'Sin nombre'}</p>
                <p className="text-sm text-muted-foreground">
                  {r.circuito?.nombre || 'Sin circuito'} · {r.edificio} · {r.departamento}
                </p>
                <p className="text-xs text-muted-foreground">{r.usuario?.email || 'Sin email'}</p>
                {r.tenencia === 'inquilino' && r.nombrePropietario && (
                  <p className="text-xs text-amber-700 mt-0.5">
                    Inquilino · Dueño: {r.nombrePropietario}
                    {r.telefonoPropietario ? ` · ${r.telefonoPropietario}` : ''}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <EstadoAguaBadge estado={r.estadoAgua} />
                {r.estadoAgua === 'activo' && r.pagoEsteMes && (
                  <Badge variant="default" className="bg-green-600 font-medium">Pagado</Badge>
                )}
                {r.estadoAgua === 'activo' && r.esMoroso && !r.pagoEsteMes && (
                  <Badge variant="outline" className="border-amber-300 font-medium text-amber-600">
                    Moroso
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={r.usuario?.role || 'residente'}
                  disabled={actualizando === r.id}
                  onChange={(e) => onCambiarRol(usuarioId, e.target.value)}
                  className="h-9 rounded-lg border bg-background px-2 text-sm md:w-40"
                >
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
                {actualizando === r.id && (
                  <span className="text-xs text-muted-foreground">Guardando...</span>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
