import { Pool } from '@neondatabase/serverless';

/**
 * Drizzle Kit ejecuta las migraciones PostgreSQL pendientes dentro de una sola
 * transacción. PostgreSQL no permite usar un valor ENUM recién agregado hasta
 * confirmarlo; por eso 0052 requiere este paso autónomo previo.
 */
export const CHECKOUT_MIXTO_MIGRATION_MILLIS = 1792108800000;
export const CHECKOUT_MIXTO_ENUM = 'mercado_pago_intent_tipo';
export const CHECKOUT_MIXTO_ENUM_VALUE = 'mixto';

const enumExistsSql = `
  SELECT to_regtype('public.${CHECKOUT_MIXTO_ENUM}') IS NOT NULL AS exists
`;

const enumValueExistsSql = `
  SELECT EXISTS (
    SELECT 1
    FROM pg_enum enum_value
    INNER JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
    INNER JOIN pg_namespace enum_schema ON enum_schema.oid = enum_type.typnamespace
    WHERE enum_schema.nspname = 'public'
      AND enum_type.typname = '${CHECKOUT_MIXTO_ENUM}'
      AND enum_value.enumlabel = '${CHECKOUT_MIXTO_ENUM_VALUE}'
  ) AS exists
`;

const migrationAppliedSql = `
  SELECT EXISTS (
    SELECT 1
    FROM drizzle.__drizzle_migrations
    WHERE created_at = ${CHECKOUT_MIXTO_MIGRATION_MILLIS}
  ) AS exists
`;

export const addCheckoutMixtoEnumSql = `
ALTER TYPE public.${CHECKOUT_MIXTO_ENUM}
ADD VALUE IF NOT EXISTS '${CHECKOUT_MIXTO_ENUM_VALUE}';
`;

type ExistsRow = { exists: boolean | 't' | 'f' };

export interface SqlExecutor {
  query<T extends Record<string, unknown> = Record<string, unknown>>(query: string): Promise<T[]>;
}

function exists(rows: ExistsRow[]): boolean {
  const value = rows[0]?.exists;
  return value === true || value === 't';
}

export type CheckoutMixtoBootstrapResult =
  | { status: 'already-applied' }
  | { status: 'already-prepared' }
  | { status: 'prepared' };

/**
 * Each query is deliberately independent. Do not wrap this in BEGIN/COMMIT:
 * ALTER TYPE must commit before drizzle-kit migrate executes 0052.
 */
export async function prepareCheckoutMixtoEnum(executor: SqlExecutor): Promise<CheckoutMixtoBootstrapResult> {
  if (exists(await executor.query<ExistsRow>(migrationAppliedSql))) {
    return { status: 'already-applied' };
  }

  if (!exists(await executor.query<ExistsRow>(enumExistsSql))) {
    throw new Error(`No existe el ENUM public.${CHECKOUT_MIXTO_ENUM}; no es seguro preparar 0052.`);
  }

  if (exists(await executor.query<ExistsRow>(enumValueExistsSql))) {
    return { status: 'already-prepared' };
  }

  await executor.query(addCheckoutMixtoEnumSql);

  if (!exists(await executor.query<ExistsRow>(enumValueExistsSql))) {
    throw new Error(`No se confirmó el valor ${CHECKOUT_MIXTO_ENUM_VALUE} del ENUM; no ejecutes Drizzle Kit.`);
  }

  return { status: 'prepared' };
}

async function main(): Promise<void> {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Falta DIRECT_URL o DATABASE_URL.');

  const pool = new Pool({ connectionString, max: 1 });
  try {
    const result = await prepareCheckoutMixtoEnum({
      query: async <T extends Record<string, unknown>>(query: string): Promise<T[]> => {
        const result = await pool.query(query);
        return result.rows as T[];
      },
    });
    console.log(`Checkout mixto: ${result.status}.`);
    console.log('El valor ENUM está confirmado. Ahora puedes ejecutar drizzle-kit migrate en este mismo entorno.');
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('prepare-checkout-mixto.ts')) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
