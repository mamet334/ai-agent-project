import { executeRagPipeline } from '../../rag/rag_pipeline.ts';
import { validateEvidence, buildBlockedResponse } from '../../verification/evidence_validator.ts';
import { calculateConfidence } from '../../verification/confidence_engine.ts';
import { buildUniversalContract } from '../../verification/universal_contract.ts';
import { PolicyEngine } from '../../verification/policy_engine.ts';
import { getActiveConflictsCount } from '../../verification/verification_service.ts';
import { eventBus } from '../../event/event_bus.ts';

export const ContextBuilderHandler = {
  async handle(ctx: any, rctx: any, maef: any): Promise<any> {
    const stream = ctx.request.stream;
    
    eventBus.emit({ type: 'Intent.Received', source: 'Orchestrator', payload: { intent: ctx.request.finalMessage }, trace_id: rctx?.tasks?.traceId || 'unknown' });
    maef.requestTransition('CONTEXT_BUILD', 'Starting Context Building Phase');
    
    const ragResult = await executeRagPipeline({
      userId: ctx.auth.userId,
      query: ctx.request.finalMessage,
      globalMemory: ctx.request.globalMemory,
      isRagEnabled: ctx.request.isRagEnabled,
      effectiveRagThreshold: ctx.request.effectiveRagThreshold,
      effectiveRagMatchCount: ctx.request.effectiveRagMatchCount,
      canReadMemory: ctx.policy.canReadMemory,
      mode: ctx.policy.mode,
      ragTopK: ctx.policy.ragTopK,
      webHint: ctx.policy.webHint,
      agentIdentityPrompt: ctx.request.agentIdentityPrompt || '',
      userContextPrompt: ctx.request.userContextPrompt || ''
    }, rctx);

    ctx.state.ragArray = ragResult.ragArray;
    ctx.state.memoryArray = ragResult.memoryArray;
    ctx.state.processingSteps.push(...ragResult.metadata.processingSteps);
    
    let routingDecision = ctx.request.routingDecision;
    if (ragResult.metadata.routingDecision) {
       routingDecision = ragResult.metadata.routingDecision;
    }

    if (ctx.auth.userId && ctx.request.finalMessage && typeof ctx.request.finalMessage === 'string' && ctx.request.finalMessage.trim().length > 0) {
      console.log(`[MEMORY_GATEWAY] Edge Function hanya validasi auth dan memproses LLM. Tidak ada auto-save sembunyi.`);
    }

    let brain1Ids = ragResult.engineerContext?.brain1Ids || [];
    let brain2Tasks = ragResult.engineerContext?.brain2Tasks || [];
    let brain2Gaps = ragResult.engineerContext?.brain2Gaps || [];
    let brain2Verifications = ragResult.engineerContext?.brain2Verifications || [];
    
    if (ctx.policy.mode === 'ENGINEER' && ragResult.engineerContext) {
        ctx.brain1Entries = ragResult.engineerContext.brain1Entries;
    }

    let fullSystemContext = ragResult.finalContext;
    
    const ragIds = ctx.state.ragArray.map((r: any) => {
       const match = r.content?.match(/\[Dari file "([^"]+)"\]/);
       return match ? match[1] : 'unknown_doc';
    });

    const evidenceReport = validateEvidence({
      userId: ctx.auth.userId,
      mode: ctx.policy.mode,
      brain1Ids,
      brain2Tasks,
      brain2Gaps,
      brain2Verifications,
      ragArray: ctx.state.ragArray,
      memoryArray: ctx.state.memoryArray,
    });

    console.log(`[EVIDENCE_GATE]`, {
      verdict: evidenceReport.verdict,
      mode: evidenceReport.mode,
      total: evidenceReport.totalEvidence,
      blocked: !evidenceReport.isValid
    });
    ctx.state.processingSteps.push(`[EVIDENCE_GATE] Verdict=${evidenceReport.verdict} | total=${evidenceReport.totalEvidence}`);

    eventBus.emit({
      type: 'Evidence.Evaluated',
      source: 'Orchestrator',
      trace_id: rctx?.tasks?.traceId || 'unknown',
      payload: {
        rctx,
        userId: ctx.auth.userId,
        appSource: ctx.auth.appSource,
        evidenceReport,
        brain1Ids,
        brain2Tasks,
        brain2Gaps,
        ragDocs: ragIds,
        messagePreview: (ctx.request.finalMessage || '').substring(0, 100),
        routingScope: routingDecision?.scope || null,
        workspaceId: routingDecision?.workspace_id || null
      }
    });

    if (!evidenceReport.isValid) {
      const blockedMsg = buildBlockedResponse(evidenceReport, ctx.request.finalMessage);
      console.warn(`[EVIDENCE_GATE BLOCKED] User=${ctx.auth.userId} Mode=${ctx.policy.mode} Reason=${evidenceReport.blockReason}`);
      const aiResponse = { message: blockedMsg };
      const response = stream ? { mode: 'STREAM', type: 'BLOCKED', blockedMsg, snapshot: maef.getSnapshot() } : { mode: 'DIRECT', aiResponse, snapshot: maef.getSnapshot() };
      return { isBlocked: true, response };
    }

    fullSystemContext += evidenceReport.gateVerdictText;

    const brain1EntriesForConf = ctx.brain1Entries || [];
    const ragDocTitles = ragIds;

    let activeConflictsCount = 0;
    const currentEntryIds = brain1EntriesForConf.map((e: any) => e.id).filter(Boolean);
    if (currentEntryIds.length > 0) {
      activeConflictsCount = await getActiveConflictsCount(rctx, currentEntryIds);
    }

    const confidenceReport = calculateConfidence({
      mode: ctx.policy.mode,
      brain1Ids,
      brain1Entries: brain1EntriesForConf,
      brain2Tasks,
      brain2Gaps,
      brain2Verifications,
      ragDocs: ragDocTitles,
      memoryCount: ctx.state.memoryArray.length,
      activeConflicts: activeConflictsCount,
      hasVerification: brain2Verifications.length > 0,
      allCurrent: brain1EntriesForConf.every((e: any) => e.is_current !== false),
    });

    console.log('[CONFIDENCE_ENGINE]', { score: confidenceReport.score, label: confidenceReport.label });
    ctx.state.processingSteps.push(`[CONFIDENCE] ${confidenceReport.score}% Grade:${confidenceReport.grade} | ${confidenceReport.label}`);

    let policyConstraintText = '';
    const activeConstraints: string[] = [];
    const forbidden: string[] = [];
    
    if (ctx.policy.mode === 'ENGINEER') {
      const policyCtx = {
        mode: ctx.policy.mode as any,
        evidenceCount: evidenceReport.totalEvidence,
        riskScore: ctx.policy.riskScore,
        appSource: ctx.auth.appSource,
        hasActiveConflicts: activeConflictsCount > 0,
      };

      const allDecisions = PolicyEngine.evaluateAll(policyCtx);
      policyConstraintText = PolicyEngine.buildConstraintPrompt(allDecisions);
      
      for (const [action, decision] of Object.entries(allDecisions)) {
        if (decision.allow && decision.constraints.length > 0) activeConstraints.push(...decision.constraints);
        if (!decision.allow) forbidden.push(`Melakukan: ${action} (${decision.reason})`);
      }
      if (policyConstraintText) {
        ctx.state.processingSteps.push(`[POLICY] Constraints injected: ${policyConstraintText.length} chars`);
      }
    }

    const memoryContextText = ragResult.memoryArray?.length > 0 ? ragResult.memoryArray.map((m: any) => m.content).join('\n') : '';
    const ragContextText = ragResult.ragArray?.length > 0 ? ragResult.ragArray.map((r: any) => r.content).join('\n') : '';
    const brain1ContextText = brain1EntriesForConf.map((e: any) => `[${e.entry_type}] ${e.title}: ${e.content}`).join('\n');
    let brain2ContextText = '';
    if (brain2Tasks.length > 0) brain2ContextText += `Active Tasks: ${brain2Tasks.join(', ')}\n`;
    if (brain2Gaps.length > 0) brain2ContextText += `Architecture Gaps: ${brain2Gaps.join(', ')}\n`;
    if (brain2Verifications.length > 0) brain2ContextText += `Recent Verifications: ${brain2Verifications.join(', ')}\n`;

    let systemBasePrompt = (ctx.request.agentIdentityPrompt || '') + (ctx.request.userContextPrompt || '') + ragResult.memoryPrompt;
    if (ctx.policy.webHint === "HIGH_PRIORITY") {
      systemBasePrompt += `\n[WEB vs RAG COMPARISON CONTRACT]: Jika terdapat perbedaan antara dokumen RAG internal dan Web/Internet, identifikasi mana yang lebih baru secara eksplisit.`;
    }

    const universalContract = buildUniversalContract({
      mode: ctx.policy.mode,
      appSource: ctx.auth.appSource,
      userId: ctx.auth.userId,
      evidenceReport,
      confidenceReport,
      brain1Entries: brain1EntriesForConf,
      brain2Tasks,
      brain2Gaps,
      brain2Verifications,
      ragArray: ctx.state.ragArray,
      memoryArray: ctx.state.memoryArray,
      memoryContextText,
      brain1ContextText,
      brain2ContextText,
      ragContextText,
      policyConstraints: activeConstraints,
      policyForbidden: forbidden,
      systemBasePrompt,
      activeConflicts: activeConflictsCount
    });

    fullSystemContext = universalContract.asSystemPromptText();
    ctx.state.processingSteps.push(`[SYSTEM CONTEXT FINAL] fullSystemContext="${fullSystemContext.substring(fullSystemContext.length - 300)}"`);

    return { 
      isBlocked: false, 
      fullSystemContext, 
      evidenceReport, 
      confidenceReport, 
      routingDecision 
    };
  }
};
