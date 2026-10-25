import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = readFileSync(resolve(root, 'db/migrations/0052_checkout_mixto.sql'), 'utf8');
const journal = JSON.parse(readFileSync(resolve(root, 'db/migrations/meta/_journal.json'), 'utf8')) as {
  entries: Array<{ idx: number; when: number; tag: string }>;
};
const bootstrap = readFileSync(resolve(root, 'db/scripts/prepare-checkout-mixto.ts'), 'utf8');

describe('guardia de migración para checkout mixto', () => {
  it('mantiene 0052 inmutable y registrada con su timestamp histórico', () => {
    expect(journal.entries).toContainEqual(expect.objectContaining({
      idx: 52, tag: '0052_checkout_mixto', when: 1792108800000,
    }));
  });

  it('protege el ENUM de 0052 con un bootstrap externo a Drizzle', () => {
    expect(migration).toContain("ALTER TYPE mercado_pago_intent_tipo ADD VALUE IF NOT EXISTS 'mixto'");
    expect(migration).toContain("tipo = 'mixto'");
    expect(bootstrap).toContain("ADD VALUE IF NOT EXISTS '${CHECKOUT_MIXTO_ENUM_VALUE}'");
    expect(bootstrap).toContain('Do not wrap this');
    expect(bootstrap).toContain('drizzle.__drizzle_migrations');
  });
});
