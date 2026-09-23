import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { fraccionamientos } from '@/db/schema';
import { router, roleProcedure } from '../trpc';

export const fraccionamientosRouter = router({
  listar: roleProcedure('admin').query(async () => db
    .select({ id: fraccionamientos.id, nombre: fraccionamientos.nombre, slug: fraccionamientos.slug, activo: fraccionamientos.activo })
    .from(fraccionamientos)
    .where(eq(fraccionamientos.activo, true))),
});
