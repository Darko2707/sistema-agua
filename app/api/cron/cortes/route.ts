import { db } from '@/db';
import { pagos, perfilesResidente } from '@/db/schema';
import { and, eq, notInArray } from 'drizzle-orm';

export async function GET(req: Request) {
  // 🔒 Autenticación (coméntala para pruebas)
  // if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`)
  //   return new Response('Unauthorized', { status: 401 });

  const ahora = new Date();
  const dia = ahora.getDate();
  const mes = ahora.getMonth() + 1;
  const anio = ahora.getFullYear();

  console.log(`🔄 Cron cortes - ${dia}/${mes}/${anio}`);

  // Solo ejecutar si es después del día 5
  if (dia <= 5) {
    return Response.json({
      fecha: ahora.toISOString(),
      mensaje: 'No es día de corte (antes del día 6)',
      procesados: 0,
    });
  }

  // 1. Perfiles que SÍ pagaron este mes
  const pagados = await db
    .select({ perfilId: pagos.perfilId })
    .from(pagos)
    .where(
      and(
        eq(pagos.mes, mes),
        eq(pagos.anio, anio),
        eq(pagos.estado, 'pagado')
      )
    );

  const idsPagados = pagados.map((p) => p.perfilId);
  console.log(`✅ Pagos encontrados: ${idsPagados.length}`);

  // 2. Perfiles que NO pagaron y están 'activos'
  let morosos: { id: string }[] = [];

  if (idsPagados.length === 0) {
    // ✅ Si nadie pagó, todos los activos pasan a pendiente de corte
    morosos = await db
      .select({ id: perfilesResidente.id })
      .from(perfilesResidente)
      .where(eq(perfilesResidente.estadoAgua, 'activo'));
  } else {
    // ✅ Si hay pagos, excluir a los que pagaron
    morosos = await db
      .select({ id: perfilesResidente.id })
      .from(perfilesResidente)
      .where(
        and(
          notInArray(perfilesResidente.id, idsPagados),
          eq(perfilesResidente.estadoAgua, 'activo')
        )
      );
  }

  console.log(`⚠️ Morosos encontrados: ${morosos.length}`);

  // 3. Cambiar estado a 'pendiente_corte'
  let procesados = 0;
  for (const m of morosos) {
    await db
      .update(perfilesResidente)
      .set({ estadoAgua: 'pendiente_corte' })
      .where(eq(perfilesResidente.id, m.id));
    procesados++;
  }

  console.log(`✂️ ${procesados} residentes marcados como pendiente de corte`);

  return Response.json({
    fecha: ahora.toISOString(),
    mes,
    anio,
    dia,
    totalPagados: idsPagados.length,
    totalMorosos: morosos.length,
    procesados,
    mensaje: `${procesados} residentes marcados como pendientes de corte`,
  });
}