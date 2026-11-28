import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Ambient ledger transaction (CoreGuard guide §4.2).
 *
 * Inside `db().transaction(cb)`, every `db()` call returns that transaction. Helpers that call `db()` therefore
 * join the caller's transaction instead of using another pool connection, and a nested `db().transaction(...)`
 * becomes a savepoint of the outer transaction instead of a second BEGIN on the same connection (whose COMMIT
 * used to end the outer transaction early).
 */
type TransactionalClient = {
  transaction: (cb: (tx: never) => Promise<unknown>, config?: unknown) => Promise<unknown>;
};

const txStore = new AsyncLocalStorage<object | undefined>();
const proxies = new WeakMap<object, object>();

/** The transaction the current async call chain is running in, if any. */
export function activeTransaction<T extends object>(): T | undefined {
  return txStore.getStore() as T | undefined;
}

/** Run `fn` with no ambient transaction (a new tenant connection never inherits another connection's one). */
export function withoutAmbientTransaction<T>(fn: () => T): T {
  return txStore.run(undefined, fn);
}

/** Wrap a drizzle database or transaction so that `.transaction(cb)` makes its tx the ambient one for `cb`. */
export function withAmbientTransactions<T extends object>(client: T): T {
  const cached = proxies.get(client);
  if (cached) return cached as T;
  const proxy = new Proxy(client, {
    get(target, prop) {
      if (prop === 'transaction') {
        const original = (target as unknown as TransactionalClient).transaction;
        return (cb: (tx: unknown) => Promise<unknown>, config?: unknown) =>
          original.call(
            target,
            ((tx: object) => {
              const scoped = withAmbientTransactions(tx);
              return txStore.run(scoped, () => cb(scoped));
            }) as (tx: never) => Promise<unknown>,
            config,
          );
      }
      return Reflect.get(target, prop, target);
    },
  });
  proxies.set(client, proxy);
  return proxy;
}
