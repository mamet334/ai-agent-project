import { RuntimeContext } from '../runtime_context.ts';
import { validateEvidence } from './evidence_validator.ts';
import { calculateConfidence } from './confidence_engine.ts';
import { PolicyEngine } from './policy_engine.ts';
import { buildUniversalContract } from './universal_contract.ts';
import { VerificationEngine, VerificationReport } from './verification_engine.ts';
import { getActiveConflictsCount, persistEvidenceAuditLog, persistVerificationAuditLog } from './verification_service.ts';
import { EvidenceReport, ConfidenceReport, PolicyAction } from './types.ts';

export interface VerificationPipelineParams {
  userId: string;
  mode: string;
  ragResult: any; 
  appSource: string;
  finalMessage: string;
  routingDecision: any;
  agentIdentityPrompt: string;
  userContextPrompt: string;
  ragArray: any[];
  memoryArray: any[];
  processingSteps: string[];
  riskScore: number;
  webHint: string;
  isDesktopOSMode: boolean;
  auditMode: string;
}

export interface VerificationPipelineResult {
  systemPrompt: string;
  evidenceReport: EvidenceReport;
  confidenceReport: ConfidenceReport;
  policyResult: Record<PolicyAction, any>;
  universalContract: string;
  metadata: {
    activeConflictCount: number;
  };
  verificationReport: VerificationReport;
}

