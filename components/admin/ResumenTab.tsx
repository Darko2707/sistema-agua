import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Resumen } from '@/hooks/useAdmin';

type Props = { porCircuito: Resumen['porCircuito'] };

export function ResumenTab({ porCircuito }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Estado por circuito</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {porCircuito.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">Sin datos de circuitos.</p>
        )}
        {porCircuito.map((c) => {
          const pct = c.total > 0 ? Math.round((c.pagados / c.total) * 100) : 0;
          return (
            <div key={c.nombre} className="space-y-2">
              <div className="flex justify-between">
                <span className="font-medium">{c.nombre}</span>
                <span className="text-muted-foreground">{c.pagados}/{c.total}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-green-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
