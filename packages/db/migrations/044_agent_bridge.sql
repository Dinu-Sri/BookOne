-- AgentBridge Foundation (AB-01). Additive. Flag defaults OFF.
-- Rollback: DROP the agent_bridge_* tables. No live rows while the flag is off.

CREATE TABLE IF NOT EXISTS agent_bridge_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled varchar(1) NOT NULL DEFAULT '0',
  draft_only varchar(1) NOT NULL DEFAULT '1',
  posting_disabled varchar(1) NOT NULL DEFAULT '1',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_bridge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  status varchar(40) NOT NULL,
  content_hash varchar(64) NOT NULL,
  storage_key text NOT NULL,
  filename text NOT NULL,
  mime varchar(80) NOT NULL,
  bytes integer NOT NULL DEFAULT 0,
  extractor_id text,
  extractor_live varchar(1) NOT NULL DEFAULT '0',
  facts_json jsonb,
  proposal_id uuid,
  proposal_revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_bridge_documents_tenant_idx ON agent_bridge_documents (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_bridge_documents_hash_idx ON agent_bridge_documents (tenant_id, content_hash);

CREATE TABLE IF NOT EXISTS agent_bridge_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  hash text NOT NULL DEFAULT '',
  facts_json jsonb NOT NULL,
  preview_json jsonb,
  issues_json jsonb NOT NULL,
  answered_json jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_bridge_proposals_tenant_idx ON agent_bridge_proposals (tenant_id, document_id);

CREATE TABLE IF NOT EXISTS agent_bridge_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL,
  proposal_hash text NOT NULL,
  preview_version text NOT NULL,
  policy_version text NOT NULL,
  actor_user_id uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS agent_bridge_approvals_tenant_idx ON agent_bridge_approvals (tenant_id, proposal_id);

CREATE TABLE IF NOT EXISTS agent_bridge_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  idempotency_key varchar(80) NOT NULL,
  payload_hash varchar(64) NOT NULL,
  proposal_id uuid NOT NULL,
  approval_id uuid,
  receipt_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_bridge_operations_idem_uq UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS agent_bridge_blobs (
  key text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mime varchar(80) NOT NULL,
  filename text NOT NULL,
  bytes integer NOT NULL DEFAULT 0,
  content text NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_bridge_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_bridge_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  client_id varchar(80) NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agent_bridge_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_bridge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_bridge_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_bridge_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_bridge_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_bridge_blobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_bridge_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_bridge_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_bridge_settings_isolation ON agent_bridge_settings
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY agent_bridge_documents_isolation ON agent_bridge_documents
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY agent_bridge_proposals_isolation ON agent_bridge_proposals
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY agent_bridge_approvals_isolation ON agent_bridge_approvals
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY agent_bridge_operations_isolation ON agent_bridge_operations
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY agent_bridge_blobs_isolation ON agent_bridge_blobs
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY agent_bridge_jobs_isolation ON agent_bridge_jobs
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY agent_bridge_connections_isolation ON agent_bridge_connections
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
