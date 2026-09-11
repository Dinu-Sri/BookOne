import { pgTable, uuid, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';

export const tenantRoles = pgTable(
  'tenant_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: varchar('name', { length: 80 }).notNull(),
    slug: varchar('slug', { length: 50 }).notNull(),
    templateKey: varchar('template_key', { length: 50 }),
    templateVersion: varchar('template_version', { length: 10 }),
    isLocked: varchar('is_locked', { length: 1 }).notNull().default('0'),
    customizedAt: timestamp('customized_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
  },
  (t) => ({
    slugUq: uniqueIndex('tenant_roles_slug_uidx').on(t.tenantId, t.slug),
  }),
);

export const tenantRolePermissions = pgTable('tenant_role_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  roleId: uuid('role_id')
    .notNull()
    .references(() => tenantRoles.id),
  permissionKey: varchar('permission_key', { length: 80 }).notNull(),
  level: varchar('level', { length: 10 }).notNull().default('read'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const tenantMembershipRoles = pgTable('tenant_membership_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  membershipId: uuid('membership_id').notNull(),
  roleId: uuid('role_id')
    .notNull()
    .references(() => tenantRoles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const tenantPermissionOverrides = pgTable('tenant_permission_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  permissionKey: varchar('permission_key', { length: 80 }).notNull(),
  effect: varchar('effect', { length: 10 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const tenantTeams = pgTable('tenant_teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  name: varchar('name', { length: 120 }).notNull(),
  roleId: uuid('role_id')
    .notNull()
    .references(() => tenantRoles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const tenantTeamMembers = pgTable('tenant_team_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  teamId: uuid('team_id')
    .notNull()
    .references(() => tenantTeams.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const tenantInvites = pgTable('tenant_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  email: varchar('email', { length: 320 }).notNull(),
  roleId: uuid('role_id')
    .notNull()
    .references(() => tenantRoles.id),
  invitedBy: uuid('invited_by').references(() => users.id),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  acceptedUserId: uuid('accepted_user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});
