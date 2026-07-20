import { pgTable, uuid, varchar, timestamp, jsonb, text } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';

/** Cross-tenant SaaS operator audit trail (platform console). */
export const platformAuditEvents = pgTable('platform_audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id')
    .notNull()
    .references(() => users.id),
  targetTenantId: uuid('target_tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 80 }).notNull(),
  summary: varchar('summary', { length: 500 }),
  meta: jsonb('meta').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
