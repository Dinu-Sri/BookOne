-- AgentBridge AB-02: one in-flight/posted/unknown operation per proposal.
-- Additive. Rollback: DROP INDEX agent_bridge_operations_active_proposal_uq;

CREATE UNIQUE INDEX IF NOT EXISTS agent_bridge_operations_active_proposal_uq
  ON agent_bridge_operations (tenant_id, proposal_id)
  WHERE (receipt_json->>'status') IN ('posting', 'posted', 'unknown_outcome');

CREATE UNIQUE INDEX IF NOT EXISTS agent_bridge_jobs_running_document_uq
  ON agent_bridge_jobs (tenant_id, document_id)
  WHERE status IN ('pending', 'running');
