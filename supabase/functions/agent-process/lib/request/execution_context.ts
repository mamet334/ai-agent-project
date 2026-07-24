import { UnifiedExecutionContext, MametCapabilityMode } from './types.ts';

export function buildUnifiedExecutionContext(input: { message: string, desktopOSMode?: boolean, tools?: string[], ragEnabled?: boolean, userId: string, userName?: string, appSource?: string, mode?: string }): UnifiedExecutionContext {
  // UUID Validation - Fix for "SUPABASE" string error
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.userId)) {
    console.error('[ExecutionContext] Invalid userId:', input.userId);
    input.userId = null as any;
  }

  const isMametLite = input.appSource === 'mametlite' || input.mode === 'LITE';
  const isMametEngineer = input.appSource === 'engineer' || input.mode === 'ENGINEER';
  const mode: MametCapabilityMode = (input.mode as MametCapabilityMode) || (isMametEngineer ? "ENGINEER" : isMametLite ? "LITE" : (input.desktopOSMode ? "AI" : "LITE"));
  const isRagEnabled = input.ragEnabled !== false;
  
  const qLen = (input.message || '').length;
  let dynamicThreshold = 0.60;
  if (qLen < 20) dynamicThreshold = 0.60;
  else if (qLen >= 20 && qLen <= 80) dynamicThreshold = 0.65;
  else dynamicThreshold = 0.68;

  const lowerMsg = (input.message || '').toLowerCase();
  const needsWeb = /terbaru|update|berita|2024|2025|revisi|perubahan|aturan baru/.test(lowerMsg);
  const webHint = needsWeb ? "HIGH_PRIORITY" : "NORMAL";

  const engineerPolicy = isMametEngineer ? {
    canReadRAG: true, canReadMemory: true, canWriteMemory: false, canWriteKnowledge: false, canUseWorkspace: true, canUseAutomation: false, canUseDesktopTools: false
  } : null;
  
  const ctx: UnifiedExecutionContext = {
    auth: { userId: input.userId, userName: input.userName, appSource: input.appSource || 'assistant' },
    request: { originalMessage: input.message, finalMessage: input.message, lowerMsg, mode },
    policy: {
        mode, decision: "ALLOW", toolsEnabled: true, webSearchEnabled: true, riskScore: 0,
        ragTopK: mode === "LITE" ? 10 : 5, ragThreshold: dynamicThreshold, webHint,
        canReadRAG: engineerPolicy?.canReadRAG ?? true,
        canReadMemory: engineerPolicy?.canReadMemory ?? true,
        canWriteMemory: engineerPolicy?.canWriteMemory ?? ((mode === "ENGINEER" || mode === "ASSISTANT" || mode === "AI") && !isMametLite),
        canWriteKnowledge: engineerPolicy?.canWriteKnowledge ?? ((mode === "ENGINEER" || mode === "ASSISTANT" || mode === "AI") && !isMametLite),
        canUseWorkspace: engineerPolicy?.canUseWorkspace ?? !isMametLite,
        canUseAutomation: engineerPolicy?.canUseAutomation ?? (mode === "AI" && !isMametLite),
        canUseDesktopTools: engineerPolicy?.canUseDesktopTools ?? (mode === "AI")
    },
    state: { ragArray: [], memoryArray: [], processingSteps: [] },
    rag: { topK: mode === "LITE" ? 10 : 5, threshold: dynamicThreshold, allowLongDocs: mode !== "LITE", compressionLevel: mode === "LITE" ? "high" : "low" },
    execution: { memoryPriority: isMametLite ? "balanced" : "memory_first", webSearchEnabled: true, subAgentEnabled: mode === "AI", webHint },
    trace: { riskScore: 0, retrievalStrategy: isRagEnabled ? "rag_enabled" : "rag_disabled", timestamp: Date.now() }
  };

  const POLICY_LAYER_ENABLED = true;
  if (!POLICY_LAYER_ENABLED) return ctx;

  let riskScore = 0;
  const injectionPatterns = ["ignore previous instructions", "system prompt", "developer mode", "reveal memory", "bypass"];
  if (injectionPatterns.some(p => lowerMsg.includes(p))) { riskScore += 3; }
  
  const toolAbusePatterns = ["recursive agent requests", "infinite search loops", "mass retrieval requests"];
  if (toolAbusePatterns.some(p => lowerMsg.includes(p))) { riskScore += 2; }
  
  const overRetrievalPatterns = ["all data", "dump all", "entire database"];
  if (overRetrievalPatterns.some(p => lowerMsg.includes(p))) { riskScore += 2; }
  
  if (lowerMsg.length > 5000) riskScore += 1;
  const words = lowerMsg.split(/[\s\p{P}]+/u);
  const uniqueWords = new Set(words);
  if (words.length > 100 && uniqueWords.size < words.length * 0.1) riskScore += 1;
  
  ctx.policy.riskScore = riskScore;
  ctx.trace.riskScore = riskScore;
  
  if (riskScore >= 4) {
    ctx.policy.decision = "BLOCK";
    ctx.policy.toolsEnabled = false;
    ctx.policy.ragTopK = 0;
    ctx.policy.webSearchEnabled = false;
  } else if (riskScore >= 2) {
    ctx.policy.decision = "ALLOW_WITH_LIMIT";
    ctx.policy.toolsEnabled = false;
    ctx.policy.ragTopK = 2;
    ctx.policy.webSearchEnabled = false;
  }
  
  return ctx;
}
