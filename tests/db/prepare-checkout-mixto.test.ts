import { describe, expect, it } from 'vitest';
import {
  addCheckoutMixtoEnumSql,
  CHECKOUT_MIXTO_MIGRATION_MILLIS,
  prepareCheckoutMixtoEnum,
  type SqlExecutor,
} from '@/db/scripts/prepare-checkout-mixto';

function executorWithResponses(responses: Array<Array<{ exists: boolean }>>): SqlExecutor & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    async query<T extends Record<string, unknown>>(query: string): Promise<T[]> {
      queries.push(query);
      const response = responses.shift();
      if (!response) throw new Error(`Consulta inesperada: ${query}`);
      return response as unknown as T[];
    },
  };
}

describe('prepareCheckoutMixtoEnum', () => {
  it('confirma mixto antes de que Drizzle ejecute 0052', async () => {
    const executor = executorWithResponses([
      [{ exists: false }], [{ exists: true }], [{ exists: false }], [], [{ exists: true }],
    ]);

    await expect(prepareCheckoutMixtoEnum(executor)).resolves.toEqual({ status: 'prepared' });
    expect(executor.queries).toHaveLength(5);
    expect(executor.queries[0]).toContain(`created_at = ${CHECKOUT_MIXTO_MIGRATION_MILLIS}`);
    expect(executor.queries[3]).toBe(addCheckoutMixtoEnumSql);
  });

  it('no toca el ENUM cuando 0052 ya está registrada', async () => {
    const executor = executorWithResponses([[{ exists: true }]]);
    await expect(prepareCheckoutMixtoEnum(executor)).resolves.toEqual({ status: 'already-applied' });
    expect(executor.queries).toHaveLength(1);
  });

  it('es idempotente cuando mixto ya fue confirmado', async () => {
    const executor = executorWithResponses([
      [{ exists: false }], [{ exists: true }], [{ exists: true }],
    ]);
    await expect(prepareCheckoutMixtoEnum(executor)).resolves.toEqual({ status: 'already-prepared' });
    expect(executor.queries).not.toContain(addCheckoutMixtoEnumSql);
  });

  it('se detiene si el ENUM base no existe', async () => {
    const executor = executorWithResponses([[{ exists: false }], [{ exists: false }]]);
    await expect(prepareCheckoutMixtoEnum(executor)).rejects.toThrow('No existe el ENUM');
    expect(executor.queries).not.toContain(addCheckoutMixtoEnumSql);
  });

  it('se detiene si PostgreSQL no confirma el nuevo valor', async () => {
    const executor = executorWithResponses([
      [{ exists: false }], [{ exists: true }], [{ exists: false }], [], [{ exists: false }],
    ]);
    await expect(prepareCheckoutMixtoEnum(executor)).rejects.toThrow('No se confirmó el valor mixto');
  });
});
