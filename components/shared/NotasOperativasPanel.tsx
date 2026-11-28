'use client';

import { useState } from 'react';
import { Send, MessageSquare, AlertCircle, Loader2, StickyNote, Globe, Lock } from 'lucide-react';
import { trpcReact } from '@/lib/trpc-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export type OperationalPanelRole = 'admin' | 'representante' | 'tesorera' | 'cuadrilla_cortes';

interface Props {
  fraccionamientoId?: string;
  panelRol?: OperationalPanelRole;
  className?: string;
}

function formatPanelRoleLabel(rol?: string | null): string {
  switch (rol) {
    case 'admin':
      return 'Admin';
    case 'representante':
      return 'Representante';
    case 'tesorera':
      return 'Tesorería';
    case 'cuadrilla_cortes':
      return 'Cuadrilla';
    default:
      return 'Mi rol';
  }
}

function getBadgeVariant(rol: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (rol.toLowerCase()) {
    case 'admin':
      return 'destructive';
    case 'representante':
      return 'default';
    case 'tesorero':
    case 'tesorera':
      return 'secondary';
    case 'cuadrilla':
    case 'cuadrilla_cortes':
      return 'outline';
    default:
      return 'secondary';
  }
}

export function NotasOperativasPanel({ fraccionamientoId, panelRol, className }: Props) {
  const [contenido, setContenido] = useState('');
  const [alcance, setAlcance] = useState<'rol' | 'global'>('rol');
  const [error, setError] = useState<string | null>(null);

  const queryParams =
    fraccionamientoId || panelRol
      ? {
          ...(fraccionamientoId ? { fraccionamientoId } : {}),
          ...(panelRol ? { panelRol } : {}),
        }
      : undefined;
  const notasQuery = trpcReact.notasOperativas.listar.useQuery(queryParams);
  const crearMutation = trpcReact.notasOperativas.crear.useMutation();
  const rolLabel = formatPanelRoleLabel(panelRol);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const texto = contenido.trim();
    if (!texto) {
      setError('Escribe una nota antes de publicar.');
      return;
    }

    try {
      await crearMutation.mutateAsync({
        contenido: texto,
        alcance,
        ...(fraccionamientoId ? { fraccionamientoId } : {}),
        ...(panelRol ? { panelRol } : {}),
      });
      setContenido('');
      await notasQuery.refetch();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la nota');
    }
  }

  const notas = notasQuery.data ?? [];

  return (
    <Card className={`border border-border/80 shadow-sm ${className ?? ''}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-amber-600" />
          Bitácora de Notas Operativas
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">
          Elige si tu nota es privada para tu rol ({rolLabel}) o global para todo el personal operativo.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Formulario de captura */}
        <form onSubmit={handleSubmit} className="space-y-2.5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Selector de visibilidad: Solo mi rol vs Global */}
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Visibilidad de la nota">
            <button
              type="button"
              role="radio"
              aria-checked={alcance === 'rol'}
              onClick={() => setAlcance('rol')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
                alcance === 'rol'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted/50'
              }`}
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Solo {rolLabel}</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={alcance === 'global'}
              onClick={() => setAlcance('global')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
                alcance === 'global'
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted/50'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              <span>Global (todos los roles)</span>
            </button>
            <span className="text-[11px] text-muted-foreground">
              {alcance === 'rol'
                ? `Solo visible para ${rolLabel} (actual o siguiente).`
                : 'Visible para todo el personal operativo del fraccionamiento.'}
            </span>
          </div>

          <div className="flex gap-2">
            <textarea
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              placeholder={
                alcance === 'rol'
                  ? `Escribe una nota privada para ${rolLabel}...`
                  : "Escribe una nota global para todo el personal (ej. 'Reparación de válvula en torre 3 programada para mañana')..."
              }
              maxLength={2000}
              rows={2}
              className="flex-1 rounded-lg border border-input bg-background p-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
            <Button
              type="submit"
              size="sm"
              disabled={crearMutation.isPending || !contenido.trim()}
              className="h-auto px-4 bg-amber-600 hover:bg-amber-700 text-white self-stretch gap-1"
            >
              {crearMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Publicar</span>
            </Button>
          </div>
        </form>

        {/* Listado de notas */}
        {notasQuery.isLoading ? (
          <div className="flex items-center justify-center p-6 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Cargando bitácora operativa...
          </div>
        ) : notas.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
            <MessageSquare className="h-5 w-5 mx-auto mb-1.5 opacity-40" />
            No hay notas operativas registradas para {rolLabel}.
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {notas.map((n) => (
              <div
                key={n.id}
                className="rounded-lg border bg-card p-3 text-xs space-y-1.5 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-foreground">
                      {n.autorNombre || n.autorEmail || 'Usuario'}
                    </span>
                    <Badge variant={getBadgeVariant(n.rolAutor)} className="text-[10px] py-0 px-1.5">
                      {n.rolAutor}
                    </Badge>
                    {n.rolDestino === null ? (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-emerald-300 bg-emerald-50 text-emerald-800 gap-1">
                        <Globe className="h-2.5 w-2.5" />
                        Global
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-300 bg-amber-50 text-amber-800 gap-1">
                        <Lock className="h-2.5 w-2.5" />
                        Solo {formatPanelRoleLabel(n.rolDestino)}
                      </Badge>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString('es-MX', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed text-[12.5px]">
                  {n.contenido}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
