// ExecutionTraceService
// Responsibility:
// - fetch execution events by trace_id from existing telemetry sources
// - normalize into a UI-friendly timeline format
// - sort chronologically by created_at (ASC)
//
// IMPORTANT:
// - No schema changes
// - No backend refactor
// - No synthetic/mock events

import { supabase } from '../supabase';

const TIMELINE_EVENT_ORDER = [
  'User.Request',
  'capability',
  'tool',
  'response',
  'verification'
];

export function normalizeAgentLogsEvent(row) {
  // Expected shape from persistTelemetryLog (runtime_context.ts + subscribers)
  // public.agent_logs:
  // - event_type
  // - provider
  // - message
  // - created_at
  // - metadata (JSONB)
  const eventType = row.event_type || row.eventType;
  const metadata = row.metadata || row?.metadata_json || {};

  const createdAt = row.created_at ? new Date(row.created_at).toISOString() : null;

  // Derive domain + status from known event types
  if (eventType === 'Capability.Executed') {
    return {
      type: 'capability',
      event: 'Capability.Executed',
      status: 'success',
      timestamp: createdAt,
      durationMs: metadata?.duration_ms ?? metadata?.durationMs ?? undefined,
      metadata: {
        ...metadata,
        provider: row.provider || metadata?.provider
      }
    };
  }

  if (eventType === 'Tool.Requested') {
    return {
      type: 'tool',
      event: 'Tool.Requested',
      status: 'pending',
      timestamp: createdAt,
      metadata: {
        ...metadata,
        provider: row.provider || metadata?.provider
      }
    };
  }

  if (eventType === 'Tool.Invoked') {
    return {
      type: 'tool',
      event: 'Tool.Invoked',
      status: 'running',
      timestamp: createdAt,
      metadata: {
        ...metadata,
        provider: row.provider || metadata?.provider
      }
    };
  }

  if (eventType === 'Tool.Completed') {
    const status = metadata?.status || metadata?.tool_status || 'success';

    // Map existing statuses to UI statuses without creating new rules.
    let uiStatus = 'success';
    if (typeof status === 'string') {
      const s = status.toLowerCase();
      if (s.includes('timeout')) uiStatus = 'timeout';
      else if (s.includes('fail') || s.includes('error')) uiStatus = 'failed';
      else if (s.includes('fail_') || s.includes('failure')) uiStatus = 'failed';
      else uiStatus = status;
    }

    return {
      type: 'tool',
      event: 'Tool.Completed',
      status: uiStatus,
      timestamp: createdAt,
      durationMs: metadata?.durationMs ?? metadata?.duration_ms ?? undefined,
      metadata: {
        ...metadata,
        provider: row.provider || metadata?.provider
      }
    };
  }

  if (eventType === 'Response.Generated') {
    return {
      type: 'response',
      event: 'Response.Generated',
      status: 'success',
      timestamp: createdAt,
      metadata: {
        ...metadata,
        provider: row.provider || metadata?.provider
      }
    };
  }

  // Fallback for unknown event_type but still show it if correlated
  return {
    type: 'misc',
    event: eventType || 'Unknown',
    status: 'unknown',
    timestamp: createdAt,
    metadata: {
      ...metadata,
      provider: row.provider || metadata?.provider,
      message: row.message
    }
  };
}

export async function fetchExecutionTrace({ traceId, limit = 200 }) {
  if (!traceId) return { traceId: null, timeline: [], sources: { agent_logs: 0, verification_audit_logs: 0 } };

  // 1) agent_logs (event bus telemetry)
  const { data: agentLogsRows, error: agentLogsError } = await supabase
    .from('agent_logs')
    .select('id, event_type, provider, message, created_at, metadata')
    .eq('metadata->>trace_id', traceId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (agentLogsError) {
    // No synthetic data; just return empty with error context.
    console.error('fetchExecutionTrace: agent_logs error', agentLogsError);
    throw agentLogsError;
  }

  const normalizedAgentEvents = (agentLogsRows || []).map(normalizeAgentLogsEvent);

  // 2) verification_audit_logs (failure visualization)
  // We only include rows that match trace_id inside metadata (if it exists).
  const { data: verifRows, error: verifError } = await supabase
    .from('verification_audit_logs')
    .select('id, created_at, decision, status, failures, metadata')
    .eq('metadata->>trace_id', traceId)
    .order('created_at', { ascending: true })
    .limit(50);

  if (verifError) {
    // Verification might not have metadata.trace_id; do not fail the whole trace.
    console.warn('fetchExecutionTrace: verification_audit_logs error (non-fatal)', verifError);
  }

  const normalizedVerification = (verifRows || []).map(r => {
    const createdAt = r.created_at ? new Date(r.created_at).toISOString() : null;
    const status = r.status || r.decision || 'unknown';
    const failures = r.failures || r.metadata?.failures || null;

    // Failure visualization: only based on existing fields.
    // If status/decision indicates failure, mark failed.
    let uiStatus = 'success';
    if (typeof status === 'string') {
      const s = status.toLowerCase();
      if (s.includes('fail') || s.includes('error')) uiStatus = 'failed';
      if (s.includes('timeout')) uiStatus = 'timeout';
    }

    return {
      type: 'verification',
      event: 'Verification.Completed',
      status: uiStatus,
      timestamp: createdAt,
      metadata: {
        ...(r.metadata || {}),
        decision: r.decision,
        status: r.status,
        failures
      }
    };
  });

  const timeline = [...normalizedAgentEvents, ...normalizedVerification]
    .filter(e => e && e.timestamp)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    traceId,
    timeline,
    sources: {
      agent_logs: agentLogsRows?.length || 0,
      verification_audit_logs: verifRows?.length || 0
    }
  };
}

