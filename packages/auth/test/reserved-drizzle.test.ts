import { describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { adaptReservedForDrizzle } from '../../db/src/reserved-client';

function fakeReserved() {
  const unsafe = vi.fn(async (sql: string) => [{ sql }]);
  const reserved = Object.assign(function sql() {
    return [];
  }, {
    unsafe,
    release() {},
  });
  return { reserved, unsafe };
}

describe('adaptReservedForDrizzle', () => {
  it('lets drizzle construct on a reserved client that has no options', () => {
    const { reserved } = fakeReserved();
    const pool = { options: { parsers: {}, serializers: {} } };
    expect(() => drizzle(reserved as never)).toThrow(/parsers/);
    adaptReservedForDrizzle(reserved as never, pool as never);
    expect(() => drizzle(reserved as never)).not.toThrow();
  });

  it('runs begin and commit on the reserved client', async () => {
    const { reserved, unsafe } = fakeReserved();
    const pool = { options: { parsers: {}, serializers: {} } };
    const client = adaptReservedForDrizzle(reserved as never, pool as never);
    await expect(client.begin(async () => 42)).resolves.toBe(42);
    expect(unsafe.mock.calls.map((call) => call[0])).toEqual(['begin', 'commit']);
  });

  it('rolls back when the begin callback throws', async () => {
    const { reserved, unsafe } = fakeReserved();
    const pool = { options: { parsers: {}, serializers: {} } };
    const client = adaptReservedForDrizzle(reserved as never, pool as never);
    await expect(
      client.begin(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(unsafe.mock.calls.map((call) => call[0])).toEqual(['begin', 'rollback']);
  });
});
