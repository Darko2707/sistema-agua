'use client';

import { useState } from 'react';
import { Send, MessageSquare, AlertCircle, Loader2, StickyNote } from 'lucide-react';
import { trpcReact } from '@/lib/trpc-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Props {
  fraccionamientoId?: string;
  className?: string;
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
    case 'operador pozo':
    case 'operador_pozo':
      return 'outline';
    default:
      return 'secondary';
  }
}

export function NotasOperativasPanel({ fraccionamientoId, className }: Props) {
  const [contenido, setContenido] = useState('');
  const [error, setError] = useState<string | null>(null);

  const queryParams = fraccionamientoId ? { fraccionamientoId } : undefined;
  const notasQuery = trpcReact.notasOperativas.listar.useQuery(queryParams);
  const crearMutation = trpcReact.notasOperativas.crear.useMutation();

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
        ...(fraccionamientoId ? { fraccionamientoId } : {}),
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
          Registro interno de incidencias, acuerdos y avisos entre roles operativos (Admin, Representante, Tesorería, Cuadrilla)
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Formulario de captura */}
        <form onSubmit={handleSubmit} className="space-y-2">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              placeholder="Escribe una nota u observación operativa (ej. 'Reparación de válvula en torre 3 programada para mañana')..."
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
            No hay notas operativas registradas en este fraccionamiento.
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {notas.map((n) => (
              <div
                key={n.id}
                className="rounded-lg border bg-card p-3 text-xs space-y-1.5 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {n.autorNombre || n.autorEmail || 'Usuario'}
                    </span>
                    <Badge variant={getBadgeVariant(n.rolAutor)} className="text-[10px] py-0 px-1.5">
                      {n.rolAutor}
                    </Badge>
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