export async function executeVerificationPipeline(
  params: VerificationPipelineParams,
  rctx: RuntimeContext
): Promise<VerificationPipelineResult> {
  const {
    userId,
    mode,
    ragResult,
    appSource,
    finalMessage,
    routingDecision,
    agentIdentityPrompt,
    userContextPrompt,
    ragArray,
    memoryArray,
    processingSteps,
    riskScore,
    webHint,
    isDesktopOSMode,
    auditMode
  } = params;

  let brain1Ids = ragResult.engineerContext?.brain1Ids || [];
  let brain2Tasks = ragResult.engineerContext?.brain2Tasks || [];
  let brain2Gaps = ragResult.engineerContext?.brain2Gaps || [];
  let brain2Verifications = ragResult.engineerContext?.brain2Verifications || [];
  
  let brain1EntriesForConf: any[] = [];
  if (mode === 'ENGINEER' && ragResult.engineerContext) {
    brain1EntriesForConf = ragResult.engineerContext.brain1Entries || [];
  }

  // 1. Evidence Validation
  const ragIds = ragArray.map((r: any) => {
    const match = r.content?.match(/\[Dari file "([^"]+)"\]/);
    return match ? match[1] : 'unknown_doc';
  });
  const memoryCount = memoryArray.length;

  const evidenceReport = validateEvidence({
    userId,
    mode: mode as any,
    brain1Ids,
    brain2Tasks,
    brain2Gaps,
    brain2Verifications,
    ragArray,
    memoryArray,
  });

  console.log(`[EVIDENCE_GATE]`, {
    verdict: evidenceReport.verdict,
    mode: evidenceReport.mode,
    brain1: evidenceReport.brain1Count,
    brain2: evidenceReport.brain2Count,
    rag: evidenceReport.ragCount,
    memory: evidenceReport.memoryCount,
    total: evidenceReport.totalEvidence,
    blocked: !evidenceReport.isValid,
    blockReason: evidenceReport.blockReason
  });
  processingSteps.push(`[EVIDENCE_GATE] Verdict=${evidenceReport.verdict} | total=${evidenceReport.totalEvidence}`);

  // 6. Evidence Audit Log
  rctx.tasks.fire('EvidenceAuditLog', persistEvidenceAuditLog(rctx, {
    userId,
    appSource,
    evidenceReport,
    brain1Ids,
    brain2Tasks,
    brain2Gaps,
    ragDocs: ragIds,
    messagePreview: (finalMessage || '').substring(0, 100),
    routingScope: routingDecision?.scope || null,
    workspaceId: routingDecision?.workspace_id || null,
  }));

  if (!evidenceReport.isValid) {
    return {
      systemPrompt: ragResult.finalContext,
      evidenceReport,
      confidenceReport: {} as any,
      policyResult: {} as any,
      universalContract: '',
      metadata: { activeConflictCount: 0 },
      verificationReport: { decision: "FAIL", score: 0 } as any
    };
  }

  let fullSystemContext = ragResult.finalContext;
  fullSystemContext += evidenceReport.gateVerdictText;

  // 2. Knowledge Conflict Query
  let activeConflictsCount = 0;
  const currentEntryIds = brain1EntriesForConf.map((e: any) => e.id).filter(Boolean);
  if (currentEntryIds.length > 0) {
    activeConflictsCount = await getActiveConflictsCount(rctx, currentEntryIds);
  }

  // 3. Confidence Calculation
  const ragDocTitles = ragArray.map((r: any) => {
    const match = r.content?.match(/\[Dari file "([^"]+)"\]/);
    return match ? match[1] : 'rag_doc';
  });

  const confidenceReport = calculateConfidence({
    mode: mode as any,
    brain1Ids,
    brain1Entries: brain1EntriesForConf,
    brain2Tasks,
    brain2Gaps,
    brain2Verifications,
    ragDocs: ragDocTitles,
    memoryCount,
    activeConflicts: activeConflictsCount,
    hasVerification: brain2Verifications.length > 0,
    allCurrent: brain1EntriesForConf.every((e: any) => e.is_current !== false),
  });

  // 4. Policy Evaluation
  let policyConstraintText = '';
  let activeConstraints: string[] = [];
  let forbidden: string[] = [];
  let allDecisions: Record<PolicyAction, any> = {} as any;

  if (mode !== 'LITE') {
    const policyCtx = {
      mode: mode as any,
      evidenceCount: evidenceReport.totalEvidence,
      riskScore: riskScore,
      appSource: appSource,
      hasActiveConflicts: activeConflictsCount > 0,
    };

    allDecisions = PolicyEngine.evaluateAll(policyCtx);
    policyConstraintText = PolicyEngine.buildConstraintPrompt(allDecisions);
    
    for (const [action, decision] of Object.entries(allDecisions)) {
      if (decision.allow && decision.constraints.length > 0) activeConstraints.push(...decision.constraints);
      if (!decision.allow) forbidden.push(`Melakukan: ${action} (${decision.reason})`);
    }
    if (policyConstraintText) {
      processingSteps.push(`[POLICY] Constraints injected: ${policyConstraintText.length} chars`);
    }
  }

  // 5. Universal Contract Builder
  const memoryContextText = ragArray?.length > 0 
    ? ragArray.map((m: any) => m.content).join('\n') : '';
  const ragContextText = ragArray?.length > 0 
    ? ragArray.map((r: any) => r.content).join('\n') : '';
  
  const brain1ContextText = brain1EntriesForConf.map((e: any) => `[${e.entry_type}] ${e.title}: ${e.content}`).join('\n');
  let brain2ContextText = '';
  if (brain2Tasks.length > 0) brain2ContextText += `Active Tasks: ${brain2Tasks.join(', ')}\n`;
  if (brain2Gaps.length > 0) brain2ContextText += `Architecture Gaps: ${brain2Gaps.join(', ')}\n`;
  if (brain2Verifications.length > 0) brain2ContextText += `Recent Verifications: ${brain2Verifications.join(', ')}\n`;

  let systemBasePrompt = agentIdentityPrompt + userContextPrompt + ragResult.memoryPrompt;
  if (webHint === "HIGH_PRIORITY") {
    systemBasePrompt += `\n[WEB vs RAG COMPARISON CONTRACT]: Jika terdapat perbedaan antara dokumen RAG internal dan Web/Internet, identifikasi mana yang lebih baru secara eksplisit.`;
  }

  const universalContract = buildUniversalContract({
    mode: mode as any,
    appSource,
    userId: userId || 'unknown',
    evidenceReport,
    confidenceReport,
    brain1Entries: brain1EntriesForConf,
    brain2Tasks,
    brain2Gaps,
    brain2Verifications,
    ragArray,
    memoryArray,
    memoryContextText,
    brain1ContextText,
    brain2ContextText,
    ragContextText,
    policyConstraints: activeConstraints,
    policyForbidden: forbidden,
    systemBasePrompt,
    activeConflicts: activeConflictsCount,
  });

  fullSystemContext = universalContract.asSystemPromptText();
  
  console.log("[MAMET BRAIN v2]", {
    memoryUsed: memoryArray.length,
    ragUsed: ragArray.length,
    contextSize: fullSystemContext.length,
    evidenceVerdict: evidenceReport.verdict,
  });

  console.log(`[SYSTEM CONTEXT FINAL] fullSystemContext="${fullSystemContext.substring(fullSystemContext.length - 300)}"`);
  processingSteps.push(`[SYSTEM CONTEXT FINAL] fullSystemContext="${fullSystemContext.substring(fullSystemContext.length - 300)}"`);

  // Verification Audit Orchestration
  const vContext = {
    responseText: "UNIVERSAL_CONTRACT_COMPILED",
    sourceTrace: fullSystemContext.substring(0, 1000),
    confidenceReport,
    evidenceReport,
    runtimeContext: {
      llmProvider: rctx.model.model?.split('/')[0] || "AUTO",
      llmModel: rctx.model.model || "AUTO"
    }
  };

  const vReport = VerificationEngine.verify(vContext);
  console.log(`========================\nVERIFICATION DECISION\nDecision : ${vReport.decision}\nStatus   : ${vReport.status}\nScore    : ${vReport.score}\n========================`);
  
  const auditRecord = VerificationEngine.createAuditRecord(vReport, vContext);

  // 7. Verification Audit Log
  rctx.tasks.fire('VerificationAuditLog', persistVerificationAuditLog(rctx, auditRecord, userId || null));

  // 8. Return DTO
  return {
    systemPrompt: fullSystemContext,
    evidenceReport,
    confidenceReport,
    policyResult: allDecisions,
    universalContract: fullSystemContext,
    metadata: {
      activeConflictCount: activeConflictsCount
    },
    verificationReport: vReport
  };
}
