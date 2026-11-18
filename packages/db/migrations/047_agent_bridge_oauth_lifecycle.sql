-- AgentBridge AB-09: honest connection lifecycle.
-- Additive. Existing consent rows stay permission-granted until a token is issued.

ALTER TABLE agent_bridge_connections
  ADD COLUMN IF NOT EXISTS token_issued_at timestamptz;
