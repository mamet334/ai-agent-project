import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { RuntimeContext } from '../runtime_context.ts';
import { EvidenceReport } from './types.ts';
import { VerificationReport, VerificationAuditRecord } from './verification_engine.ts';

/**
 * Verification Service — Infrastructure Layer
 * Menangani semua external side-effects (Database, Audit, Logging).
 */

export async function getActiveConflictsCount(
  rctx: RuntimeContext,
  currentEntryIds: string[]
): Promise<number> {
  if (!currentEntryIds || currentEntryIds.length === 0) return 0;
  
  try {
    const supClient = createClient(rctx.env.supabaseUrl, rctx.env.supabaseServiceKey);
    const { count, error } = await supClient
      .from('knowledge_conflicts')
      .select('*', { count: 'exact', head: true })
      .eq('resolution_status', 'OPEN')
      .in('entry_a_id', currentEntryIds);
      
    if (!error && count) {
      return count;
    }
  } catch (e) {
    console.error('[CONFIDENCE_ENGINE] Error querying conflicts:', e);
  }
  return 0;
}

export async function persistEvidenceAuditLog(
  rctx: RuntimeContext,
  params: {
    userId: string;
    appSource: string;
    evidenceReport: EvidenceReport;
    brain1Ids: string[];
    brain2Tasks: string[];
    brain2Gaps: string[];
    ragDocs: string[];
    messagePreview: string;
    routingScope: string | null;
    workspaceId: string | null;
  }
): Promise<void> {
  const { evidenceReport } = params;
  try {
    const supClient = createClient(rctx.env.supabaseUrl, rctx.env.supabaseServiceKey);
    await supClient.from('evidence_audit_logs').insert([{
      request_id: evidenceReport.requestId,
      user_id: params.userId,
      mode: evidenceReport.mode,
      app_source: params.appSource,
      brain1_count: evidenceReport.brain1Count,
      brain2_count: evidenceReport.brain2Count,
      rag_count: evidenceReport.ragCount,
      memory_count: evidenceReport.memoryCount,
      total_evidence: evidenceReport.totalEvidence,
      brain1_ids: params.brain1Ids,
      brain2_tasks: params.brain2Tasks,
      brain2_gaps: params.brain2Gaps,
      rag_docs: params.ragDocs,
      verdict: evidenceReport.verdict,
      block_reason: evidenceReport.blockReason,
      llm_called: evidenceReport.isValid,
      message_preview: params.messagePreview,
      routing_scope: params.routingScope,
      workspace_id: params.workspaceId,
    }]);
  } catch (auditErr) {
    console.error('[EVIDENCE_AUDIT_LOG_FAIL]', auditErr);
  }
}

export async function persistVerificationAuditLog(
  rctx: RuntimeContext,
  auditRecord: VerificationAuditRecord,
  userId: string | null
): Promise<void> {
  try {
    const supClient = createClient(rctx.env.supabaseUrl, rctx.env.supabaseServiceKey);
    await supClient.from('verification_audit_logs').insert([{
      timestamp: auditRecord.timestamp,
      provider: auditRecord.provider,
      model: auditRecord.model,
      decision: auditRecord.decision,
      status: auditRecord.status,
      score: auditRecord.score,
      execution_time_ms: auditRecord.executionTimeMs,
      checks: auditRecord.checks,
      failures: auditRecord.failures,
      source_trace: auditRecord.sourceTrace,
      confidence: auditRecord.confidence,
      evidence: auditRecord.evidence,
      request_id: null,
      user_id: userId
    }]);
  } catch (auditErr) {
    console.error('[VERIFICATION_AUDIT_LOG_FAIL]', auditErr);
  }
}

export async function persistTelemetryLog(
  rctx: RuntimeContext,
  params: {
    userId: string | null;
    eventType: string;
    provider: string | null;
    message: string;
    metadata: any;
  }
): Promise<void> {
  try {
    const supClient = createClient(rctx.env.supabaseUrl, rctx.env.supabaseServiceKey);
    await supClient.from('agent_logs').insert([{
      user_id: params.userId,
      event_type: params.eventType,
      provider: params.provider,
      message: params.message,
      metadata: params.metadata
    }]);
  } catch (err) {
    console.error('[TELEMETRY_LOG_FAIL]', err);
  }
}

export function logVerificationReport(report: VerificationReport): void {
  try {
    let logString = `==============================\n`;
    logString += `VERIFICATION REPORT\n`;
    logString += `==============================\n\n`;
    
    logString += `Overall Status : ${report.status}\n`;
    logString += `Overall Score  : ${report.score}\n`;
    logString += `Execution Time : ${report.executionTimeMs.toFixed(2)} ms\n\n`;
    
    logString += `Checks\n`;
    report.checks.forEach(check => {
      logString += `- ${check.id}\n`;
      logString += `  Status : ${check.status}\n`;
      logString += `  Message: ${check.message}\n`;
    });
    
    if (report.failures.length > 0) {
      logString += `\nFailures\n`;
      report.failures.forEach(fail => {
        logString += `- ${fail.id}\n`;
        logString += `  Message: ${fail.message}\n`;
      });
    }
    
    logString += `\n==============================`;
    
    console.log(logString);
  } catch (err) {
    console.error("[VERIFICATION LOGGING ERROR] Failed to log verification report:", err);
  }
}

export function logVerificationAudit(audit: VerificationAuditRecord): void {
  try {
    console.log(`\n[VERIFICATION AUDIT]\n${JSON.stringify(audit, null, 2)}\n`);
  } catch (err) {
    console.error("[VERIFICATION AUDIT LOG ERROR] Failed to log audit:", err);
  }
}
