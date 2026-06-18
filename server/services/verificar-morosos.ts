// server/services/verificar-morosos.ts
import { db } from '@/db';
import { pagos, perfilesResidente } from '@/db/schema';
import { and, eq, notInArray } from 'drizzle-orm';

export async function verificarYActualizarMorosos() {
  const ahora = new Date();
  const dia = ahora.getDate();
  const mes = ahora.getMonth() + 1;
  const anio = ahora.getFullYear();

  // Solo ejecutar después del día 5
  if (dia <= 5) {
    return { procesados: 0, mensaje: 'No es día de corte (antes del día 6)' };
  }

  // Obtener IDs de residentes que SÍ pagaron este mes
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

  // Obtener residentes activos que NO pagaron
  const morosos = await db
    .select({ id: perfilesResidente.id })
    .from(perfilesResidente)
    .where(
      and(
        idsPagados.length > 0 
          ? notInArray(perfilesResidente.id, idsPagados) 
          : undefined,
        eq(perfilesResidente.estadoAgua, 'activo')
      )
    );

  // Actualizar estado a 'pendiente_corte'
  let procesados = 0;
  for (const m of morosos) {
    await db
      .update(perfilesResidente)
      .set({ estadoAgua: 'pendiente_corte' })
      .where(eq(perfilesResidente.id, m.id));
    procesados++;
  }

  return { 
    procesados, 
    mensaje: `${procesados} residentes marcados como pendientes de corte` 
  };
}