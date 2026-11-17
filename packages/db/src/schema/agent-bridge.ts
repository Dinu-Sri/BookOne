import { pgTable, uuid, varchar, timestamp, text, integer, jsonb } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';

export const agentBridgeSettings = pgTable('agent_bridge_settings', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id),
  enabled: varchar('enabled', { length: 1 }).notNull().default('0'),
  draftOnly: varchar('draft_only', { length: 1 }).notNull().default('1'),
  postingDisabled: varchar('posting_disabled', { length: 1 }).notNull().default('1'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agentBridgeDocuments = pgTable('agent_bridge_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  status: varchar('status', { length: 40 }).notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  storageKey: text('storage_key').notNull(),
  filename: text('filename').notNull(),
  mime: varchar('mime', { length: 80 }).notNull(),
  bytes: integer('bytes').notNull().default(0),
  extractorId: text('extractor_id'),
  extractorLive: varchar('extractor_live', { length: 1 }).notNull().default('0'),
  factsJson: jsonb('facts_json'),
  proposalId: uuid('proposal_id'),
  proposalRevision: integer('proposal_revision').notNull().default(0),
  lastErrorCode: varchar('last_error_code', { length: 80 }),
  lastErrorMessage: text('last_error_message'),
  intakeMode: varchar('intake_mode', { length: 40 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agentBridgeProposals = pgTable('agent_bridge_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  documentId: uuid('document_id').notNull(),
  revision: integer('revision').notNull().default(1),
  hash: text('hash').notNull().default(''),
  factsJson: jsonb('facts_json').notNull(),
  previewJson: jsonb('preview_json'),
  issuesJson: jsonb('issues_json').notNull(),
  answeredJson: jsonb('answered_json').notNull(),
});

export const agentBridgeApprovals = pgTable('agent_bridge_approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  proposalId: uuid('proposal_id').notNull(),
  proposalHash: text('proposal_hash').notNull(),
  previewVersion: text('preview_version').notNull(),
  policyVersion: text('policy_version').notNull(),
  actorUserId: uuid('actor_user_id').notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export const agentBridgeOperations = pgTable('agent_bridge_operations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  idempotencyKey: varchar('idempotency_key', { length: 80 }).notNull(),
  payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
  proposalId: uuid('proposal_id').notNull(),
  approvalId: uuid('approval_id'),
  receiptJson: jsonb('receipt_json').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agentBridgeBlobs = pgTable('agent_bridge_blobs', {
  key: text('key').primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  mime: varchar('mime', { length: 80 }).notNull(),
  filename: text('filename').notNull(),
  bytes: integer('bytes').notNull().default(0),
  content: text('content').notNull(),
});

export const agentBridgeJobs = pgTable('agent_bridge_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  documentId: uuid('document_id').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agentBridgeConnections = pgTable('agent_bridge_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  userId: uuid('user_id').notNull(),
  clientId: varchar('client_id', { length: 80 }).notNull(),
  scopes: text('scopes').notNull().default('read,upload,draft'),
  label: text('label'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agentBridgeUploadSessions = pgTable('agent_bridge_upload_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  userId: uuid('user_id').notNull(),
  connectionId: varchar('connection_id', { length: 80 }),
  filename: text('filename').notNull(),
  mime: varchar('mime', { length: 80 }).notNull(),
  declaredBytes: integer('declared_bytes'),
  expectedHash: varchar('expected_hash', { length: 64 }),
  requestKey: varchar('request_key', { length: 80 }),
  content: text('content'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  finalizedDocumentId: uuid('finalized_document_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agentBridgeBatches = pgTable('agent_bridge_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  userId: uuid('user_id').notNull(),
  itemsJson: jsonb('items_json').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agentBridgeFactsKeys = pgTable('agent_bridge_facts_keys', {
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  key: varchar('key', { length: 120 }).notNull(),
  payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
  documentId: uuid('document_id').notNull(),
});

export const agentBridgeOauthCodes = pgTable('agent_bridge_oauth_codes', {
  code: varchar('code', { length: 120 }).primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  userId: uuid('user_id').notNull(),
  clientId: varchar('client_id', { length: 80 }).notNull(),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  codeChallengeMethod: varchar('code_challenge_method', { length: 10 }).notNull().default('S256'),
  scopes: text('scopes').notNull(),
  connectionId: uuid('connection_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});
