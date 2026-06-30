const fs = require('fs');
const path = require('path');

const libDir = 'supabase/functions/agent-process/lib/request';
if (!fs.existsSync(libDir)) {
  fs.mkdirSync(libDir, { recursive: true });
}

// types.ts
const typesTs = `
export type MametCapabilityMode = "AI" | "LITE" | "ENGINEER";

export interface UnifiedExecutionContext {
  auth: { userId: string; userName?: string; appSource: string; };
  request: { 
    originalMessage: string; 
    finalMessage: string; 
    lowerMsg: string; 
    tools?: any[]; 
    model?: string; 
    stream?: boolean; 
    history?: any[]; 
    globalMemory?: any; 
    localWorkspaceEnabled?: boolean; 
    workspaceTarget?: string; 
    desktopOSMode?: boolean; 
    auditMode?: string; 
    extractedImage?: any; 
    routingDecision?: any; 
    agentIdentityPrompt?: string; 
    userContextPrompt?: string; 
    ragEnabled?: boolean;
    isRagEnabled?: boolean;
    effectiveRagThreshold?: number;
    effectiveRagMatchCount?: number;
    contractValidation?: any;
    guardianPromptDirective?: string;
  };
  policy: { mode: MametCapabilityMode; decision: "ALLOW" | "ALLOW_WITH_LIMIT" | "BLOCK"; toolsEnabled: boolean; webSearchEnabled: boolean; riskScore: number; ragTopK: number; ragThreshold: number; webHint?: string; canReadRAG: boolean; canReadMemory: boolean; canWriteMemory: boolean; canWriteKnowledge: boolean; canUseWorkspace: boolean; canUseAutomation: boolean; canUseDesktopTools: boolean; };
  state: { ragArray: any[]; memoryArray: any[]; processingSteps: string[]; };
  rag: { topK: number; threshold: number; allowLongDocs: boolean; compressionLevel: "low" | "high"; };
  execution: { memoryPriority: "memory_first" | "balanced"; webSearchEnabled: boolean; subAgentEnabled: boolean; webHint?: string; };
  trace: { riskScore: number; retrievalStrategy: string; timestamp: number; };
}

export interface RequestPipelineParams {
  request: Request;
  corsHeaders: HeadersInit;
}

export interface RequestPipelineResult {
  ctx: UnifiedExecutionContext;
  rctx: any; // RuntimeContext
  response?: Response;
}
`;
fs.writeFileSync(path.join(libDir, 'types.ts'), typesTs.trim());

// cors_middleware.ts
const corsTs = `
export function handleCorsAndOptions(req: Request, corsHeaders: HeadersInit): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}
`;
fs.writeFileSync(path.join(libDir, 'cors_middleware.ts'), corsTs.trim());

// auth_middleware.ts
const authTs = `
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export async function handleAuth(req: Request, supabaseUrl: string, supabaseAnonKey: string, corsHeaders: HeadersInit): Promise<{ user: any, authErrorResponse: Response | null }> {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  
  if (!token) {
      return { user: null, authErrorResponse: new Response(JSON.stringify({ error: "Unauthorized: Missing token" }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }) };
  }

  const authSupabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error: authError } = await authSupabase.auth.getUser(token);

  if (authError || !user || !user.id) {
      return { user: null, authErrorResponse: new Response(JSON.stringify({ error: "Unauthorized: Invalid or expired token" }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }) };
  }

  return { user, authErrorResponse: null };
}
`;
fs.writeFileSync(path.join(libDir, 'auth_middleware.ts'), authTs.trim());

// quota_middleware.ts
const quotaTs = `
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export async function checkQuota(userId: string, supabaseUrl: string, supabaseServiceKey: string, stream: boolean, corsHeaders: HeadersInit): Promise<Response | null> {
  try {
    const supClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: currentCost, error: quotaError } = await supClient.rpc('check_daily_quota', { target_user_id: userId });
    
    if (!quotaError && currentCost !== null) {
      const DAILY_LIMIT = 0.50; // $0.50 per hari (setara ~Rp8.000)
      if (Number(currentCost) >= DAILY_LIMIT) {
         console.warn(\`[CIRCUIT BREAKER] User \${userId} exceeded daily quota: $\${currentCost}\`);
         
         if (!stream) {
           return new Response(JSON.stringify({ 
              message: \`[CIRCUIT BREAKER AKTIF] Limit harian AI Anda telah habis ($\${Number(currentCost).toFixed(2)} / $\${DAILY_LIMIT}). Arus API telah diputus otomatis untuk mencegah tagihan bengkak. Silakan coba lagi besok hari!\` 
           }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
         } else {
           const streamRes = new ReadableStream({
             start(controller) {
               const data = JSON.stringify({ choices: [{ delta: { content: \`\\n\\n**[CIRCUIT BREAKER AKTIF]** Limit harian AI Anda telah habis ($\${Number(currentCost).toFixed(2)} / $\${DAILY_LIMIT}). Arus API telah diputus otomatis untuk mencegah tagihan bengkak. Silakan coba lagi besok hari!\` } }] });
               controller.enqueue(new TextEncoder().encode(\`data: \${data}\\n\\n\`));
               controller.close();
             }
           });
           return new Response(streamRes, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
         }
      }
    }
  } catch (quotaCheckError) {
    console.error("Quota check failed, bypassing...", quotaCheckError);
  }
  return null;
}
`;
fs.writeFileSync(path.join(libDir, 'quota_middleware.ts'), quotaTs.trim());

// execution_context.ts
const execCtxTs = `
import { UnifiedExecutionContext, MametCapabilityMode } from './types.ts';

export function buildUnifiedExecutionContext(input: { message: string, desktopOSMode?: boolean, tools?: string[], ragEnabled?: boolean, userId: string, userName?: string, appSource?: string }): UnifiedExecutionContext {
  const isMametLite = input.appSource === 'mametlite';
  const isMametEngineer = input.appSource === 'engineer';
  const mode: MametCapabilityMode = isMametEngineer ? "ENGINEER" : isMametLite ? "LITE" : (input.desktopOSMode ? "AI" : "LITE");
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
    request: { originalMessage: input.message, finalMessage: input.message, lowerMsg },
    policy: {
        mode, decision: "ALLOW", toolsEnabled: true, webSearchEnabled: true, riskScore: 0,
        ragTopK: mode === "LITE" ? 10 : 5, ragThreshold: dynamicThreshold, webHint,
        canReadRAG: engineerPolicy?.canReadRAG ?? true,
        canReadMemory: engineerPolicy?.canReadMemory ?? !isMametLite,
        canWriteMemory: engineerPolicy?.canWriteMemory ?? (mode === "AI" && !isMametLite),
        canWriteKnowledge: engineerPolicy?.canWriteKnowledge ?? (mode === "AI" && !isMametLite),
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
  const words = lowerMsg.split(/[\\s\\p{P}]+/u);
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
`;
fs.writeFileSync(path.join(libDir, 'execution_context.ts'), execCtxTs.trim());

console.log("Middlewares phase 1 done.");
