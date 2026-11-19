-- AgentBridge AB-09 follow-up: sanitized OAuth redemption diagnostics.
-- Additive. Existing consent rows stay permission-granted. No secrets in these columns.

ALTER TABLE agent_bridge_oauth_codes
  ADD COLUMN IF NOT EXISTS request_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE agent_bridge_connections
  ADD COLUMN IF NOT EXISTS last_oauth_request_id uuid,
  ADD COLUMN IF NOT EXISTS last_oauth_reason varchar(80),
  ADD COLUMN IF NOT EXISTS last_oauth_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_oauth_flags jsonb;
