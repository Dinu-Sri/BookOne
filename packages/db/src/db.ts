import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type ScopedTenantDb = {
  tenantId: string;
  sql: Awaited<ReturnType<ReturnType<typeof postgres>['reserve']>>;
  db: ReturnType<typeof drizzle<typeof schema>>;
};

const tenantAls = new AsyncLocalStorage<ScopedTenantDb>();

const globalForDb = globalThis as unknown as {
  db: ReturnType<typeof drizzle<typeof schema>> | undefined;
  client: ReturnType<typeof postgres> | undefined;
};

function getConnectionUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Cannot connect to database.');
  }
  return url;
}

function createDb() {
  const connectionString = getConnectionUrl();
  const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return { client, db: drizzle(client, { schema }) };
}

function getDb() {
  if (!globalForDb.db || !globalForDb.client) {
    const { db, client } = createDb();
    globalForDb.db = db;
    globalForDb.client = client;
  }
  return { db: globalForDb.db, client: globalForDb.client };
}

export function db() {
  return tenantAls.getStore()?.db ?? getDb().db;
}

export function pgClient() {
  return tenantAls.getStore()?.sql ?? getDb().client;
}

export function currentTenantScopeId(): string | undefined {
  return tenantAls.getStore()?.tenantId;
}

export async function reservePgClient() {
  return getDb().client.reserve();
}

export function drizzleOn(client: ScopedTenantDb['sql']) {
  return drizzle(client, { schema });
}

export function runWithTenantDb<T>(scope: ScopedTenantDb, fn: () => Promise<T>): Promise<T> {
  return tenantAls.run(scope, fn);
}

export type DbClient = ReturnType<typeof getDb>['db'];
