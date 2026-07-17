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

const PIPELINE_STEPS = [
  { key: 'intent', label: 'Intent' },
  { key: 'memory', label: 'Memory Retrieval' },
  { key: 'rag', label: 'RAG Retrieval' },
  { key: 'planner', label: 'Planner' },
  { key: 'tool', label: 'Tool Execution' },
  { key: 'verification', label: 'Verification' },
  { key: 'provider', label: 'Provider' },
  { key: 'response', label: 'Response Generation' },
  { key: 'memory_writeback', label: 'Memory Writeback' },
  { key: 'delivery', label: 'Delivery' }
];

const STEP_ALIASES = {
  intent: ['intent', 'user.request', 'request.received', 'request'],
  memory: ['memory', 'memory retrieval', 'memory.read', 'memory.fetch', 'memory.retrieval'],
  rag: ['rag', 'rag retrieval', 'retrieval', 'kb.retrieval', 'knowledge.retrieval'],
  planner: ['planner', 'plan', 'planning', 'task.plan'],
  tool: ['tool', 'tool execution', 'tool.requested', 'tool.invoked', 'tool.completed'],
  verification: ['verification', 'verify', 'policy check', 'verification.completed'],
  provider: ['provider', 'llm', 'model', 'provider.call'],
  response: ['response', 'response generation', 'response.generated'],
  memory_writeback: ['memory writeback', 'writeback', 'memory.write', 'memory.persist'],
  delivery: ['delivery', 'final delivery', 'send', 'delivered']
};

function normalizeStatus(status) {
  if (!status || typeof status !== 'string') return 'unknown';
  const s = status.toLowerCase();
  if (s.includes('timeout')) return 'failed';
  if (s.includes('fail') || s.includes('error') || s.includes('down')) return 'failed';
  if (s.includes('run') || s.includes('pend') || s.includes('progress')) return 'running';
  if (s.includes('success') || s.includes('ok') || s.includes('done') || s.includes('pass')) return 'success';
  return 'unknown';
}

function inferStepFromEvent(row, normalizedEvent) {
  const eventType = String(row?.event_type || row?.eventType || normalizedEvent?.event || '').toLowerCase();
  const eventName = String(normalizedEvent?.event || '').toLowerCase();
  const message = String(row?.message || normalizedEvent?.metadata?.message || '').toLowerCase();
  const provider = String(row?.provider || normalizedEvent?.metadata?.provider || '').toLowerCase();

  const haystack = `${eventType} ${eventName} ${message} ${provider}`.trim();

  for (const step of PIPELINE_STEPS) {
    const aliases = STEP_ALIASES[step.key] || [];
    if (aliases.some(a => haystack.includes(a))) return step.key;
  }

  return 'provider';
}

function enrichEventWithStep(row, normalizedEvent) {
  const stepKey = inferStepFromEvent(row, normalizedEvent);
  const step = PIPELINE_STEPS.find(s => s.key === stepKey);

  return {
    ...normalizedEvent,
    step: stepKey,
    stepLabel: step?.label || stepKey
  };
}

function buildPipeline({ traceId, timeline }) {
  const byStep = {};
  timeline.forEach(evt => {
    const stepKey = evt.step;
    if (!stepKey) return;
    if (!byStep[stepKey]) byStep[stepKey] = [];
    byStep[stepKey].push(evt);
  });

  const steps = PIPELINE_STEPS.map((s, idx) => {
    const events = byStep[s.key] || [];
    if (events.length === 0) {
      return {
        order: idx + 1,
        key: s.key,
        label: s.label,
        status: 'UNKNOWN',
        telemetryAvailable: false,
        latencyMs: null,
        provider: null,
        timestamp: null,
        dependencies: idx > 0 ? [PIPELINE_STEPS[idx - 1].key] : [],
        relatedEvents: [],
        failures: [],
        warnings: [],
        evidence: []
      };
    }

    const statuses = events.map(e => normalizeStatus(e.status));
    let status = 'SUCCESS';
    if (statuses.includes('failed')) status = 'FAILED';
    else if (statuses.includes('running')) status = 'RUNNING';
    else if (statuses.includes('unknown')) status = 'UNKNOWN';
    else status = 'SUCCESS';

    const durationCandidates = events
      .map(e => e.durationMs ?? e.metadata?.duration_ms ?? e.metadata?.latency_ms ?? e.metadata?.latencyMs)
      .filter(v => typeof v === 'number' && Number.isFinite(v));
    const latencyMs = durationCandidates.length > 0 ? Math.max(...durationCandidates) : null;

    const provider = events.find(e => e?.metadata?.provider)?.metadata?.provider || null;
    const latestTs = events
      .map(e => e.timestamp)
      .filter(Boolean)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .pop() || null;

    const failures = events
      .filter(e => normalizeStatus(e.status) === 'failed')
      .map(e => e.metadata?.failures || e.metadata?.error || e.metadata?.message || e.event)
      .filter(Boolean);

    const warnings = events
      .filter(e => normalizeStatus(e.status) === 'unknown' || normalizeStatus(e.status) === 'running')
      .map(e => e.metadata?.warning || e.metadata?.message || null)
      .filter(Boolean);

    return {
      order: idx + 1,
      key: s.key,
      label: s.label,
      status,
      telemetryAvailable: true,
      latencyMs,
      provider,
      timestamp: latestTs,
      dependencies: idx > 0 ? [PIPELINE_STEPS[idx - 1].key] : [],
      relatedEvents: events.map(e => e.event || e.type).filter(Boolean),
      failures,
      warnings,
      evidence: events.slice(0, 5).map(e => ({
        event: e.event || e.type,
        status: e.status,
        timestamp: e.timestamp
      }))
    };
  });

  const failedStep = steps.find(s => s.status === 'FAILED') || null;
  const rootCause = failedStep ? failedStep.label : null;
  const bottleneck = steps
    .filter(s => typeof s.latencyMs === 'number')
    .sort((a, b) => b.latencyMs - a.latencyMs)[0] || null;

  return {
    traceId,
    steps,
    summary: {
      active: steps.filter(s => s.status === 'RUNNING').map(s => s.label),
      failed: steps.filter(s => s.status === 'FAILED').map(s => s.label),
      unknown: steps.filter(s => s.status === 'UNKNOWN').map(s => s.label),
      rootCause,
      failedStep: failedStep?.label || null,
      bottleneck: bottleneck
        ? { step: bottleneck.label, latencyMs: bottleneck.latencyMs }
        : null
    }
  };
}

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

  const normalizedAgentEvents = (agentLogsRows || [])
    .map(row => enrichEventWithStep(row, normalizeAgentLogsEvent(row)));

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
      step: 'verification',
      stepLabel: 'Verification',
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

  const pipeline = buildPipeline({ traceId, timeline });

  return {
    traceId,
    timeline,
    pipeline,
    sources: {
      agent_logs: agentLogsRows?.length || 0,
      verification_audit_logs: verifRows?.length || 0
    }
  };
}

