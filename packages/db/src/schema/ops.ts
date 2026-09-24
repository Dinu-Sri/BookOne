import { pgTable, uuid, varchar, timestamp, text, integer, primaryKey } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const opsRequestLogs = pgTable('ops_request_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  kind: varchar('kind', { length: 20 }).notNull().default('slow'),
  path: varchar('path', { length: 500 }),
  durationMs: integer('duration_ms'),
  status: varchar('status', { length: 40 }),
  message: text('message'),
});

export const opsIdempotency = pgTable(
  'ops_idempotency',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    key: varchar('key', { length: 80 }).notNull(),
    resultJson: text('result_json').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.key] }),
  }),
);
