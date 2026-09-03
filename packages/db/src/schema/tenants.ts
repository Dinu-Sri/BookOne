import { pgTable, uuid, varchar, timestamp, jsonb } from 'drizzle-orm/pg-core';

/** Module flags stored on the tenant row (accounting + company are always on). */
export type TenantModulesJson = {
  sales?: boolean;
  purchase?: boolean;
  inventory?: boolean;
  pos?: boolean;
  rental?: boolean;
  hr?: boolean;
};

/** Registration / legal shape of the workspace. */
export type EntityKind = 'personal' | 'sole_prop' | 'company' | 'pending';

/** Sole prop product depth (or derive from modules). */
export type CapabilityTier = 'lite' | 'full';

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
  /**
   * personal | sole_prop | company | pending (awaiting onboarding tiles)
   * Existing tenants default company.
   */
  entityKind: varchar('entity_kind', { length: 20 }).notNull().default('company'),
  /** lite | full — mainly sole_prop; optional */
  capabilityTier: varchar('capability_tier', { length: 20 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});
