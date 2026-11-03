import type { FullConfig } from '@playwright/test';
import { inArray } from 'drizzle-orm';

/** Remove the deterministic E2E accounts after the suite; related auth and profile rows cascade. */
export default async function globalTeardown(_config: FullConfig) {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl) return;

  process.env.DATABASE_URL = databaseUrl;
  const [{ db }, schema] = await Promise.all([
    import('../../db'),
    import('../../db/schema'),
  ]);

  try {
    const testUserIds = [
      'e2e-residente',
      'e2e-cuadrilla_cortes',
      'e2e-tesorera',
      'e2e-admin',
    ];
    await db.delete(schema.asignacionesFraccionamiento)
      .where(inArray(schema.asignacionesFraccionamiento.usuarioId, testUserIds));
    await db.delete(schema.user).where(inArray(schema.user.id, testUserIds));
  } finally {
    await db.$client.end();
  }
}
