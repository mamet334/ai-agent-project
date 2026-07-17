const { createClient } = require('@supabase/supabase-js');

function safeNowIso() {
  return new Date().toISOString();
}

function createSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  try {
    return createClient(url, key);
  } catch (e) {
    console.warn('[telemetry] Failed to create supabase client:', e.message);
    return null;
  }
}

const supabaseAdmin = createSupabaseAdmin();

function resolveTraceId(input = {}) {
  return (
    input.trace_id ||
    input.traceId ||
    input?.metadata?.trace_id ||
    input?.headers?.['x-trace-id'] ||
    input?.body?.trace_id ||
    `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

async function persistAgentLog({
  eventType,
  provider = null,
  message = '',
  traceId = null,
  metadata = {}
}) {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from('agent_logs').insert([{
      event_type: eventType,
      provider,
      message,
      created_at: safeNowIso(),
      metadata: {
        ...metadata,
        trace_id: traceId || metadata?.trace_id || null
      }
    }]);
  } catch (e) {
    console.warn('[telemetry] persistAgentLog failed:', e.message);
  }
}

async function persistAiSystemLog({
  traceId = null,
  provider = null,
  model = null,
  latencyMs = null,
  status = 'unknown',
  errorFlag = false,
  costAlertFlag = false,
  memoryFetchCount = 0,
  memoryWriteCount = 0,
  llmCallCount = 0,
  metadata = {}
}) {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from('ai_system_logs').insert([{
      created_at: safeNowIso(),
      provider,
      model,
      latency_ms: latencyMs,
      status,
      error_flag: !!errorFlag,
      cost_alert_flag: !!costAlertFlag,
      memory_fetch_count: memoryFetchCount,
      memory_write_count: memoryWriteCount,
      llm_call_count: llmCallCount,
      metadata: {
        ...metadata,
        trace_id: traceId || metadata?.trace_id || null
      }
    }]);
  } catch (e) {
    console.warn('[telemetry] persistAiSystemLog failed:', e.message);
  }
}

async function persistVerificationLog({
  traceId = null,
  decision = 'UNKNOWN',
  status = 'UNKNOWN',
  failures = null,
  executionTimeMs = null,
  metadata = {}
}) {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from('verification_audit_logs').insert([{
      created_at: safeNowIso(),
      decision,
      status,
      failures,
      execution_time_ms: executionTimeMs,
      metadata: {
        ...metadata,
        trace_id: traceId || metadata?.trace_id || null
      }
    }]);
  } catch (e) {
    console.warn('[telemetry] persistVerificationLog failed:', e.message);
  }
}

async function emitTelemetryEvent({
  eventType,
  traceId,
  provider = null,
  message = '',
  metadata = {}
}) {
  await persistAgentLog({
    eventType,
    provider,
    message,
    traceId,
    metadata
  });
}

module.exports = {
  resolveTraceId,
  emitTelemetryEvent,
  persistAiSystemLog,
  persistVerificationLog
};
