import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Migrations need a direct (non-pooler) connection for DDL statements.
    // Set DIRECT_URL to the non-pooler Neon URL; fallback to DATABASE_URL for local dev.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
})