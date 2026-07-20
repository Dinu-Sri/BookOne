import { pgTable, uuid, varchar, timestamp, jsonb } from 'drizzle-orm/pg-core';

/** Module flags stored on the tenant row (accounting + company are always on). */
export type TenantModulesJson = {
  sales?: boolean;
  purchase?: boolean;
  inventory?: boolean;
  pos?: boolean;
  hr?: boolean;
};

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  plan: varchar('plan', { length: 50 }).notNull().default('starter'),
  /**
   * production | staging
   * Health-check suite may only run when environment = staging.
   */
  environment: varchar('environment', { length: 20 }).notNull().default('production'),
  /** active | suspended */
  status: varchar('status', { length: 20 }).notNull().default('active'),
  /** Feature flags for sellable modules */
  modules: jsonb('modules').$type<TenantModulesJson>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});
