/**
 * Read-only Drizzle view of the CoreGuard tables (guide §4.3). The tables are created by SQL migration
 * 060_coreguard_schema.sql, not by Drizzle. This file is deliberately NOT exported from src/schema/index.ts,
 * so push-additive (which diffs src/schema) never creates, alters or drops anything in the coreguard schema.
 * Import it by path (packages/db/src/coreguard-tables), never through src/schema.
 */
import { bigint, bigserial, date, integer, jsonb, pgSchema, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const coreguardSchema = pgSchema('coreguard');

export const cgBypassLog = coreguardSchema.table('bypass_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  reason: text('reason').notNull(),
  tableName: text('table_name').notNull(),
  operation: text('operation').notNull(),
  txid: bigint('txid', { mode: 'number' }).notNull(),
  loginRole: text('login_role').notNull(),
  appName: text('app_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const cgRuns = coreguardSchema.table('runs', {
  id: uuid('id').primaryKey(),
  kind: text('kind').notNull(),
  trigger: text('trigger').notNull(),
  requestedBy: uuid('requested_by'),
  productVersion: text('product_version').notNull(),
  productSha: text('product_sha').notNull(),
  coreguardVersion: text('coreguard_version').notNull(),
  rulesetHash: text('ruleset_hash').notNull(),
  status: text('status').notNull(),
  stats: jsonb('stats').notNull(),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const cgTenantRuns = coreguardSchema.table('tenant_runs', {
  runId: uuid('run_id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  status: text('status').notNull(),
  checksRun: integer('checks_run').notNull(),
  checksError: integer('checks_error').notNull(),
  durationMs: integer('duration_ms'),
  watermark: timestamp('watermark', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const cgCheckResults = coreguardSchema.table('check_results', {
  runId: uuid('run_id').notNull(),
  tenantId: uuid('tenant_id'),
  checkId: text('check_id').notNull(),
  outcome: text('outcome').notNull(),
  error: text('error'),
  rowsFound: integer('rows_found').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
});

export const cgFindings = coreguardSchema.table('findings', {
  id: uuid('id').primaryKey(),
  fingerprint: text('fingerprint').notNull(),
  checkId: text('check_id').notNull(),
  checkRevision: integer('check_revision').notNull(),
  tenantId: uuid('tenant_id'),
  severity: text('severity').notNull(),
  subject: jsonb('subject').notNull(),
  differenceCents: bigint('difference_cents', { mode: 'bigint' }),
  message: text('message').notNull(),
  status: text('status').notNull(),
  waiverId: text('waiver_id'),
  waiverExpires: date('waiver_expires'),
  acknowledgedBy: uuid('acknowledged_by'),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  acknowledgeNote: text('acknowledge_note'),
  firstSeenRun: uuid('first_seen_run').notNull(),
  lastSeenRun: uuid('last_seen_run').notNull(),
  lastCheckedRun: uuid('last_checked_run'),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  occurrences: integer('occurrences').notNull(),
  resolvedRun: uuid('resolved_run'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

export const cgPeriodFingerprints = coreguardSchema.table('period_fingerprints', {
  lockId: uuid('lock_id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  period: varchar('period', { length: 7 }).notNull(),
  tbHash: text('tb_hash').notNull(),
  tbJson: jsonb('tb_json').notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull(),
  supersededAt: timestamp('superseded_at', { withTimezone: true }),
});

export const cgJobs = coreguardSchema.table('jobs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull(),
  priority: integer('priority').notNull(),
  runAfter: timestamp('run_after', { withTimezone: true }).notNull(),
  status: text('status').notNull(),
  attempts: integer('attempts').notNull(),
  maxAttempts: integer('max_attempts').notNull(),
  lockedBy: text('locked_by'),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const cgRunRequests = coreguardSchema.table('run_requests', {
  id: uuid('id').primaryKey(),
  scope: text('scope').notNull(),
  tenantId: uuid('tenant_id'),
  requestedBy: uuid('requested_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  pickedAt: timestamp('picked_at', { withTimezone: true }),
  jobId: bigint('job_id', { mode: 'number' }),
});

export const cgHeartbeats = coreguardSchema.table('heartbeats', {
  workerId: text('worker_id').primaryKey(),
  productVersion: text('product_version').notNull(),
  productSha: text('product_sha').notNull(),
  coreguardVersion: text('coreguard_version').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  lastBeatAt: timestamp('last_beat_at', { withTimezone: true }).notNull(),
  currentJob: bigint('current_job', { mode: 'number' }),
  info: jsonb('info').notNull(),
});

export const cgCertificates = coreguardSchema.table('certificates', {
  productSha: text('product_sha').primaryKey(),
  productVersion: text('product_version').notNull(),
  coreguardVersion: text('coreguard_version').notNull(),
  rulesetHash: text('ruleset_hash').notNull(),
  ciRunUrl: text('ci_run_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  body: jsonb('body').notNull(),
  importedAt: timestamp('imported_at', { withTimezone: true }).notNull(),
});

export const cgMigrationRuns = coreguardSchema.table('migration_runs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  bootId: uuid('boot_id').notNull(),
  file: text('file').notNull(),
  outcome: text('outcome').notNull(),
  message: text('message'),
  productVersion: text('product_version'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});
