// Runs before every integration test file.
// MUST execute before @/db is imported so the Neon Pool can only be
// constructed with the explicitly supplied, isolated test database.
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const applicationDatabaseUrl = process.env.DATABASE_URL?.trim();

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL es obligatoria para las pruebas de integracion. ' +
    'Configura una rama/base exclusiva de pruebas; .env.local no se carga.',
  );
}

if (applicationDatabaseUrl && applicationDatabaseUrl === testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL debe ser distinta de DATABASE_URL para impedir escrituras en la base de la aplicacion.',
  );
}

process.env.DATABASE_URL = testDatabaseUrl;
