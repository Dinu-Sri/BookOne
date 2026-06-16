import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

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
  return getDb().db;
}

export function pgClient() {
  return getDb().client;
}

export type DbClient = ReturnType<typeof getDb>['db'];
