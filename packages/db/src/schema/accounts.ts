import { integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  code: varchar('code', { length: 20 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  normalSide: varchar('normal_side', { length: 10 }).notNull(),
  parentCode: varchar('parent_code', { length: 20 }),
  isActive: varchar('is_active', { length: 1 }).notNull().default('1'),
  description: text('description'),
  subtype: varchar('subtype', { length: 40 }),
  purpose: varchar('purpose', { length: 40 }),
  isGroup: varchar('is_group', { length: 1 }).notNull().default('0'),
  isSystem: varchar('is_system', { length: 1 }).notNull().default('0'),
  isContra: varchar('is_contra', { length: 1 }).notNull().default('0'),
  cashFlowClass: varchar('cash_flow_class', { length: 40 }),
  liquidity: varchar('liquidity', { length: 40 }),
  reconcilable: varchar('reconcilable', { length: 1 }).notNull().default('0'),
  controlRole: varchar('control_role', { length: 40 }),
  version: integer('version').notNull().default(1),
  institution: varchar('institution', { length: 120 }),
  lastDigits: varchar('last_digits', { length: 8 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});
