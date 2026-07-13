-- 7. Database Index for TOOL_DISPATCHER_AUDIT
-- Creates a partial index on agent_logs to prevent bottleneck when querying the shadow metrics dashboard.

CREATE INDEX IF NOT EXISTS idx_agent_logs_dispatcher_audit 
ON agent_logs (created_at DESC) 
WHERE event_type = 'TOOL_DISPATCHER_AUDIT';

-- Optional: Create a GIN index on metadata if JSON querying becomes a bottleneck
-- CREATE INDEX IF NOT EXISTS idx_agent_logs_metadata_gin ON agent_logs USING GIN (metadata);
