const fs = require('fs');
const filePath = 'd:\\\\SLAMET\\\\other\\\\ai-agent-project\\\\supabase\\\\functions\\\\agent-process\\\\index.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Replace UnifiedExecutionContext with MametExecutionContext
content = content.replace(
    /type UnifiedExecutionContext = \{[\s\S]*?\};/,
    `type MametExecutionContext = {
  auth: { userId: string; userName?: string; };
  request: { originalMessage: string; finalMessage: string; lowerMsg: string; };
  policy: { mode: "AI" | "LITE"; decision: "ALLOW" | "ALLOW_WITH_LIMIT" | "BLOCK"; toolsEnabled: boolean; webSearchEnabled: boolean; riskScore: number; ragTopK: number; ragThreshold: number; webHint?: string; };
  state: { ragArray: any[]; memoryArray: any[]; processingSteps: string[]; };
};`
);

// 2. Rewrite buildUnifiedExecutionContext
const oldBuildRegex = /function buildUnifiedExecutionContext[\s\S]*?const ctx = buildUnifiedExecutionContext[^;]*;/;
const newBuildFunc = `function buildUnifiedExecutionContext(input: { message: string, desktopOSMode?: boolean, tools?: string[], ragEnabled?: boolean, userId: string, userName?: string }): MametExecutionContext {
  const mode = input.desktopOSMode ? "AI" : "LITE";
  const isRagEnabled = input.ragEnabled !== false;
  
  const qLen = (input.message || '').length;
  let dynamicThreshold = 0.60;
  if (qLen < 20) dynamicThreshold = 0.60;
  else if (qLen >= 20 && qLen <= 80) dynamicThreshold = 0.65;
  else dynamicThreshold = 0.68;

  const lowerMsg = (input.message || '').toLowerCase();
  const needsWeb = /terbaru|update|berita|2024|2025|revisi|perubahan|aturan baru/.test(lowerMsg);
  const webHint = needsWeb ? "HIGH_PRIORITY" : "NORMAL";
  
  const ctx: MametExecutionContext = {
    auth: { userId: input.userId, userName: input.userName },
    request: { originalMessage: input.message, finalMessage: input.message, lowerMsg },
    policy: { 
        mode, decision: "ALLOW", toolsEnabled: true, webSearchEnabled: true, 
        riskScore: 0, ragTopK: mode === "LITE" ? 10 : 5, ragThreshold: dynamicThreshold, webHint 
    },
    state: { ragArray: [], memoryArray: [], processingSteps: [] }
  };

  if (!POLICY_LAYER_ENABLED) return ctx;

  let riskScore = 0;
  const injectionPatterns = ["ignore previous instructions", "system prompt", "developer mode", "reveal memory", "bypass"];
  if (injectionPatterns.some(p => lowerMsg.includes(p))) { riskScore += 3; }
  
  const toolAbusePatterns = ["recursive agent requests", "infinite search loops", "mass retrieval requests"];
  if (toolAbusePatterns.some(p => lowerMsg.includes(p))) { riskScore += 2; }
  
  const overRetrievalPatterns = ["all data", "dump all", "entire database"];
  if (overRetrievalPatterns.some(p => lowerMsg.includes(p))) { riskScore += 2; }
  
  if (lowerMsg.length > 5000) riskScore += 1;
  const words = lowerMsg.split(/[\\s\\p{P}]+/);
  const uniqueWords = new Set(words);
  if (words.length > 100 && uniqueWords.size < words.length * 0.1) riskScore += 1;
  
  ctx.policy.riskScore = riskScore;
  
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

const ctx = buildUnifiedExecutionContext({ message, desktopOSMode, tools, ragEnabled, userId, userName });`;
content = content.replace(oldBuildRegex, newBuildFunc);

// 3. Replace trace/security accesses
content = content.replaceAll('ctx.trace.retrievalStrategy !== "none"', 'ctx.policy.ragTopK > 0');
content = content.replaceAll('ctx.mode', 'ctx.policy.mode');
content = content.replaceAll('ctx.security.decision', 'ctx.policy.decision');
content = content.replaceAll('ctx.rag.topK', 'ctx.policy.ragTopK');
content = content.replaceAll('ctx.trace.riskScore', 'ctx.policy.riskScore');
content = content.replaceAll('ctx.execution.webHint', 'ctx.policy.webHint');
content = content.replaceAll('ctx.security.toolsEnabled', 'ctx.policy.toolsEnabled');
content = content.replaceAll('ctx.rag.threshold', 'ctx.policy.ragThreshold');

// 4. Handle finalMessage updates
content = content.replaceAll('let finalMessage = message;', 'ctx.request.finalMessage = ctx.request.originalMessage;');
content = content.replaceAll('finalMessage =', 'ctx.request.finalMessage =');

// 5. Replace independent variables
content = content.replaceAll(/(?<!\.)\bfinalMessage\b/g, 'ctx.request.finalMessage');
content = content.replaceAll(/(?<!\.)\buserId\b/g, 'ctx.auth.userId');
content = content.replaceAll(/(?<!\.)\buserName\b/g, 'ctx.auth.userName');

// Clean up destructurings and fixes for regex side-effects
content = content.replace('let { message, tools, model, ctx.auth.userId: _clientUserId, ctx.auth.userName', 'let { message, tools, model, userId: _clientUserId, userName');
content = content.replace('let ctx.auth.userId = AUTH_USER_ID;', 'ctx.auth.userId = AUTH_USER_ID;');
content = content.replace('ctx.request.finalMessage = message;', ''); // Redundant, handled in ctx init

// Arrays
content = content.replace('let ragArray: any[] = [];', '');
content = content.replaceAll(/(?<!\.)\bragArray\b/g, 'ctx.state.ragArray');
content = content.replace('let memoryArray = ', 'ctx.state.memoryArray = ');
content = content.replaceAll(/(?<!\.)\bmemoryArray\b/g, 'ctx.state.memoryArray');

// processingSteps
content = content.replace('let processingSteps: string[] = [];', '');
content = content.replaceAll(/(?<!\.)\bprocessingSteps\b/g, 'ctx.state.processingSteps');

// tempLowerMsg / lowerMessage
content = content.replace("const tempLowerMsg = (ctx.request.finalMessage || '').toLowerCase();", "ctx.request.lowerMsg = (ctx.request.finalMessage || '').toLowerCase();");
content = content.replaceAll('tempLowerMsg', 'ctx.request.lowerMsg');

content = content.replace('const lowerMessage = ctx.request.finalMessage.toLowerCase();', 'ctx.request.lowerMsg = ctx.request.finalMessage.toLowerCase();');
content = content.replaceAll('lowerMessage.', 'ctx.request.lowerMsg.');
content = content.replaceAll('lowerMessage ', 'ctx.request.lowerMsg ');

fs.writeFileSync(filePath, content, 'utf-8');
