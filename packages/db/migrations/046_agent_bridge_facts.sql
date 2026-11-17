-- AgentBridge AB-05: awaiting-facts intake, upload sessions, batches, connection metadata.
-- Additive. Existing companies keep Inbox off / draft-only / posting-stop defaults.

ALTER TABLE agent_bridge_documents
  ADD COLUMN IF NOT EXISTS last_error_code varchar(80),
  ADD COLUMN IF NOT EXISTS last_error_message text,
  ADD COLUMN IF NOT EXISTS intake_mode varchar(40);

ALTER TABLE agent_bridge_connections
  ADD COLUMN IF NOT EXISTS scopes text NOT NULL DEFAULT 'read,upload,draft',
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS label text;

CREATE TABLE IF NOT EXISTS agent_bridge_upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  connection_id varchar(80),
  filename text NOT NULL,
  mime varchar(80) NOT NULL,
  declared_bytes integer,
  expected_hash varchar(64),
  request_key varchar(80),
  content text,
  expires_at timestamptz NOT NULL,
  finalized_document_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_bridge_upload_sessions_tenant_idx
  ON agent_bridge_upload_sessions (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_bridge_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  items_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_bridge_batches_tenant_idx
  ON agent_bridge_batches (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_bridge_facts_keys (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key varchar(120) NOT NULL,
  payload_hash varchar(64) NOT NULL,
  document_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS agent_bridge_oauth_codes (
  code varchar(120) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  client_id varchar(80) NOT NULL,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method varchar(10) NOT NULL DEFAULT 'S256',
  scopes text NOT NULL,
  connection_id uuid,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

ALTER TABLE agent_bridge_upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_bridge_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_bridge_facts_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_bridge_oauth_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_bridge_upload_sessions_isolation ON agent_bridge_upload_sessions
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY agent_bridge_batches_isolation ON agent_bridge_batches
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY agent_bridge_facts_keys_isolation ON agent_bridge_facts_keys
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY agent_bridge_oauth_codes_isolation ON agent_bridge_oauth_codes
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
