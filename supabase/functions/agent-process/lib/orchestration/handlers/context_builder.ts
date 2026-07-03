import { generateEmbedding } from '../../rag/embedding.ts';
import { searchDocuments } from '../../rag/document_search.ts';
import { executeRoutingDecision } from '../../rag/routing_decider.ts';
import { loadProjectMemory } from '../../rag/project_memory.ts';
import { loadEngineerContext } from '../../rag/engineer_context.ts';
import { buildContextPipeline } from '../../rag/context_pipeline.ts';

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

    // 1. ROUTING DECIDER
    let routingDecision = await executeRoutingDecision(ctx.request.finalMessage, ctx.auth.userId, rctx, ctx.request.workspaceTarget);
    if (ctx.request.routingDecision) {
       routingDecision = ctx.request.routingDecision; // explicit override
    }
    ctx.state.processingSteps.push(`🔍 [Routing Decider] Scope: ${routingDecision.scope} (${routingDecision.reason_code})`);

    if (ctx.auth.userId && ctx.request.finalMessage && typeof ctx.request.finalMessage === 'string' && ctx.request.finalMessage.trim().length > 0) {
      console.log(`[MEMORY_GATEWAY] Edge Function hanya validasi auth dan memproses LLM. Tidak ada auto-save sembunyi.`);
    }

    // 2. SCATTER: Trigger independent services in parallel (Phase 1 Event-Driven Gatherer)
    const ragPromise = (async () => {
        if (!ctx.auth.userId || !ctx.request.isRagEnabled) return [];
        
        // Disable embedding for OWNER/LITE modes to avoid quota issues
        if (ctx.policy.mode === 'OWNER' || ctx.policy.mode === 'LITE') {
            console.log('[RAG] Embedding disabled for mode:', ctx.policy.mode);
            return [];
        }
        
        try {
            console.log('[RAG] Attempting embedding generation...');
            const queryEmbedding = await generateEmbedding(ctx.request.finalMessage, rctx);
            if (queryEmbedding.length === 0) {
                console.warn('[RAG] Embedding generation returned empty, falling back to empty array');
                return [];
            }
            return await searchDocuments(
                queryEmbedding,
                ctx.request.finalMessage,
                ctx.request.effectiveRagThreshold,
                ctx.request.effectiveRagMatchCount,
                routingDecision,
                ctx.auth.userId,
                rctx
            );
        } catch (err: any) {
            console.error("[RAG Search Error]:", err);
            console.error("[RAG Error Details]:", err.message);
            // Fallback: return empty array instead of throwing error
            // This allows the system to continue without RAG context
            if (err.message && err.message.includes("RAG_DB_FAIL")) {
                console.warn('[RAG] RAG_DB_FAIL detected, returning empty array');
                return [];
            }
            // Log but don't throw - allow system to continue
            console.warn('[RAG] Embedding failed, continuing without RAG context');
            return [];
        }
    })();

    const memoryPromise = loadProjectMemory(
        ctx.request.finalMessage,
        ctx.auth.userId || '',
        ctx.request.globalMemory,
        ctx.policy.canReadMemory,
        rctx,
        routingDecision?.workspace_id
    );

    const engineerPromise = loadEngineerContext(ctx.policy.mode, ctx.request.finalMessage, rctx);

    // 3. GATHER: Await all parallel executions
    const [ragArray, projectMemResult, engineerCtx] = await Promise.all([ragPromise, memoryPromise, engineerPromise]);

    ctx.state.ragArray = ragArray;
    ctx.state.memoryArray = projectMemResult.memoryArray;
    const memoryPrompt = projectMemResult.memoryPrompt;
    
    ctx.state.processingSteps.push(`[RAG CONTEXT GENERATED] ragArray size=${ragArray.length}`);
    ctx.state.processingSteps.push(`[MEMORY PROMPT GENERATED] memoryPrompt="${memoryPrompt.trim()}" memoryArray size=${projectMemResult.memoryArray.length}`);

    // 4. FUSION
    const resolvedContext = buildContextPipeline({
        memoryArray: projectMemResult.memoryArray,
        ragArray: ragArray,
        message: ctx.request.finalMessage,
        agentIdentityPrompt: ctx.request.agentIdentityPrompt || '',
        userContextPrompt: ctx.request.userContextPrompt || '',
        memoryPrompt: memoryPrompt,
        engineerContextPrompt: engineerCtx.engineerContextPrompt,
        webHint: ctx.policy.webHint,
        mode: ctx.policy.mode,
        ragTopK: ctx.policy.ragTopK
    }, rctx);

    let brain1Ids = engineerCtx?.brain1Ids || [];
    let brain2Tasks = engineerCtx?.brain2Tasks || [];
    let brain2Gaps = engineerCtx?.brain2Gaps || [];
    let brain2Verifications = engineerCtx?.brain2Verifications || [];
    
    if (ctx.policy.mode === 'ENGINEER' && engineerCtx) {
        ctx.brain1Entries = engineerCtx.brain1Entries;
    }

    let fullSystemContext = resolvedContext.finalContext;
    
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

    const memoryContextText = projectMemResult.memoryArray?.length > 0 ? projectMemResult.memoryArray.map((m: any) => m.content).join('\n') : '';
    const ragContextText = ragArray?.length > 0 ? ragArray.map((r: any) => r.content).join('\n') : '';
    const brain1ContextText = brain1EntriesForConf.map((e: any) => `[${e.entry_type}] ${e.title}: ${e.content}`).join('\n');
    let brain2ContextText = '';
    if (brain2Tasks.length > 0) brain2ContextText += `Active Tasks: ${brain2Tasks.join(', ')}\n`;
    if (brain2Gaps.length > 0) brain2ContextText += `Architecture Gaps: ${brain2Gaps.join(', ')}\n`;
    if (brain2Verifications.length > 0) brain2ContextText += `Recent Verifications: ${brain2Verifications.join(', ')}\n`;

    let systemBasePrompt = (ctx.request.agentIdentityPrompt || '') + (ctx.request.userContextPrompt || '') + memoryPrompt;
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
