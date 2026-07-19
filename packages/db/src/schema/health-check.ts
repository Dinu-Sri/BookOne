import { pgTable, uuid, varchar, timestamp, text, integer } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';

/** One run of the ERP health-check suite (staging tenants only). */
export const healthCheckRuns = pgTable('health_check_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  status: varchar('status', { length: 20 }).notNull().default('running'), // running | passed | failed | cancelled
  suite: varchar('suite', { length: 40 }).notNull().default('full'), // full | core
  seed: integer('seed').notNull().default(0),
  /** JSON array of step results */
  stepsJson: text('steps_json').notNull().default('[]'),
  /** JSON map of created resource ids for optional wipe */
  createdJson: text('created_json').notNull().default('{}'),
  summary: varchar('summary', { length: 500 }),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
