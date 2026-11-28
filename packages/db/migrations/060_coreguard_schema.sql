-- 060_coreguard_schema.sql
-- CoreGuard schema, result tables, seal tables, operation keys, roles and platform helpers.
-- Idempotent: scripts/init-db.ts re-runs every migration on every start.

CREATE SCHEMA IF NOT EXISTS coreguard;

-- ── Roles (NOLOGIN groups; login roles are created by the operator, guide §6.9) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'coreguard_reader')      THEN CREATE ROLE coreguard_reader NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'coreguard_writer')      THEN CREATE ROLE coreguard_writer NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'coreguard_maintenance') THEN CREATE ROLE coreguard_maintenance NOLOGIN; END IF;
END $$;

-- ── Maintenance bypass log (written by guards when an authorised maintenance session changes ledger rows) ──
CREATE TABLE IF NOT EXISTS coreguard.bypass_log (
  id          bigserial PRIMARY KEY,
  reason      text NOT NULL,
  table_name  text NOT NULL,
  operation   text NOT NULL,
  txid        bigint NOT NULL DEFAULT txid_current(),
  login_role  text NOT NULL DEFAULT session_user,
  app_name    text DEFAULT current_setting('application_name', true),
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- ── Seal tables (guard G09) ──
CREATE TABLE IF NOT EXISTS coreguard.entry_seal (
  journal_entry_id uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_xact     xid8 NOT NULL
);
CREATE TABLE IF NOT EXISTS coreguard.tx_seal (
  transaction_id   uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_xact     xid8 NOT NULL
);

-- ── Sentinel runs and results ──
CREATE TABLE IF NOT EXISTS coreguard.runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              text NOT NULL CHECK (kind IN ('sentinel_full','sentinel_incremental','sentinel_tenant','guards','lab','period_fingerprint')),
  trigger           text NOT NULL CHECK (trigger IN ('schedule','deploy','request','boot')),
  requested_by      uuid,
  product_version   text NOT NULL,
  product_sha       text NOT NULL,
  coreguard_version text NOT NULL,
  ruleset_hash      text NOT NULL,
  status            text NOT NULL DEFAULT 'running' CHECK (status IN ('running','finished','failed')),
  stats             jsonb NOT NULL DEFAULT '{}',
  error             text,
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz
);
CREATE INDEX IF NOT EXISTS runs_kind_time_idx ON coreguard.runs (kind, started_at DESC);

