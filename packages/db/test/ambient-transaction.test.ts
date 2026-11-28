import { describe, expect, it } from 'vitest';
import { activeTransaction, withAmbientTransactions, withoutAmbientTransaction } from '../src/ambient-transaction';

/** Minimal drizzle-like client: top level = BEGIN/COMMIT, a transaction's .transaction = SAVEPOINT. */
function fakeClient(log: string[], name = 'pool', depth = 0) {
  const client = {
    name,
    async insert(table: string) {
      log.push(`${name}:insert ${table}`);
    },
    async transaction<T>(cb: (tx: ReturnType<typeof fakeClient>) => Promise<T>): Promise<T> {
      const tx = fakeClient(log, `${name}>tx${depth + 1}`, depth + 1);
      log.push(depth === 0 ? `${name}:begin` : `${name}:savepoint`);
      try {
        const out = await cb(tx);
        log.push(depth === 0 ? `${name}:commit` : `${name}:release`);
        return out;
      } catch (error) {
        log.push(depth === 0 ? `${name}:rollback` : `${name}:rollback to savepoint`);
        throw error;
      }
    },
  };
  return client;
}

// Same shape as packages/db/src/db.ts → db().
function makeDb(base: ReturnType<typeof fakeClient>) {
  return () => activeTransaction<ReturnType<typeof fakeClient>>() ?? withAmbientTransactions(base);
}

describe('ambient ledger transaction', () => {
  it('db() inside a transaction callback is that transaction', async () => {
    const log: string[] = [];
    const db = makeDb(fakeClient(log));
    await db().transaction(async () => {
      await db().insert('transactions');
      await Promise.resolve();
      await db().insert('journal_lines');
    });
    expect(log).toEqual(['pool:begin', 'pool>tx1:insert transactions', 'pool>tx1:insert journal_lines', 'pool:commit']);
    expect(activeTransaction()).toBeUndefined();
  });

  it('a nested db().transaction is a savepoint, and the outer commit comes last', async () => {
    const log: string[] = [];
    const db = makeDb(fakeClient(log));
    await db().transaction(async () => {
      await db().insert('transactions');
      await db().transaction(async () => {
        await db().insert('journal_entries');
      });
      await db().insert('settlement_allocations');
    });
    expect(log).toEqual([
      'pool:begin',
      'pool>tx1:insert transactions',
      'pool>tx1:savepoint',
      'pool>tx1>tx2:insert journal_entries',
      'pool>tx1:release',
      'pool>tx1:insert settlement_allocations',
      'pool:commit',
    ]);
  });

  it('an error after a nested posting rolls back the whole outer transaction', async () => {
    const log: string[] = [];
    const db = makeDb(fakeClient(log));
    await expect(
      db().transaction(async () => {
        await db().transaction(async () => db().insert('journal_entries'));
        throw new Error('allocation refused');
      }),
    ).rejects.toThrow('allocation refused');
    expect(log.at(-1)).toBe('pool:rollback');
    expect(log).not.toContain('pool:commit');
  });

  it('withoutAmbientTransaction gives a new connection scope no ambient transaction', async () => {
    const log: string[] = [];
    const db = makeDb(fakeClient(log));
    await db().transaction(async () => {
      expect(activeTransaction()).toBeDefined();
      await withoutAmbientTransaction(async () => {
        expect(activeTransaction()).toBeUndefined();
      });
    });
  });

  it('keeps other properties of the wrapped client', () => {
    const base = fakeClient([], 'x');
    const wrapped = withAmbientTransactions(base);
    expect(wrapped.name).toBe('x');
    expect(withAmbientTransactions(base)).toBe(wrapped);
  });
});
