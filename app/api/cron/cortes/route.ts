import { db } from '@/db';
import { pagos, perfilesResidente } from '@/db/schema';
import { and, eq, notInArray } from 'drizzle-orm';

export async function GET(req: Request) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return new Response('Unauthorized', { status: 401 });

  const ahora = new Date();
  const dia = ahora.getDate();
  const mes = ahora.getMonth() + 1;
  const anio = ahora.getFullYear();

  // Solo ejecutar si es después del día 5
  if (dia <= 5) {
    return Response.json({
      fecha: ahora.toISOString(),
      mensaje: 'No es día de corte (antes del día 5)',
      procesados: 0,
    });
  }

  // Perfiles que SÍ pagaron este mes
  const pagados = await db.select({ perfilId: pagos.perfilId })
    .from(pagos)
    .where(and(
      eq(pagos.mes, mes),
      eq(pagos.anio, anio),
      eq(pagos.estado, 'pagado')
    ));

  const idsPagados = pagados.map(p => p.perfilId);

  // Perfiles que NO pagaron y que están 'activos' → pasan a 'pendiente_corte'
  const morosos = await db.select({ id: perfilesResidente.id })
    .from(perfilesResidente)
    .where(and(
      notInArray(perfilesResidente.id, idsPagados),
      eq(perfilesResidente.estadoAgua, 'activo')
    ));

  // Cambiar estado a 'pendiente_corte'
  for (const m of morosos) {
    await db.update(perfilesResidente)
      .set({ estadoAgua: 'pendiente_corte' })
      .where(eq(perfilesResidente.id, m.id));
  }

  return Response.json({
    fecha: ahora.toISOString(),
    procesados: morosos.length,
    mensaje: `${morosos.length} residentes marcados como pendientes de corte`,
  });
}