CREATE TABLE IF NOT EXISTS coreguard.tenant_runs (
  run_id       uuid NOT NULL REFERENCES coreguard.runs(id),
  tenant_id    uuid NOT NULL,
  status       text NOT NULL CHECK (status IN ('green','amber','known_gaps','red','check_failed')),
  checks_run   int NOT NULL DEFAULT 0,
  checks_error int NOT NULL DEFAULT 0,
  duration_ms  int,
  watermark    timestamptz,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  PRIMARY KEY (run_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS tenant_runs_tenant_time_idx ON coreguard.tenant_runs (tenant_id, started_at DESC);

CREATE TABLE IF NOT EXISTS coreguard.check_results (
  run_id      uuid NOT NULL,
  tenant_id   uuid,
  check_id    text NOT NULL,
  outcome     text NOT NULL CHECK (outcome IN ('passed','violations','error','not_applicable')),
  error       text,
  rows_found  int NOT NULL DEFAULT 0,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX IF NOT EXISTS check_results_uidx
  ON coreguard.check_results (run_id, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), check_id);

CREATE TABLE IF NOT EXISTS coreguard.findings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint      text NOT NULL,
  check_id         text NOT NULL,
  check_revision   int  NOT NULL DEFAULT 1,
  tenant_id        uuid,
  severity         text NOT NULL CHECK (severity IN ('critical','high','warning','info')),
  subject          jsonb NOT NULL,
  difference_cents bigint,
  message          text NOT NULL,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','waived','resolved')),
  waiver_id        text,
  waiver_expires   date,
  acknowledged_by  uuid,          -- triage note only; never used to compute status
  acknowledged_at  timestamptz,
  acknowledge_note text,
  first_seen_run   uuid NOT NULL,
  last_seen_run    uuid NOT NULL,
  last_checked_run uuid,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  occurrences      int NOT NULL DEFAULT 1,
  resolved_run     uuid,
  resolved_at      timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS findings_open_fingerprint_uidx ON coreguard.findings (fingerprint) WHERE status <> 'resolved';
CREATE INDEX IF NOT EXISTS findings_tenant_status_idx ON coreguard.findings (tenant_id, status, severity);

CREATE TABLE IF NOT EXISTS coreguard.period_fingerprints (
  lock_id       uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  period        varchar(7) NOT NULL,
  tb_hash       text NOT NULL,
  tb_json       jsonb NOT NULL,
  computed_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS period_fingerprints_active_uidx
  ON coreguard.period_fingerprints (tenant_id, period) WHERE superseded_at IS NULL;

CREATE TABLE IF NOT EXISTS coreguard.jobs (
  id           bigserial PRIMARY KEY,
  kind         text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}',
  priority     int NOT NULL DEFAULT 100,
  run_after    timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','dead')),
  attempts     int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  locked_by    text,
  locked_at    timestamptz,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_claim_idx ON coreguard.jobs (status, run_after, priority);

CREATE TABLE IF NOT EXISTS coreguard.run_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope        text NOT NULL CHECK (scope IN ('all','tenant','guards','lab')),
  tenant_id    uuid,
  requested_by uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  picked_at    timestamptz,
  job_id       bigint
);

CREATE TABLE IF NOT EXISTS coreguard.heartbeats (
  worker_id         text PRIMARY KEY,
  product_version   text NOT NULL,
  product_sha       text NOT NULL,
  coreguard_version text NOT NULL,
  started_at        timestamptz NOT NULL,
  last_beat_at      timestamptz NOT NULL,
  current_job       bigint,
  info              jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS coreguard.certificates (
  product_sha       text PRIMARY KEY,
  product_version   text NOT NULL,
  coreguard_version text NOT NULL,
  ruleset_hash      text NOT NULL,
  ci_run_url        text,
  created_at        timestamptz NOT NULL,
  body              jsonb NOT NULL,
  imported_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coreguard.migration_runs (
  id              bigserial PRIMARY KEY,
  boot_id         uuid NOT NULL,
  file            text NOT NULL,
  outcome         text NOT NULL CHECK (outcome IN ('applied','skipped','failed')),
  message         text,
  product_version text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Operation keys (retry safety). Tenant data, so it lives in public with RLS. ──
CREATE TABLE IF NOT EXISTS public.ledger_operations (
  tenant_id     uuid NOT NULL,
  operation_key varchar(80) NOT NULL,
  request_hash  text NOT NULL,
  kind          varchar(40) NOT NULL,
  result        jsonb,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, operation_key)
);
ALTER TABLE public.ledger_operations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ledger_operations'
                 AND policyname = 'ledger_operations_isolation') THEN
    CREATE POLICY ledger_operations_isolation ON public.ledger_operations FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
END $$;

-- ── Grants ──
GRANT USAGE ON SCHEMA public, coreguard TO coreguard_reader, coreguard_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO coreguard_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA coreguard TO coreguard_reader, coreguard_writer;
GRANT INSERT, UPDATE ON coreguard.runs, coreguard.tenant_runs, coreguard.check_results, coreguard.findings,
  coreguard.period_fingerprints, coreguard.jobs, coreguard.run_requests, coreguard.heartbeats,
  coreguard.certificates TO coreguard_writer;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA coreguard TO coreguard_writer;

-- ── Platform helper: the tenant-scoped reader cannot list tenants through RLS ──
CREATE OR REPLACE FUNCTION coreguard.list_tenants()
RETURNS TABLE (id uuid, name text, status text, environment text, modules jsonb, entity_kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id, name::text, status::text, environment::text, modules, entity_kind::text
  FROM tenants WHERE voided_at IS NULL
$$;
REVOKE ALL ON FUNCTION coreguard.list_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION coreguard.list_tenants() TO coreguard_reader;
