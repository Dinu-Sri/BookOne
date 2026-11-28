import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { withAmbientTransactions } from './ambient-transaction';
import * as schema from './schema';

/**
 * CoreGuard maintenance connection (guide §4.6, D12).
 *
 * Only `packages/db/src/archive/restore.ts` and CoreGuard cleanup/lab code may use it (CI-7). It connects with
 * MAINTENANCE_DATABASE_URL (login `bookone_maintenance`, member of `coreguard_maintenance`), and every
 * transaction must start with `SET LOCAL bookone.ledger_maintenance = '<reason>'`. The guards check the
 * login's role membership and log every statement in `coreguard.bypass_log`.
 *
 * Inside `maintenanceDb().transaction(cb)`, `db()` returns that maintenance transaction (ambient transaction),
 * so helpers called from the callback run on the same connection.
 *
 * No `server-only` import: `scripts/coreguard/seed.ts` (pilot cleanup, run with tsx) uses `maintenanceSql()`.
 */
const globalForMaintenance = globalThis as unknown as {
  maintenanceDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
  maintenanceClient: ReturnType<typeof postgres> | undefined;
};

function maintenanceUrl(): string {
  const url = process.env.MAINTENANCE_DATABASE_URL?.trim();
  if (!url) {
    throw new Error('MAINTENANCE_DATABASE_URL is not set. Ledger maintenance (archive restore) is unavailable.');
  }
  return url;
}

/** Raw postgres.js client on the maintenance login (scripts). Start each transaction with the SET LOCAL. */
export function maintenanceSql(): ReturnType<typeof postgres> {
  if (!globalForMaintenance.maintenanceClient) {
    globalForMaintenance.maintenanceClient = postgres(maintenanceUrl(), { max: 2, idle_timeout: 20, connect_timeout: 10 });
  }
  return globalForMaintenance.maintenanceClient;
}

/** Drizzle on the maintenance login. Start each transaction with the SET LOCAL. */
export function maintenanceDb() {
  if (!globalForMaintenance.maintenanceDb) {
    globalForMaintenance.maintenanceDb = drizzle(maintenanceSql(), { schema });
  }
  return withAmbientTransactions(globalForMaintenance.maintenanceDb);
}

/** Close the maintenance pool (scripts and tests). */
export async function closeMaintenanceDb(): Promise<void> {
  const client = globalForMaintenance.maintenanceClient;
  globalForMaintenance.maintenanceClient = undefined;
  globalForMaintenance.maintenanceDb = undefined;
  if (client) await client.end({ timeout: 5 });
}
