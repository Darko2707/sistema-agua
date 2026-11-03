import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

// Load only the explicit test file. Never inherit .env or .env.local through
// Vite's normal env discovery for database integration tests.
loadDotenv({ path: resolve(process.cwd(), '.env.test'), quiet: true });

function databaseIdentity(rawUrl: string, name: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${name} no contiene una URL PostgreSQL válida.`);
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`${name} debe usar el protocolo PostgreSQL.`);
  }

  // Pooler and direct Neon endpoints can address the same database. Strip the
  // pooler marker before comparing host/database identity, ignoring credentials
  // and SSL query options that do not isolate data.
  const host = url.hostname.toLowerCase().replace(/-pooler(?=\.)/, '');
  const database = decodeURIComponent(url.pathname.replace(/^\//, '')).toLowerCase();
  return `${host}/${database}`;
}

export function getValidatedTestDatabaseUrl(): string {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
  if (!testDatabaseUrl) {
    throw new Error(
      'TEST_DATABASE_URL es obligatoria. Define una base PostgreSQL exclusiva en .env.test o en el entorno del proceso.',
    );
  }

  const testIdentity = databaseIdentity(testDatabaseUrl, 'TEST_DATABASE_URL');
  for (const [name, value] of [
    ['DATABASE_URL', process.env.DATABASE_URL],
    ['DIRECT_URL', process.env.DIRECT_URL],
  ] as const) {
    const applicationUrl = value?.trim();
    if (applicationUrl && databaseIdentity(applicationUrl, name) === testIdentity) {
      throw new Error(`${name} y TEST_DATABASE_URL apuntan a la misma base; se aborta para proteger desarrollo/producción.`);
    }
  }

  return testDatabaseUrl;
}

export function configureTestDatabase(): string {
  const testDatabaseUrl = getValidatedTestDatabaseUrl();
  process.env.DATABASE_URL = testDatabaseUrl;
  return testDatabaseUrl;
}
