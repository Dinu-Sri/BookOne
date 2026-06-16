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

let _db: ReturnType<typeof drizzle<typeof schema>>;
let _client: ReturnType<typeof postgres>;

function getDb() {
  if (!globalForDb.db || !globalForDb.client) {
    const { db, client } = createDb();
    globalForDb.db = db;
    globalForDb.client = client;
  }
  _db = globalForDb.db;
  _client = globalForDb.client;
  return { db: _db, client: _client };
}

export const { db, client } = getDb();
export type DbClient = typeof db;
