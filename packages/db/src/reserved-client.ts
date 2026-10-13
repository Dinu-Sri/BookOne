import type postgres from 'postgres';

export type PoolSql = ReturnType<typeof postgres>;
export type ReservedSql = Awaited<ReturnType<PoolSql['reserve']>>;

export type DrizzleSql = ReservedSql & {
  options: PoolSql['options'];
  begin: PoolSql['begin'];
  savepoint?: (fn: (sql: ReservedSql) => Promise<unknown>) => Promise<unknown>;
};

/**
 * postgres.js `reserve()` returns a tagged Sql without pool `options` / `begin`.
 * drizzle-orm reads `client.options.parsers` at construct time and later calls
 * `client.begin` for `db().transaction`. Attach those on the reserved client so
 * tenant-scoped queries stay on the same connection.
 */
export function adaptReservedForDrizzle(reserved: ReservedSql, pool: Pick<PoolSql, 'options'>): DrizzleSql {
  const client = reserved as DrizzleSql;
  if (!client.options) {
    client.options = pool.options;
  }
  if (typeof client.begin !== 'function') {
    client.begin = (async (optionsOrFn: unknown, maybeFn?: unknown) => {
      const fn = typeof optionsOrFn === 'function' ? optionsOrFn : maybeFn;
      const mode = typeof optionsOrFn === 'string' ? optionsOrFn.replace(/[^a-z ]/gi, '') : '';
      if (typeof fn !== 'function') {
        throw new Error('Reserved connection begin requires a callback.');
      }
      await reserved.unsafe(mode ? `begin ${mode}` : 'begin');
      try {
        const result = await fn(client);
        await reserved.unsafe('commit');
        return result;
      } catch (error) {
        try {
          await reserved.unsafe('rollback');
        } catch {
          // Keep the original error.
        }
        throw error;
      }
    }) as PoolSql['begin'];
  }
  if (typeof client.savepoint !== 'function') {
    let savepointSeq = 0;
    client.savepoint = async (fn) => {
      if (typeof fn !== 'function') {
        throw new Error('Reserved connection savepoint requires a callback.');
      }
      const name = `s${savepointSeq++}`;
      await reserved.unsafe(`savepoint ${name}`);
      try {
        return await fn(client);
      } catch (error) {
        try {
          await reserved.unsafe(`rollback to ${name}`);
        } catch {
          // Keep the original error.
        }
        throw error;
      }
    };
  }
  return client;
}
