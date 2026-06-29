import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { Buffer } from 'node:buffer';
import { getPluginPromptList, getPluginByName } from './plugins/registry.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { retrieveMemories } from './plugins/memory_manager_v1.ts';
import { buildContextFusion } from './lib/context_fusion.ts';
import { runSelfHealingLoopAsync } from './plugins/self_healing.ts';
import { processMemoryWriteQueue } from './memory_write_worker.ts';
import { WorkspaceGuardian } from './lib/workspace_guardian.ts';
import { validateEvidence, buildBlockedResponse } from './lib/evidence_validator.ts';
import { PolicyEngine } from './lib/policy_engine.ts';
import { calculateConfidence } from './lib/confidence_engine.ts';
import { buildUniversalContract } from './lib/universal_evidence_contract.ts';
import { VerificationEngine, logVerificationReport, logVerificationAudit } from './lib/verification_engine.ts';
import { RuntimeContext, createBackgroundTaskTracker, createRuntimeLogger } from './lib/runtime_context.ts';

async function getGeminiEmbedding(text: string, geminiKey: string): Promise<number[]> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${geminiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'models/gemini-embedding-2', content: { parts: [{ text }] } })
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.embedding?.values || [];
  } catch (e) {
    console.error("Embedding API failed", e);
    return [];
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-byok-gemini, x-byok-groq, x-byok-openai, x-byok-openrouter',
};

// Global state for Round-Robin API Keys (persists across warm invocations)
let geminiKeyIndex = 0;
let groqKeyIndex = 0;
let openaiKeyIndex = 0;
let openrouterKeyIndex = 0;

const getActiveKey = (envVarName: string, currentIndex: number, setIndex: (idx: number) => void): string => {
  const keysString = Deno.env.get(envVarName) || '';
  if (!keysString) return '';
  const keys = keysString.split(',').map(k => k.trim()).filter(k => k);
  if (keys.length === 0) return '';
  
  const key = keys[currentIndex % keys.length];
  setIndex((currentIndex + 1) % keys.length);
  return key;
};

// === JURUS RAHASIA ANTI-LIMIT ===
// Ambil SEMUA Gemini keys untuk dicoba satu per satu saat 429
const getAllKeys = (envVarName: string): string[] => {
  const keysString = Deno.env.get(envVarName) || '';
  if (!keysString) return [];
  return keysString.split(',').map(k => k.trim()).filter(k => k);
};

// Retry dengan exponential backoff + multi-key rotation
const callGeminiWithRetry = async (payload: any, geminiModel: string, allGeminiKeys: string[], maxRetries = 3): Promise<any> => {
  let seenRateLimit = false;
  let lastGeminiError = 'Unknown error';
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    for (let ki = 0; ki < allGeminiKeys.length; ki++) {
      const key = allGeminiKeys[(geminiKeyIndex + ki) % allGeminiKeys.length];
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          geminiKeyIndex = (geminiKeyIndex + ki + 1) % allGeminiKeys.length; // rotate to next key
          return await res.json();
        }
        const errText = await res.text();
        lastGeminiError = `Status ${res.status}: ${errText}`;
        if (res.status === 429) {
          seenRateLimit = true;
          console.warn(`Gemini key #${ki} got 429, trying next key... Details: ${errText}`);
          continue; // Try next key
        }
        // Other errors - try next key too
        console.warn(`Gemini key #${ki} error ${res.status}, trying next... Details: ${errText}`);
      } catch (e: any) {
        lastGeminiError = e.message || String(e);
        console.warn(`Gemini key #${ki} network error:`, e);
      }
    }
    // All keys exhausted for this attempt, wait before retry
    if (attempt < maxRetries - 1) {
      const waitMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      console.log(`All Gemini keys exhausted, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  if (seenRateLimit) lockProvider('gemini');
  throw new Error(`Gemini failed all retries. Last error: ${lastGeminiError}`);
};

// === COOLDOWN CONFIGURATION ===
const PROVIDER_COOLDOWN_DURATIONS: Record<string, number> = {
  'gemini': 60000,        // 60 seconds for Gemini
  'openrouter': 60000,    // 60 seconds for OpenRouter
  'groq': 3600000         // 1 hour for Groq (rentan rate limit)
};

const providerCooldowns = new Map<string, number>();

const isProviderLocked = (provider: string): boolean => {
  const expires = providerCooldowns.get(provider);
  if (!expires) return false;
  if (Date.now() > expires) {
    providerCooldowns.delete(provider);
    return false;
  }
  return true;
};

const lockProvider = (provider: string, durationMs?: number) => {
  const duration = durationMs ?? PROVIDER_COOLDOWN_DURATIONS[provider] ?? 60000;
  providerCooldowns.set(provider, Date.now() + duration);
  console.log(`🔒 Provider cooldown set for ${provider} (${duration}ms)`);
};

const getAvailableProviders = (providers: Array<'gemini' | 'openrouter' | 'groq'>): Array<'gemini' | 'openrouter' | 'groq'> => {
  return providers.filter(p => !isProviderLocked(p));
};

const clearExpiredCooldowns = () => {
  const now = Date.now();
  for (const [provider, expires] of providerCooldowns.entries()) {
    if (now > expires) {
      providerCooldowns.delete(provider);
      console.log(`🔓 Provider cooldown expired for ${provider}`);
    }
  }
};


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const bypassCooldown = req.headers.get('x-bypass-cooldown') === 'true';
  if (bypassCooldown) {
    providerCooldowns.clear();
    console.log("🔓 Cooldowns cleared via x-bypass-cooldown header!");
  }

  if (req.method === 'GET') {
    try {
      const supClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
      const { data: logsData, error: logsError } = await supClient.from('agent_logs').select('*').order('created_at', { ascending: false }).limit(50);
      const { data: memData, error: memError } = await supClient.from('user_memories').select('*').order('created_at', { ascending: false }).limit(50);
      return new Response(JSON.stringify({ logs: logsData, logsError, memories: memData, memError }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }
  }

  try {
    // === PHASE 5: RELIABLE ASYNC DELIVERY LAYER ===
    // Melacak semua janji asinkron (background tasks) per-request agar bisa di-await
    // secara terkendali sebelum stream/koneksi utama benar-benar ditutup.
    const pendingBackgroundTasks: Promise<any>[] = [];
    const safeFireAndTrack = (taskName: string, promise: Promise<any>) => {
      const start = Date.now();
      const tracked = promise.then(() => {
        console.log(`[BACKGROUND_TASK_SUCCESS] ${taskName} selesai (${Date.now() - start}ms)`);
      }).catch(err => {
        console.error(`[BACKGROUND_TASK_FAILED] ${taskName} gagal:`, err);
      });
      pendingBackgroundTasks.push(tracked);
    };

    // === AUTH BINDING LAYER (HARDENING) ===
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    
    if (!token) {
        return new Response(JSON.stringify({ error: "Unauthorized: Missing token" }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const authSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { data: { user }, error: authError } = await authSupabase.auth.getUser(token);

    if (authError || !user || !user.id) {
        return new Response(JSON.stringify({ error: "Unauthorized: Invalid or expired token" }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const AUTH_USER_ID = user.id;

    let { message, tools, model, userId: _clientUserId, userName, file, history, globalMemory, stream, desktopOSMode, ragEnabled, appSource: clientAppSource = 'assistant', workspaceTarget = 'AUTO', localWorkspaceEnabled = false, auditMode = 'OFF' } = await req.json();

    // === [SECURITY FIX] SERVER-AUTHORITATIVE APP SOURCE ===
    // appSource dari client TIDAK DAPAT DIPERCAYA karena bisa dimanipulasi.
    // Prioritas: user_metadata (JWT server-side) > clientAppSource
    // Engineer mode hanya bisa diaktifkan jika user punya metadata 'app_source: engineer'
    const jwtAppSource = user.user_metadata?.app_source as string | undefined;
    const ALLOWED_CLIENT_SOURCES = ['assistant', 'mametlite'];
    const resolvedAppSource: string = jwtAppSource ?? (ALLOWED_CLIENT_SOURCES.includes(clientAppSource) ? clientAppSource : 'assistant');
    const appSource = resolvedAppSource;
    console.log(`[SECURITY] appSource resolved: client='${clientAppSource}' jwt='${jwtAppSource}' final='${appSource}'`);
    
    let routingDecision: any = null;
    let contractValidation: any = null;

    // Fallback deteksi jika frontend versi lama
    if (message && (message.includes('[LOCAL FOLDER CONTENT]') || message.includes('[DESKTOP DIRECTORY ABSOLUTE PATH]'))) {
      localWorkspaceEnabled = true;
    }

    const guardian = new WorkspaceGuardian({
      workspaceTarget,
      localWorkspaceEnabled,
      message: message || ''
    });

    const storageTarget = guardian.determineTarget();
    tools = guardian.filterTools(tools, storageTarget);
    
    const guardianPromptDirective = guardian.getGuardianPrompt(storageTarget);

    // ANTI-HALLUCINATION: Bersihkan history agar LLM tidak melihat/mempelajari tag fiktif dari chat masa lalu
    if (history && Array.isArray(history)) {
      history = history.map((msg: any) => {
        if (msg.role === 'model' && typeof msg.content === 'string') {
          msg.content = msg.content.replace(/<call:[^>]+>/gi, '').trim();
        }
        return msg;
      });
    }

    // === UNIFIED EXECUTION POLICY LAYER (FASE 4C) ===
    const POLICY_LAYER_ENABLED = true;
    
    // MAEF Capability Model (Bab 10) — mode enum
    type MametCapabilityMode = "AI" | "LITE" | "ENGINEER";

    type MametExecutionContext = {
      auth: { userId: string; userName?: string; appSource: string; };
      request: { originalMessage: string; finalMessage: string; lowerMsg: string; };
      policy: { mode: MametCapabilityMode; decision: "ALLOW" | "ALLOW_WITH_LIMIT" | "BLOCK"; toolsEnabled: boolean; webSearchEnabled: boolean; riskScore: number; ragTopK: number; ragThreshold: number; webHint?: string; canReadRAG: boolean; canReadMemory: boolean; canWriteMemory: boolean; canWriteKnowledge: boolean; canUseWorkspace: boolean; canUseAutomation: boolean; canUseDesktopTools: boolean; };
      state: { ragArray: any[]; memoryArray: any[]; processingSteps: string[]; };
      rag: { topK: number; threshold: number; allowLongDocs: boolean; compressionLevel: "low" | "high"; };
      execution: { memoryPriority: "memory_first" | "balanced"; webSearchEnabled: boolean; subAgentEnabled: boolean; webHint?: string; };
      trace: { riskScore: number; retrievalStrategy: string; timestamp: number; };
    };

    function buildUnifiedExecutionContext(input: { message: string, desktopOSMode?: boolean, tools?: string[], ragEnabled?: boolean, userId: string, userName?: string, appSource?: string }): MametExecutionContext {
  // === MAEF Capability Model — appSource routing ===
  const isMametLite = input.appSource === 'mametlite';
  const isMametEngineer = input.appSource === 'engineer';

  // Mode resolution: ENGINEER > AI > LITE
  const mode: MametCapabilityMode = isMametEngineer ? "ENGINEER"
    : isMametLite ? "LITE"
    : (input.desktopOSMode ? "AI" : "LITE");

  const isRagEnabled = input.ragEnabled !== false;
  
  const qLen = (input.message || '').length;
  let dynamicThreshold = 0.60;
  if (qLen < 20) dynamicThreshold = 0.60;
  else if (qLen >= 20 && qLen <= 80) dynamicThreshold = 0.65;
  else dynamicThreshold = 0.68;

  const lowerMsg = (input.message || '').toLowerCase();
  const needsWeb = /terbaru|update|berita|2024|2025|revisi|perubahan|aturan baru/.test(lowerMsg);
  const webHint = needsWeb ? "HIGH_PRIORITY" : "NORMAL";

  // === Engineer Policy (MAMET-ENGINEER-BLUEPRINT Stage 2) ===
  // Engineer: full reasoning, no automation, no uncontrolled memory writes
  const engineerPolicy = isMametEngineer ? {
    canReadRAG: true,
    canReadMemory: true,      // Engineer needs to read context
    canWriteMemory: false,    // No uncontrolled User Memory writes
    canWriteKnowledge: false, // Knowledge writes require explicit action
    canUseWorkspace: true,
    canUseAutomation: false,  // BLOCK: cron_manager, uncontrolled automation
    canUseDesktopTools: false // BLOCK: no OS exec from Engineer mode
  } : null;
  
  const ctx: MametExecutionContext = {
    auth: { userId: input.userId, userName: input.userName, appSource: input.appSource || 'assistant' },
    request: { originalMessage: input.message, finalMessage: input.message, lowerMsg },
    policy: {
        mode, decision: "ALLOW", toolsEnabled: true, webSearchEnabled: true,
        riskScore: 0,
        ragTopK: mode === "LITE" ? 10 : 5,
        ragThreshold: dynamicThreshold, webHint,
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

const ctx = buildUnifiedExecutionContext({ message, desktopOSMode, tools, ragEnabled, userId: AUTH_USER_ID, userName, appSource });
    console.log("[L1] auth binding", { providedUserId: _clientUserId, actualAuthId: ctx.auth.userId, appSource: ctx.auth.appSource, message: message ? message.substring(0, 50) + '...' : null });

    // Capability Filter — Orchestrator Level (Security Fix)
    if (tools && Array.isArray(tools)) {
      tools = tools.filter(t => {
        if (t === 'cron_manager' && !ctx.policy.canUseAutomation) { console.warn(`[CAPABILITY_BLOCK] Tool '${t}' blocked: canUseAutomation=false (mode=${ctx.policy.mode})`); return false; }
        if (t === 'file_analyzer' && !ctx.policy.canUseDesktopTools) { console.warn(`[CAPABILITY_BLOCK] Tool '${t}' blocked: canUseDesktopTools=false (mode=${ctx.policy.mode})`); return false; }
        // [SECURITY FIX] knowledge_manager enforced at orchestrator, not delegated to plugin
        if (t === 'knowledge_manager' && !ctx.policy.canWriteKnowledge) { console.warn(`[CAPABILITY_BLOCK] Tool '${t}' blocked at orchestrator: canWriteKnowledge=false (mode=${ctx.policy.mode})`); return false; }
        return true;
      });
    }
    const isRagEnabled = ctx.policy.ragTopK > 0;

    console.log("[UNIFIED TRACE]", {
      mode: ctx.policy.mode,
      decision: ctx.policy.decision,
      ragTopK: ctx.policy.ragTopK,
      riskScore: ctx.policy.riskScore
    });
    
    // ENFORCEMENT BLOCK
    if (ctx.policy.decision === "BLOCK") {
      console.warn(`[EXECUTION POLICY] Blocked request from user ${ctx.auth.userId} due to HIGH risk. Trace:`, ctx.trace);
      const blockMsg = "Permintaan ditolak oleh Sistem Kebijakan Eksekusi. Deteksi injeksi atau pola berbahaya.";
      if (!stream) {
        return new Response(JSON.stringify({ message: blockMsg }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } else {
        const streamRes = new ReadableStream({
          start(controller) {
            const data = JSON.stringify({ choices: [{ delta: { content: blockMsg } }] });
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
            controller.close();
          }
        });
        return new Response(streamRes, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
      }
    }
    
    if (ctx.policy.decision === "ALLOW_WITH_LIMIT") {
      console.warn(`[EXECUTION POLICY] Applied limits to user ${ctx.auth.userId} due to MEDIUM risk. Trace:`, ctx.trace);
    }

    let effectiveRagMatchCount = ctx.policy.ragTopK;
    let effectiveRagThreshold = ctx.policy.ragThreshold;
    if (!ctx.policy.toolsEnabled && tools && Array.isArray(tools)) {
       tools = []; // Menerapkan kebijakan secara eksplisit
    }

    // === CIRCUIT BREAKER (FASE 4B) ===
    // Mengecek apakah user sudah melewati batas harian token sebelum AI merespons.
    if (ctx.auth.userId) {
      try {
        const supClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        const { data: currentCost, error: quotaError } = await supClient.rpc('check_daily_quota', { target_user_id: ctx.auth.userId });
        
        if (!quotaError && currentCost !== null) {
          const DAILY_LIMIT = 0.50; // $0.50 per hari (setara ~Rp8.000)
          if (Number(currentCost) >= DAILY_LIMIT) {
             console.warn(`[CIRCUIT BREAKER] User ${ctx.auth.userId} exceeded daily quota: $${currentCost}`);
             
             // Tolak request jika sudah mencapai limit (mode teks)
             if (!stream) {
               return new Response(JSON.stringify({ 
                  message: `[CIRCUIT BREAKER AKTIF] Limit harian AI Anda telah habis ($${Number(currentCost).toFixed(2)} / $${DAILY_LIMIT}). Arus API telah diputus otomatis untuk mencegah tagihan bengkak. Silakan coba lagi besok hari!` 
               }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
             } else {
               // Tolak via Stream
               const streamRes = new ReadableStream({
                 start(controller) {
                   const data = JSON.stringify({ choices: [{ delta: { content: `\n\n**[CIRCUIT BREAKER AKTIF]** Limit harian AI Anda telah habis ($${Number(currentCost).toFixed(2)} / $${DAILY_LIMIT}). Arus API telah diputus otomatis untuk mencegah tagihan bengkak. Silakan coba lagi besok hari!` } }] });
                   controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
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
    }

    // === TOKEN TRACKER ESTIMATOR (FASE 4A) ===
    const logApiUsage = (provider: string, modelName: string, inputText: string, outputText: string) => {
      if (!ctx.auth.userId) return;
      safeFireAndTrack('LogAPIUsage', (async () => {
        // Estimasi kasar: 1 token = 4 karakter
        const inputTokens = Math.ceil(inputText.length / 4);
        const outputTokens = Math.ceil(outputText.length / 4);
        
        let costIn = 0.0001; let costOut = 0.0002; 
        if (modelName.includes('gpt-4o')) { costIn = 0.005; costOut = 0.015; }
        else if (modelName.includes('llama')) { costIn = 0.00005; costOut = 0.00008; }

        const totalCost = ((inputTokens / 1000) * costIn) + ((outputTokens / 1000) * costOut);
        const supClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        await supClient.from('api_usage').insert([{ 
           user_id: ctx.auth.userId, provider, model: modelName,
           input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: totalCost
        }]);
      })());
    };

    const logAgentEvent = async (eventType: string, provider: string, logMessage: string) => {
      safeFireAndTrack('LogAgentEvent', (async () => {
        const supClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        await supClient.from('agent_logs').insert([{ user_id: ctx.auth.userId || null, event_type: eventType, provider, message: logMessage }]);
      })());
    };


    // --- MAMET HEALER (TERAPIS PIKIRAN) ---
    if (history && history.length > 15) {
      console.log("Mamet Healer: Melakukan Memory Sweeping...");
      history = [
        history[0], 
        { role: 'model', content: '[MAMET HEALER: Memori obrolan lama telah diringkas untuk mencegah kepenuhan memori dan menjaga kestabilan.]' }, 
        ...history.slice(-10)
      ];
    }

    let extractedImage = null;
    ctx.request.finalMessage = ctx.request.originalMessage;

    if (file && file.data) {
      const filename = file.name.toLowerCase();
      const buffer = Buffer.from(file.data, 'base64');
      
      if (file.mimeType.startsWith('image/')) {
        extractedImage = { mimeType: file.mimeType, data: file.data };
      } else if (filename.endsWith('.txt') || filename.endsWith('.csv') || filename.endsWith('.md')) {
        ctx.request.finalMessage = `Permintaan User: ${message}\n\n[DOKUMEN TERLAMPIR: ${file.name}]\nIsi Dokumen:\n${new TextDecoder().decode(buffer).substring(0, 50000)}`;
      } else {
        // Fallback PDF/DOCX yang kompleks dialihkan
        ctx.request.finalMessage = `Permintaan User: ${message}\n\n[DOKUMEN TERLAMPIR: ${file.name}]\n(Catatan: Edge Function saat ini memprioritaskan teks/gambar. PDF akan dibaca secara ringkas jika memungkinkan)`;
      }
    }

    if (!ctx.request.finalMessage || !Array.isArray(tools)) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // BYOK (Bring Your Own Key) Support
    const byokGemini = req.headers.get('x-byok-gemini');
    const byokGroq = req.headers.get('x-byok-groq');
    const byokOpenAI = req.headers.get('x-byok-openai');
    const byokOpenRouter = req.headers.get('x-byok-openrouter');

    const GEMINI_API_KEY = (byokGemini || getActiveKey('GEMINI_API_KEY', geminiKeyIndex, (idx) => { geminiKeyIndex = idx; }) || '').trim();
    const GROQ_API_KEY = (byokGroq || getActiveKey('GROQ_API_KEY', groqKeyIndex, (idx) => { groqKeyIndex = idx; }) || '').trim();
    const OPENAI_API_KEY = (byokOpenAI || getActiveKey('OPENAI_API_KEY', openaiKeyIndex, (idx) => { openaiKeyIndex = idx; }) || '').trim();
    const OPENROUTER_API_KEY = (byokOpenRouter || getActiveKey('OPENROUTER_API_KEY', openrouterKeyIndex, (idx) => { openrouterKeyIndex = idx; }) || '').trim();

    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set');
    }

    // === ADR-0009 PHASE 5.1: RUNTIMECONTEXT ===
    const rctx: RuntimeContext = {
      keys: {
        gemini: GEMINI_API_KEY,
        allGemini: getAllKeys('GEMINI_API_KEY'),
        groq: GROQ_API_KEY,
        openRouter: OPENROUTER_API_KEY,
        openAI: OPENAI_API_KEY,
      },
      model: { model },
      stream: { isStream: !!stream, extractedImage, desktopOSMode, auditMode },
      logger: { logApiUsage, logAgentEvent },
      state: { explicitModelErrors: '', pendingBackgroundTasks },
      tasks: { fire: safeFireAndTrack, awaitAll: async () => { if (pendingBackgroundTasks.length > 0) await Promise.allSettled(pendingBackgroundTasks); } }
    };
    if (rctx.keys.allGemini.length === 0 && rctx.keys.gemini) {
      rctx.keys.allGemini.push(rctx.keys.gemini);
    }

    // [REMOVED streamGroqResponse - Replaced by unified getStreamResponse]

    const callGroq = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], rctx: RuntimeContext) => {
      const messages = [];
      if (systemPromptText) messages.push({ role: 'system', content: systemPromptText });
      
      if (chatHistory && chatHistory.length > 0) {
        for (const msg of chatHistory) {
          messages.push({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: msg.content
          });
        }
      }
      
      messages.push({ role: 'user', content: promptText });
      
      let groqModel = 'llama-3.1-8b-instant';
      if (rctx.model.model && rctx.model.model.startsWith('groq/')) {
        groqModel = rctx.model.model.replace('groq/', '');
      } else if (rctx.model.model === 'groq-llama-3.3') {
        groqModel = 'llama-3.3-70b-versatile';
      } else if (rctx.model.model === 'groq-llama-3.1') {
        groqModel = 'llama-3.1-8b-instant';
      }

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${rctx.keys.groq}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: groqModel,
          messages: messages,
          temperature: 0.1
        })
      });
      if (!res.ok) {
        throw new Error(`Groq API Error: ${res.status}`);
      }
      const data = await res.json();
      const answer = data.choices?.[0]?.message?.content || '';
      
      // Catat pemakaian
      if (!rctx.stream.isStream) rctx.logger.logApiUsage('groq', groqModel, promptText + systemPromptText, answer);
      
      return answer;
    };

    const getComplexityScore = async (userMessage: string): Promise<number> => {
      const text = String(userMessage || '').trim();
      if (!text) return 1;

      const words = text.split(/\s+/).filter(Boolean);
      const normalized = text.toLowerCase();
      const baseScore = Math.min(4, Math.floor(words.length / 20));

      const heavyKeywords = [
        'analyze','analysis','explain','debug','optimize','optimization','architect','architecture',
        'compare','evaluate','reasoning','research','summarize','translate','implement','build',
        'design','planning','strategy','system','complex','mathematics','formula','algorithm','proof',
        'logic','code','script','database','query','performance','scaling','security','cryptography',
        'artificial intelligence','machine learning','neural network','deep learning'
      ];

      let keywordScore = 0;
      for (const keyword of heavyKeywords) {
        if (normalized.includes(keyword)) keywordScore += 1;
      }
      keywordScore = Math.min(4, keywordScore);

      let score = 1 + baseScore + keywordScore;
      if (words.length > 80) score += 1;
      if (normalized.includes('how to') || normalized.includes('how do i') || normalized.includes('what is the best') || normalized.includes('why')) score += 1;
      if (/```|<code>|function|class|sql|select|update|delete|insert|aggregate|regex|regexp|javascript|python/.test(normalized)) score += 1;
      return Math.min(10, Math.max(1, score));
    };

    // [REMOVED streamOpenAIResponse - Replaced by unified getStreamResponse]

    const callOpenAI = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], overrideModel: string | undefined, rctx: RuntimeContext) => {
      const messages = [];
      if (systemPromptText) messages.push({ role: 'system', content: systemPromptText });
      if (chatHistory && chatHistory.length > 0) {
        for (const msg of chatHistory) {
          messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content });
        }
      }
      messages.push({ role: 'user', content: promptText });
      
      const selectedModel = overrideModel || rctx.model.model || 'gpt-4o-mini';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${rctx.keys.openAI}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: messages,
          temperature: 0.1
        })
      });
      if (!res.ok) throw new Error(`OpenAI API Error: ${res.status}`);
      const data = await res.json();
      const answer = data.choices?.[0]?.message?.content || '';
      
      if (!rctx.stream.isStream) rctx.logger.logApiUsage('openai', selectedModel, promptText + systemPromptText, answer);
      return answer;
    };

    // ========== MODIFIKASI UTAMA: streamOpenRouterResponse dengan error handling yang lebih baik ==========
    // [REMOVED streamOpenRouterResponse - Replaced by unified getStreamResponse]
    // ========== AKHIR MODIFIKASI ==========

    const callOpenRouter = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], forceDefaultModel = false, rctx: RuntimeContext) => {
      const messages = [];
      if (systemPromptText) messages.push({ role: 'system', content: systemPromptText });
      if (chatHistory && chatHistory.length > 0) {
        for (const msg of chatHistory) {
          messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content });
        }
      }
      messages.push({ role: 'user', content: promptText });
      
      let openRouterModel = 'anthropic/claude-sonnet-4.6';
      if (!forceDefaultModel) {
        if (rctx.model.model && rctx.model.model.startsWith('openrouter/')) {
          openRouterModel = rctx.model.model.replace('openrouter/', '');
        } else if (rctx.model.model === 'openrouter-llama-3') {
          openRouterModel = 'anthropic/claude-sonnet-4.6';
        } else if (rctx.model.model === 'openrouter-google-gemini-2.0-flash-exp') {
          openRouterModel = 'anthropic/claude-sonnet-4.6';
        }
      }
      
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${rctx.keys.openRouter}`,
          'HTTP-Referer': 'https://ai-agent-project.vercel.app',
          'X-Title': 'Mamet AI Agent',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: openRouterModel,
          messages: messages,
          temperature: 0.1
        })
      });
      if (!res.ok) throw new Error(`OpenRouter API Error: ${res.status}`);
      const data = await res.json();
      const answer = data.choices?.[0]?.message?.content || '';
      
      if (!rctx.stream.isStream) rctx.logger.logApiUsage('openrouter', openRouterModel, promptText + systemPromptText, answer);
      return answer;
    };

    // allGeminiKeys initialization was moved to rctx

    const callLLMWithCascade = async (
      promptText: string,
      systemPromptText = '',
      chatHistory: any[] = [],
      preferredProvider: 'gemini' | 'groq' = 'gemini',
      extractedImage: { mimeType: string; data: string } | null = null,
      rctx: RuntimeContext
    ): Promise<string> => {
      clearExpiredCooldowns();

      const buildPayload = () => {
        const payload: any = { contents: [] };
        if (systemPromptText) payload.systemInstruction = { parts: [{ text: systemPromptText }] };
        if (chatHistory && chatHistory.length > 0) {
          for (const msg of chatHistory) {
            payload.contents.push({
              role: msg.role === 'model' ? 'model' : 'user',
              parts: [{ text: msg.content }]
            });
          }
        }
        const userParts: any[] = [{ text: promptText }];
        if (extractedImage) {
          userParts.push({ inlineData: { mimeType: extractedImage.mimeType, data: extractedImage.data } });
        }
        payload.contents.push({ role: 'user', parts: userParts });
        return payload;
      };

      // === CASCADE ORDER: Gemini -> Groq -> OpenRouter ===
      // Groq is now the primary fallback (free, fast, reliable)
      const cascadeOrder: Array<'gemini' | 'openrouter' | 'groq'> =
        preferredProvider === 'groq'
          ? ['groq', 'gemini', 'openrouter']
          : ['gemini', 'groq', 'openrouter'];

      const availableProviders = getAvailableProviders(cascadeOrder);
      console.log(`🎯 Cascade order: ${availableProviders.join(' -> ')} (locked: ${cascadeOrder.filter(p => isProviderLocked(p)).join(', ') || 'none'})`);

      const payload = buildPayload();
      let lastError = '';
      if (availableProviders.length === 0) {
        lastError = `No available providers. Locked: ${cascadeOrder.filter(p => isProviderLocked(p)).join(', ')}`;
      }
      for (const provider of availableProviders) {
        console.log(`📍 Trying provider: ${provider}`);
        
        try {
          if (provider === 'gemini') {
            if (rctx.keys.allGemini.length === 0) {
              console.log('⏭️  Gemini: No keys available, skipping');
              lastError += ' [gemini]: No keys available;';
              continue;
            }
            console.log('🔷 Calling Gemini...');
            const data = await callGeminiWithRetry(payload, 'gemini-2.0-flash', rctx.keys.allGemini);
            if (data) {
              const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (!rctx.stream.isStream) rctx.logger.logApiUsage('gemini', 'gemini-2.0-flash', promptText + systemPromptText, answer);
              console.log('✅ Gemini succeeded');
              return answer;
            }
            console.log('⚠️  Gemini returned null, falling back...');
            lastError += ' [gemini]: returned null;';
            continue;
          }

          if (provider === 'openrouter') {
            if (!rctx.keys.openRouter) {
              console.log('⏭️  OpenRouter: No API key available, skipping');
              lastError += ' [openrouter]: No API key;';
              continue;
            }
            console.log('🟠 Calling OpenRouter...');
            const answer = await callOpenRouter(promptText, systemPromptText, chatHistory, true, rctx);
            if (answer) {
              if (!rctx.stream.isStream) rctx.logger.logApiUsage('openrouter', 'google/gemini-2.0-flash-lite-preview-02-05:free', promptText + systemPromptText, answer);
              console.log('✅ OpenRouter succeeded');
              return answer;
            }
            console.log('⚠️  OpenRouter returned empty, falling back...');
            lastError += ' [openrouter]: returned empty;';
            continue;
          }

          if (provider === 'groq') {
            if (!rctx.keys.groq) {
              console.log('⏭️  Groq: No API key available, skipping');
              lastError += ' [groq]: No API key;';
              continue;
            }
            console.log('🟣 Calling Groq (Fallback Utama)...');
            const answer = await callGroq(promptText, systemPromptText, chatHistory, rctx);
            if (answer) {
              if (!rctx.stream.isStream) rctx.logger.logApiUsage('groq', 'llama-3.1-8b-instant', promptText + systemPromptText, answer);
              console.log('✅ Groq succeeded');
              return answer;
            }
            console.log('⚠️  Groq returned empty, falling back to OpenRouter...');
            lastError += ' [groq]: returned empty;';
            continue;
          }
        } catch (err: any) {
          const message = String(err.message || err);
          lastError += ` [${provider}]: ${message};`;
          const isRateLimit = message.includes('429') || message.includes('rate limit') || message.includes('quota');
          
          if (isRateLimit) {
            console.log(`🚫 Provider ${provider} hit rate limit (429), locking for ${PROVIDER_COOLDOWN_DURATIONS[provider]}ms`);
            lockProvider(provider);
            await rctx.logger.logAgentEvent('RATE_LIMIT_HIT', provider, `429 Error: ${message.substring(0, 200)}`);
          } else {
            await rctx.logger.logAgentEvent('FALLBACK_TRIGGERED', provider, `Error: ${message.substring(0, 200)}`);
          }
          console.warn(`❌ Provider ${provider} failed: ${message}`);
        }
      }

      throw new Error('Semua provider AI sedang limit/gangguan. Detail error:' + rctx.state.explicitModelErrors + lastError);
    };

    let explicitModelErrors = '';

    const runLLM = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], rctx: RuntimeContext) => {
      if (ctx.policy.canUseDesktopTools && !systemPromptText.includes('DESKTOP NATIVE AWARENESS ENABLED')) {
         systemPromptText += `\n[STATUS: DESKTOP NATIVE AWARENESS ENABLED]\nAnda WAJIB mengeluarkan perintah Windows di dalam tag <terminal>. DILARANG menyebut sub-agent atau menolak. Contoh: <terminal>dir %USERPROFILE%\\Desktop</terminal>\n`;
      }

      // === PRIORITAS USER-EXPLICIT MODEL SELECTION ===
      if (!rctx.stream.extractedImage) {
        if (rctx.model.model && rctx.model.model.includes('gpt') && !rctx.model.model.includes('openrouter') && rctx.keys.openAI) {
          try { return await callOpenAI(promptText, systemPromptText, chatHistory, undefined, rctx); } catch(e: any) { console.warn('OpenAI failed:', e); rctx.state.explicitModelErrors += ` [openai]: ${e.message || e};`; }
        } else if (rctx.model.model && (rctx.model.model.includes('openrouter') || rctx.model.model.startsWith('openrouter/')) && rctx.keys.openRouter) {
          try { return await callOpenRouter(promptText, systemPromptText, chatHistory, false, rctx); } catch(e: any) { console.warn('OpenRouter failed:', e); rctx.state.explicitModelErrors += ` [openrouter]: ${e.message || e};`; }
        } else if (rctx.model.model && rctx.model.model.startsWith('groq/') && rctx.keys.groq) {
          try { return await callGroq(promptText, systemPromptText, chatHistory, rctx); } catch(e: any) { console.warn('Groq failed:', e); rctx.state.explicitModelErrors += ` [groq-explicit]: ${e.message || e};`; }
        }
      }

      // === DEFAULT CASCADE: Gemini -> OpenRouter -> Groq ===
      // Ignore complexity score, use default provider order
      console.log(`🔄 Using default cascade: Gemini -> OpenRouter -> Groq`);
      return await callLLMWithCascade(promptText, systemPromptText, chatHistory, 'gemini', rctx.stream.extractedImage, rctx);
    };

    // --- OTAK KHUSUS KEPALA AGENT (HEMAT KUOTA) + ANTI-LIMIT ---
    const runCoordinatorLLM = async (promptText: string, systemPromptText = '', preferFast = false, rctx: RuntimeContext) => {
      // === NOTE: Groq is temporarily disabled, so preferFast will use default cascade ===
      // if (preferFast && rctx.keys.groq && !isProviderLocked('groq')) {
      //   try {
      //     console.log("Mamet Traffic Light: Memutar tugas ringan (Intent Router) ke Groq...");
      //     return await callGroq(promptText, systemPromptText, [], rctx);
      //   } catch(e) { console.warn('Traffic Light Groq failed, cascading to Gemini...', e); }
      // }

      // Always use default cascade: Gemini -> OpenRouter
      return await callLLMWithCascade(promptText, systemPromptText, [], 'gemini', null, rctx);
    };

    let replyMessage = 'Gagal memproses jawaban dari AI.';
    let groundingSources: any[] = [];
    let toolExecution = null;
    let subagentRuns: any[] = [];
    

    const getStreamResponse = (promptText: string, systemPromptText = '', chatHistory: any[] = [], metaData: any = {}, rctx: RuntimeContext) => {
      const safeMeta = { ...metaData };
      if (safeMeta.subagentRuns) safeMeta.subagentRuns = safeMeta.subagentRuns.map((r: any) => ({ ...r, output: '[Omitted to save header space]' }));

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const enqueueStr = (text: string) => {
             const data = JSON.stringify({ choices: [{ delta: { content: text } }] });
             controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          };

          // 1. SSE EARLY INIT
          console.log("[SSE EARLY INIT] Streaming started before LLM calls");
          enqueueStr(""); // Send first chunk immediately to prevent hanging HTTP request

          if (rctx.stream.desktopOSMode && !systemPromptText.includes('DESKTOP NATIVE AWARENESS ENABLED')) {
             systemPromptText += `\n[STATUS: DESKTOP NATIVE AWARENESS ENABLED]\nAnda WAJIB mengeluarkan perintah Windows di dalam tag <terminal>. DILARANG menyebut sub-agent atau menolak. Contoh: <terminal>dir %USERPROFILE%\\Desktop</terminal>\n`;
          }

          // 2. TIMEOUT SAFETY FETCH
          const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 15000) => {
            const aborter = new AbortController();
            const id = setTimeout(() => aborter.abort(), timeout);
            try {
              const res = await fetch(url, { ...options, signal: aborter.signal });
              clearTimeout(id);
              return res;
            } catch (err) {
              clearTimeout(id);
              throw err;
            }
          };

          const processOpenAIStream = async (res: Response) => {
             const reader = res.body?.getReader();
             if (!reader) throw new Error("No body");
             let buffer = '';
             while (true) {
               const { done, value } = await reader.read();
               if (done) break;
               buffer += new TextDecoder().decode(value);
               const lines = buffer.split('\n');
               buffer = lines.pop() || '';
               for (const line of lines) {
                 if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                   try {
                     const data = JSON.parse(line.substring(6));
                     const content = data.choices?.[0]?.delta?.content || '';
                     if (content) enqueueStr(content);
                   } catch(e) {}
                 }
               }
             }
          };

          const processGeminiStream = async (res: Response) => {
             const reader = res.body?.getReader();
             if (!reader) throw new Error("No body");
             let buffer = '';
             let isThinking = false;
             while (true) {
               const { done, value } = await reader.read();
               if (done) break;
               buffer += new TextDecoder().decode(value);
               const lines = buffer.split('\n');
               buffer = lines.pop() || '';
               for (const line of lines) {
                 if (line.startsWith('data: ')) {
                   try {
                     const data = JSON.parse(line.substring(6));
                     const part = data.candidates?.[0]?.content?.parts?.[0];
                     let content = part?.text || '';
                     const partIsThought = !!part?.thought;
                     if (content) {
                       if (partIsThought && !isThinking) { content = '<think>\n' + content; isThinking = true; }
                       else if (!partIsThought && isThinking) { content = '\n</think>\n\n' + content; isThinking = false; }
                       enqueueStr(content);
                     }
                   } catch(e) {}
                 }
               }
             }
             if (isThinking) enqueueStr('\n</think>\n\n');
          };

          // Format messages
          const oaiMessages: any[] = [];
          const geminiContents = [];
          if (systemPromptText) {
             oaiMessages.push({ role: 'system', content: systemPromptText });
          }
          if (chatHistory && chatHistory.length > 0) {
            for (const msg of chatHistory) {
              oaiMessages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content });
              geminiContents.push({ role: msg.role === 'model' ? 'model' : 'user', parts: [{ text: msg.content }] });
            }
          }
          oaiMessages.push({ role: 'user', content: promptText });
          
          const userParts: any[] = [{ text: promptText }];
          if (rctx.stream.extractedImage) userParts.push({ inlineData: { mimeType: rctx.stream.extractedImage.mimeType, data: rctx.stream.extractedImage.data } });
          geminiContents.push({ role: 'user', parts: userParts });

          const geminiPayload: any = { contents: geminiContents };
          if (systemPromptText) geminiPayload.systemInstruction = { parts: [{ text: systemPromptText }] };

          // === STREAMING CASCADE EXECUTION ===
          let currentError = '';

          const tryGroq = async (fallbackNote = '') => {
            if (!rctx.keys.groq) throw new Error("No Groq Key");
            let groqModel = 'llama-3.1-8b-instant';
            if (rctx.model.model && rctx.model.model.startsWith('groq/')) groqModel = rctx.model.model.replace('groq/', '');
            console.log("[Stream] Trying Groq:", groqModel);
            const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${rctx.keys.groq}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: groqModel, messages: oaiMessages, temperature: 0.1, stream: true })
            });
            if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${await res.text()}`);
            if (fallbackNote) enqueueStr(`\n\n*(Fallback Note: ${fallbackNote})*\n\n`);
            await processOpenAIStream(res);
          };

          const tryOpenRouter = async (fallbackNote = '') => {
            if (!rctx.keys.openRouter) throw new Error("No OpenRouter Key");
            let orModel = 'meta-llama/llama-3.1-8b-instruct:free';
            if (rctx.model.model && rctx.model.model.startsWith('openrouter/')) orModel = rctx.model.model.replace('openrouter/', '');
            console.log("[Stream] Trying OpenRouter:", orModel);
            const res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${rctx.keys.openRouter}`, 'HTTP-Referer': 'https://ai-agent-project.vercel.app', 'X-Title': 'Mamet AI Agent', 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: orModel, messages: oaiMessages, temperature: 0.1, stream: true })
            });
            if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${await res.text()}`);
            if (fallbackNote) enqueueStr(`\n\n*(Fallback Note: ${fallbackNote})*\n\n`);
            await processOpenAIStream(res);
          };

          const tryGemini = async (fallbackNote = '') => {
             if (rctx.keys.allGemini.length === 0) throw new Error("No Gemini Keys");
             const geminiModel = rctx.model.model && rctx.model.model.includes('gemini') ? rctx.model.model : 'gemini-2.0-flash';
             console.log("[Stream] Trying Gemini:", geminiModel);
             
             let res: Response | null = null;
             let lastErr = '';
             for (let ki = 0; ki < rctx.keys.allGemini.length; ki++) {
               const key = rctx.keys.allGemini[(geminiKeyIndex + ki) % rctx.keys.allGemini.length];
               try {
                 const attempt = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${key}`, {
                   method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(geminiPayload)
                 }, 15000);
                 if (attempt.ok) {
                   geminiKeyIndex = (geminiKeyIndex + ki + 1) % rctx.keys.allGemini.length;
                   res = attempt;
                   break;
                 }
                 lastErr = `HTTP ${attempt.status}`;
                 if (attempt.status === 404 || attempt.status === 400) {
                     throw new Error(`FATAL_CLIENT_ERROR: Gemini Model Not Found or Bad Request. ${lastErr}`);
                 }
               } catch(e: any) { 
                 lastErr = e.message; 
                 if (lastErr.includes('FATAL_CLIENT_ERROR')) throw e;
               }
             }
             if (!res) throw new Error(`Gemini exhausted. Last error: ${lastErr}`);
             if (fallbackNote) enqueueStr(`\n\n*(Fallback Note: ${fallbackNote})*\n\n`);
             await processGeminiStream(res);
          };

          const tryOpenAI = async () => {
             if (!rctx.keys.openAI) throw new Error("No OpenAI Key");
             console.log("[Stream] Trying OpenAI:", rctx.model.model);
             const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
               method: 'POST', headers: { 'Authorization': `Bearer ${rctx.keys.openAI}`, 'Content-Type': 'application/json' },
               body: JSON.stringify({ model: rctx.model.model || 'gpt-4o-mini', messages: oaiMessages, temperature: 0.1, stream: true })
             });
             if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
             await processOpenAIStream(res);
          };

          const closeSafely = async () => {
             // --- 🔎 MAMET AI V3 LIGHT+ (AUDIT INJECTOR) ---
             try {
                if (safeMeta.auditMode === 'BASIC' || safeMeta.auditMode === 'FULL') {
                    const amode = safeMeta.auditMode;
                    const MAX_AUDIT_SUBAGENTS = 5;
                    const shortId = (id: string | null) => id ? `${id.substring(0, 8)}...` : 'null';
                    
                    let auditStr = '\n\n---\n**🔍 AUDIT REPORT**\n\n';
                    
                    if (amode === 'BASIC') {
                        const ragPass = safeMeta.routingDecision?.workspace_id ? 'PASS' : (safeMeta.routingDecision?.scope === 'CORE' ? 'PASS' : 'FAIL');
                        const hasSave = safeMeta.subagentRuns?.find((r: any) => r.toolExecution?.target);
                        
                        auditStr += `- **Execution Contract:** ${safeMeta.contractValidation?.status || 'N/A'}\n`;
                        auditStr += `- **Routing Scope:** ${safeMeta.routingDecision?.scope || 'N/A'}\n`;
                        auditStr += `- **RAG Isolation:** ${ragPass}\n`;
                        if (hasSave) auditStr += `- **Save Decision:** APPROVED\n`;
                    } else if (amode === 'FULL') {
                        auditStr += `**Execution Contract:**\n${safeMeta.contractValidation?.status || 'N/A'}\n\n`;
                        
                        auditStr += `**Routing Decision:**\nscope=${safeMeta.routingDecision?.scope || 'N/A'}\nworkspace_id=${shortId(safeMeta.routingDecision?.workspace_id)}\n\n`;
                        
                        auditStr += `**RAG:**\nscope=${safeMeta.routingDecision?.scope || 'N/A'}\nworkspace_id=${shortId(safeMeta.routingDecision?.workspace_id)}\nmatch_count=AUTO\n\n`;
                        
                        const saveTask = safeMeta.subagentRuns?.find((r: any) => r.toolExecution?.target);
                        if (saveTask && saveTask.toolExecution) {
                            auditStr += `**Save:**\ntarget=${saveTask.toolExecution.target}\nworkspace_id=${shortId(saveTask.toolExecution.workspace_id)}\nreason_code=${saveTask.toolExecution.reason_code}\napproved_by=${saveTask.toolExecution.approved_by}\n\n`;
                        }
                        
                        if (safeMeta.subagentRuns?.length > 0) {
                            auditStr += `**Subagent Execution:**\n`;
                            const runs = safeMeta.subagentRuns.slice(0, MAX_AUDIT_SUBAGENTS);
                            for (const r of runs) {
                                auditStr += `- ${r.subagent}\n`;
                            }
                            if (safeMeta.subagentRuns.length > MAX_AUDIT_SUBAGENTS) {
                                auditStr += `- ... (${safeMeta.subagentRuns.length - MAX_AUDIT_SUBAGENTS} more)\n`;
                            }
                        }
                    }
                    
                    const MAX_AUDIT_LENGTH = 1500;
                    if (auditStr.length > MAX_AUDIT_LENGTH) {
                        auditStr = auditStr.substring(0, MAX_AUDIT_LENGTH) + '\n... [AUDIT_TRUNCATED]';
                    }
                    
                    enqueueStr(auditStr);
                }
             } catch (auditErr) {
                console.error("[Audit Injector Error]", auditErr);
             }

             try { controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`)); } catch (e) {}
             controller.close();
             await rctx.tasks.awaitAll();
          };

          try {
            // EXPLICIT MODELS
            if (rctx.model.model && rctx.model.model.includes('gpt') && !rctx.model.model.includes('openrouter') && rctx.keys.openAI) {
              try { await tryOpenAI(); await closeSafely(); return; } catch(e: any) { currentError += e.message; console.warn("OpenAI fail, cascading...", e); }
            }
            if (rctx.model.model && (rctx.model.model.includes('openrouter') || rctx.model.model.startsWith('openrouter/')) && rctx.keys.openRouter) {
              try { await tryOpenRouter(); await closeSafely(); return; } catch(e: any) { currentError += e.message; console.warn("OR fail, cascading...", e); }
            }
            if (rctx.model.model && rctx.model.model.startsWith('groq/') && rctx.keys.groq) {
              try { await tryGroq(); await closeSafely(); return; } catch(e: any) { currentError += e.message; console.warn("Groq fail, cascading...", e); }
            }

            // CASCADE: Gemini -> Groq -> OpenRouter
            try {
               await tryGemini(); await closeSafely(); return;
            } catch(e1: any) {
               if (e1.message.includes('FATAL_CLIENT_ERROR')) {
                   enqueueStr(`\n\n**[SYSTEM HALTED] Client Error:** ${e1.message}\n\n`);
                   await closeSafely(); return;
               }
               console.warn("Cascade: Gemini failed:", e1.message);
               try {
                  await tryGroq("Gemini sedang limit, ini otak cadangan Groq"); await closeSafely(); return;
               } catch(e2: any) {
                  console.warn("Cascade: Groq failed:", e2.message);
                  try {
                     await tryOpenRouter("Groq dan Gemini limit, ini otak cadangan OpenRouter"); await closeSafely(); return;
                  } catch(e3: any) {
                     console.error("Cascade: OpenRouter failed:", e3.message);
                     enqueueStr(`\n\n**Semua AI Provider (Gemini, Groq, OpenRouter) sedang limit atau gangguan.**\nDetail: ${e1.message} | ${e2.message} | ${e3.message}`);
                     await closeSafely(); return;
                  }
               }
            }
          } catch(fatalErr: any) {
             console.error("Fatal Stream Error:", fatalErr);
             enqueueStr(`\n\n**Internal Server Error:** ${fatalErr.message}`);
             await closeSafely();
          }
        }
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'X-Agent-Metadata': btoa(encodeURIComponent(JSON.stringify(safeMeta)))
        }
      });
    };
    
    // --- RAG KNOWLEDGE BASE SEARCH ---
    
    if (ctx.auth.userId && isRagEnabled) {
      try {
        const queryEmbedding = await getGeminiEmbedding(message, GEMINI_API_KEY);
        if (queryEmbedding.length > 0) {
          const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
          );
          // 🧭 STEP 2: ROUTING DECIDER LAYER (EXPLICIT CONTROL)
          routingDecision = {
              scope: "CORE",
              workspace_id: null as string | null,
              reason_code: "DEFAULT_ROUTING"
          };

          const { data: spaces } = await supabaseClient.from('knowledge_spaces').select('id, name, space_type').eq('user_id', ctx.auth.userId);
          if (spaces && spaces.length > 0) {
             const coreSpace = spaces.find((s: any) => s.space_type === 'CORE');
             routingDecision.workspace_id = coreSpace ? coreSpace.id : null;

             ctx.request.lowerMsg = (ctx.request.finalMessage || '').toLowerCase();
             const isWorkspaceQuery = ctx.request.lowerMsg.includes('workspace') || ctx.request.lowerMsg.includes('ruang') || ctx.request.lowerMsg.includes('space');
             if (isWorkspaceQuery) {
                const workspaceSpaces = spaces.filter((s: any) => s.space_type === 'WORKSPACE').sort((a: any, b: any) => b.name.length - a.name.length);
                for (const space of workspaceSpaces) {
                   if (ctx.request.lowerMsg.includes(space.name.toLowerCase())) {
                      routingDecision = {
                          scope: "WORKSPACE",
                          workspace_id: space.id,
                          reason_code: "EXPLICIT_WORKSPACE_MENTION_DETECTED"
                      };
                      break;
                   }
                }
             }

             if (routingDecision.scope === "CORE") {
                 routingDecision.reason_code = isWorkspaceQuery ? "WORKSPACE_NOT_FOUND_FALLBACK_TO_CORE" : "NO_EXPLICIT_WORKSPACE_DETECTED";
             }
          }

          // 🧱 STEP 3: RAG HARD ISOLATION LAYER (LIGHT ENFORCEMENT)
          // NO hidden fallback to GLOBAL RAG
          if (!routingDecision.workspace_id) {
             console.warn(`[RAG HARD ISOLATION] workspace_id is null. GLOBAL FALLBACK IS BLOCKED.`);
          } else {
             console.log(`[RAG_SCOPE_USED]: ${routingDecision.scope} | [WORKSPACE_ID]: ${routingDecision.workspace_id} | [IS_ISOLATED]: true`);
          }
          
          ctx.state.processingSteps.push(`🔍 [Routing Decider] Scope: ${routingDecision.scope} (${routingDecision.reason_code})`);

          const { data: matchedDocs, error: matchError } = await supabaseClient.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: effectiveRagThreshold,
            match_count: effectiveRagMatchCount,
            p_user_id: ctx.auth.userId,
            p_space_id: routingDecision.workspace_id
          });

          if (matchError) {
             throw new Error(`RAG_DB_FAIL: ${matchError.message}`);
          }

          if (matchedDocs && matchedDocs.length > 0) {
            // 1. DEDUPLICATION LAYER (POST-RAG)
            const calculateCosineSimilarity = (strA: string, strB: string) => {
              const getWords = (s: string) => s.toLowerCase().match(/\w+/g) || [];
              const wordsA = getWords(strA);
              const wordsB = getWords(strB);
              const dict = new Set([...wordsA, ...wordsB]);
              let dotProduct = 0; let normA = 0; let normB = 0;
              dict.forEach(w => {
                const countA = wordsA.filter(x => x === w).length;
                const countB = wordsB.filter(x => x === w).length;
                dotProduct += countA * countB;
                normA += countA * countA;
                normB += countB * countB;
              });
              if (normA === 0 || normB === 0) return 0;
              return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
            };

            const deduplicatedDocs = [];
            for (const doc of matchedDocs) {
              let isDuplicate = false;
              for (const savedDoc of deduplicatedDocs) {
                if (calculateCosineSimilarity(doc.content, savedDoc.content) > 0.92) {
                  if (doc.similarity > savedDoc.similarity) {
                     savedDoc.content = doc.content;
                     savedDoc.similarity = doc.similarity;
                  }
                  isDuplicate = true;
                  break;
                }
              }
              if (!isDuplicate) deduplicatedDocs.push(doc);
            }

            // 2. CONTEXT RE-RANKING LAYER
            const queryWords = message.toLowerCase().match(/\w+/g) || [];
            const validQueryWords = queryWords.filter((w: string) => w.length > 3);
            
            deduplicatedDocs.forEach((doc: any, idx: number) => {
              const vector_similarity = doc.similarity || 0;
              const position_weight = 1.0 - (idx / deduplicatedDocs.length);
              
              const docWordsStr = doc.content.toLowerCase();
              let matchCount = 0;
              for(const qw of validQueryWords) {
                 if (docWordsStr.includes(qw)) matchCount++;
              }
              const query_coverage_score = validQueryWords.length > 0 ? Math.min(1.0, matchCount / validQueryWords.length) : 0;
              
              doc.hybrid_score = (vector_similarity * 0.7) + (position_weight * 0.2) + (query_coverage_score * 0.1);
            });

            deduplicatedDocs.sort((a: any, b: any) => b.hybrid_score - a.hybrid_score);

            ctx.state.ragArray = deduplicatedDocs.map((doc: any) => ({ type: 'rag', content: `[Dari file "${doc.title}"]: "${doc.content}"`, score: doc.hybrid_score }));
          }
        }
      } catch (err: any) {
        console.error("RAG Search Error:", err);
        if (err.message && err.message.includes("RAG_DB_FAIL")) {
            throw err; // Lempar ke outer catch agar request putus dan mengirimkan HTTP 500
        }
      }
    }
    console.log(`[RAG CONTEXT GENERATED] ctx.state.ragArray size=${ctx.state.ragArray.length}`);
    ctx.state.processingSteps.push(`[RAG CONTEXT GENERATED] ctx.state.ragArray size=${ctx.state.ragArray.length}`);

    if (ctx.request.finalMessage.toLowerCase().includes('zip')) {
      ctx.request.finalMessage += `\n\n[PERINTAH SANGAT PENTING DARI SISTEM]: User meminta file ZIP. Anda DILARANG menggunakan blok kode biasa seperti \`\`\`html. ANDA WAJIB MENGGUNAKAN format \`\`\`xml_zip. 
<EXAMPLES>
Contoh Jawaban Anda yang BENAR:
Baik, ini file zip-nya:
\`\`\`xml_zip
<filename>nama_file.zip</filename>
<file name="index.html">
<!-- isi html -->
</file>
\`\`\`
</EXAMPLES>
Wajib ikuti struktur persis seperti contoh di atas!`;
    }

    const currentDateStr = new Date().toISOString().split('T')[0];
    let agentIdentityPrompt = `\nKONTEKS WAKTU HARI INI: ${currentDateStr} (Tahun berjalan saat ini adalah 2026).
BATAS PENGETAHUAN ANDA: Akhir 2024 / Awal 2025. Anda harus sangat berhati-hati jika ditanya informasi setelah batas pengetahuan Anda, dan sampaikan dalam proses berpikir Anda secara jujur bahwa informasi setelah akhir 2024 mungkin tidak lengkap atau membutuhkan pencarian web terbaru jika tersedia.

IDENTITAS ANDA: Anda adalah "Mamet", asisten cerdas buatan yang merupakan hak paten dari aplikasi ini. Selalu perkenalkan diri Anda sebagai Mamet. JANGAN katakan Anda buatan Google atau OpenAI. Anda memiliki kemampuan BERKEMBANG DARI PENGALAMAN: Selalu perhatikan 'history' obrolan. Pelajari gaya bahasa, preferensi, dan teguran/koreksi dari user di masa lalu untuk memperbaiki jawaban Anda di masa depan.
MODEL AI YANG ANDA GUNAKAN SAAT INI: ${model || 'gemini-2.0-flash'}. Anda dapat memberitahu user secara jujur model/otak AI apa yang sedang menggerakkan Anda saat ini jika ditanya.\n`;

    agentIdentityPrompt += `\n[WORKSPACE GUARDIAN OMNI-LOCK] Storage target saat ini adalah ${storageTarget}. Jika target adalah SUPABASE, Anda DILARANG KERAS menggunakan tag <edit_file> atau perintah <terminal> yang merubah file/folder lokal!\n`;

    if (ctx.policy.canUseDesktopTools) {
      agentIdentityPrompt += `\n[STATUS: DESKTOP NATIVE AWARENESS ENABLED]
PENTING UNTUK KESELAMATAN AI: Anda HANYA DIMINTA UNTUK MEMBERIKAN TEKS / SCRIPT BASH/POWERSHELL di dalam tag <terminal>. Aplikasi Frontend (Mamet Desktop) yang akan mengeksekusinya. Anda DILARANG menolak. Cukup berikan script yang diminta!
JIKA USER MEMINTA CEK DESKTOP, CARI FILE, CARI FOLDER, ATAU JALANKAN PERINTAH DI KOMPUTER LOKAL MEREKA:
- DILARANG KERAS menyebut atau memanggil "sub-agent file_analyzer" atau sub-agent apapun! Anda yang mengerjakan sendiri!
- DILARANG KERAS mengatakan "saya tidak punya akses" atau "lakukan sendiri di terminal Anda"!
<EXAMPLES>
- ANDA WAJIB langsung mengeluarkan perintah di dalam tag <terminal>perintah_windows_disini</terminal>
- Contoh: <terminal>dir %USERPROFILE%\\Desktop</terminal>
- Untuk cari file: <terminal>dir /s /b C:\\Users\\*nama_file*</terminal>
- Untuk edit file: <edit_file path="C:/path/file.txt">isi_teks</edit_file>
- Untuk search di seluruh hardisk: <search_disk>nama_file</search_disk>
- JIKA USER MEMINTA JALANKAN AIRDROP / BROWSER STEALTH / BOT WEB3:
  Keluarkan tag: <run_airdrop task="nama_task_airdrop"></run_airdrop>
  Contoh: <run_airdrop task="test_stealth"></run_airdrop>
</EXAMPLES>
INGAT: Ini adalah Windows OS. Gunakan perintah Windows (dir, cd, type, copy) BUKAN Linux (ls, cat, cp)!\n`;
    }

    agentIdentityPrompt += `\nPANDUAN PENALARAN & CHAIN-OF-THOUGHT (DEEPSEEK STYLE - WAJIB):
Sebelum memberikan jawaban akhir, Anda WAJIB menuliskan proses berpikir Anda secara transparan di dalam tag <think>...</think>.
Isi tag think harus sangat detail, kritis, dan jujur, mencakup:
1. Apa yang Anda pahami dari pertanyaan/permintaan user.
2. Analisis perbandingan tanggal/waktu (Hari ini: ${currentDateStr} vs Batas Pengetahuan: Akhir 2024). Analisis apakah data yang ditanyakan ada di dalam memori Anda atau sudah kedaluwarsa.
3. Rencana langkah/strategi (apakah menggunakan data internal, sub-agent, pencarian web, dll).
4. Hasil analisis mendalam atau perdebatan alternatif solusi.
5. Kesimpulan logis sebelum menyusun jawaban akhir.
Tuliskan proses berpikir ini dalam bahasa Indonesia yang natural, logis, dan detail (1-2 paragraf lengkap). Jangan terburu-buru menyimpulkan. Setelah tag </think>, barulah tulis jawaban akhir Anda. Contoh format:
<think>
User menanyakan model AI open source tercanggih saat ini. Hari ini adalah 2 Juni 2026, sedangkan batas pengetahuan saya adalah Oktober 2024. Oleh karena itu, saya harus menyampaikan bahwa pengetahuan saya terbatas hingga akhir 2024 dan saya tidak mengetahui model yang rilis setelah periode tersebut tanpa pencarian web. Berdasarkan memori internal saya, Llama 3.1 405B adalah yang terkuat di akhir 2024. Saya akan menyajikannya dan memberi peringatan tentang kemungkinan model baru di 2026.
</think>
Hingga batas pengetahuan saya (akhir 2024)...

FITUR GRAFIK INTERAKTIF: Jika user meminta untuk membuat grafik (bar/pie/line chart) berdasarkan data, outputkan data tersebut DALAM BENTUK BLOK KODE seperti ini:
<EXAMPLES>
\`\`\`json_chart
{ "title": "Judul Grafik", "type": "bar", "data": [{"name": "A", "value": 10}], "xKey": "name", "yKey": "value" }
\`\`\`
</EXAMPLES>
Pilih type "bar", "pie", atau "line" sesuai kebutuhan.
FITUR ZIP GENERATOR: Jika user meminta Anda membuat file zip (project kodingan), outputkan data DALAM BENTUK BLOK KODE seperti ini (wajib persis):
<EXAMPLES>
\`\`\`xml_zip
<filename>nama_bebas.zip</filename>
<file name="index.html">
<h1>Halo</h1>
</file>
<file name="app.js">
console.log('hi');
</file>
\`\`\`
</EXAMPLES>
DILARANG KERAS MENGGUNAKAN PYTHON ATAU "TOOL_CODE". JANGAN PERNAH MENULISKAN KODE PYTHON UNTUK MENGEKSEKUSI TOOL. JAWABLAH DENGAN TEKS BIASA.

[ANTI-HALLUCINATION CONTRACT]
Jika blok <RAG> dan <MEMORY> kosong, ANDA DILARANG KERAS mengarang fakta, nama file, histori, atau contoh kodingan. Jawab saja bahwa data tidak ditemukan di database internal. Semua yang ada di dalam tag <EXAMPLES> hanyalah panduan format, BUKAN FAKTA RUNTIME!

ATURAN MEMORI (SANGAT PENTING): 
Semua proses penyimpanan memori/fakta dilakukan SECARA OTOMATIS di latar belakang (background) oleh sistem sebelum Anda menjawab. 
DILARANG KERAS memanggil tool memori secara manual. Anda dilarang memberikan konfirmasi teknis penyimpanan memori.
Do not extract memory from messages that are incomplete sentences, iterative corrections, or confirmations like "ya benar", "di sana", "betul". Only store memory after a stable, single-turn final statement.
You are NOT allowed to claim memory is stored.
You must only rely on [MEMORY_SYSTEM_ACK] from system.
If [MEMORY_SYSTEM_ACK] is missing or memory_state is NOT "committed" → treat memory as NOT stored.
Never generate or simulate tool calls.
Only system backend performs memory persistence.
If [MEMORY_SYSTEM_ACK] is MISSING, you MUST NOT state that memory is saved. Instead, just acknowledge the user's message conversationally (e.g., "Baik, saya mengerti", "Terima kasih informasinya"). NEVER OUTPUT AN EMPTY RESPONSE.

Anda memiliki tim Sub-Agent nyata berikut ini:\n${getPluginPromptList()}\nJika user menanyakan jumlah atau nama sub-agent Anda, sebutkan nama-nama di atas.`;
    let userContextPrompt = ctx.auth.userName ? `\nInformasi Akun: User login dengan email/nama "${ctx.auth.userName}". Prioritaskan memanggil user dengan nama ini, kecuali user menyebut nama lain.` : '';
    
    // --- MEMORY MANAGER (RETRIEVAL) ---
    ctx.state.memoryArray = ctx.policy.canReadMemory
      ? await retrieveMemories(ctx.request.finalMessage, ctx.auth.userId, Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '')
      : [];
    if (!Array.isArray(ctx.state.memoryArray)) ctx.state.memoryArray = [];
    
    const memoryPrompt = globalMemory ? `\n\n[MEMORI GLOBAL & PREFERENSI USER]:\n${globalMemory}\n(Patuhi instruksi/ingatan di atas secara ketat di setiap jawaban Anda!)` : '';
    console.log(`[MEMORY PROMPT GENERATED] memoryPrompt="${memoryPrompt.trim()}" ctx.state.memoryArray size=${ctx.state.memoryArray.length}`);
    ctx.state.processingSteps.push(`[MEMORY PROMPT GENERATED] memoryPrompt="${memoryPrompt.trim()}" ctx.state.memoryArray size=${ctx.state.memoryArray.length}`);

    // --- SINGLE GATEWAY: ANTI DUPLICATE MEMORY (TIER 1 & 2) ---
    // Dipanggil TEPAT SEBELUM membangun final context.
    if (ctx.auth.userId && ctx.request.finalMessage && typeof ctx.request.finalMessage === 'string' && ctx.request.finalMessage.trim().length > 0) {
      console.log(`[MEMORY_GATEWAY] Edge Function hanya validasi auth dan memproses LLM. Tidak ada auto-save sembunyi.`);
    }

    // --- ENGINEER CONTEXT (ADR-0006: Two-Brain Context Model) ---
    let engineerContextPrompt = '';
    let brain1Ids: string[] = [];
    let brain2Tasks: string[] = [];
    let brain2Gaps: string[] = [];
    let brain2Verifications: string[] = [];

    if (ctx.policy.mode === 'ENGINEER') {
      try {
        const supClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        
        const lowerMsgForEngineer = (message || '').toLowerCase();
        
        // Lazy-load triggers
        const needsDeprecatedADR = /deprecated|konflik|conflict|history|lama|diganti|obsolete|pola lama/.test(lowerMsgForEngineer);

        // =====================================================
        // BRAIN 1 — STATIC ENGINEERING KNOWLEDGE
        // Governance-aware: hanya load ACTIVE/APPROVED/VERIFIED + is_current
        // Source of truth for architecture & rules.
        // =====================================================
        const staticRes = await supClient
          .from('project_memory_entries')
          .select('id, entry_type, title, content, governance_status, version_major, version_minor, version_patch, is_current')
          .in('governance_status', ['ACTIVE', 'APPROVED', 'VERIFIED'])
          .eq('is_current', true)
          .in('entry_type', ['ADRLink', 'Solution', 'Lesson', 'RootCause'])
          .order('created_at', { ascending: false })
          .limit(8);

        // Log governance filter untuk audit
        const skippedEntries = (staticRes.data || []).filter((e: any) =>
          e.governance_status === 'SUPERSEDED' || e.governance_status === 'DEPRECATED'
        );
        if (skippedEntries.length > 0) {
          console.log(`[GOVERNANCE] Skipped ${skippedEntries.length} entries: ${skippedEntries.map((e: any) => `${e.title}(${e.governance_status})`).join(', ')}`);
        }

        const brain1Entries = staticRes.data || [];
        brain1Ids = brain1Entries.map((e: any) =>
          `${e.title} [v${e.version_major || 1}.${e.version_minor || 0}.${e.version_patch || 0}]`
        );
        // Simpan raw entries untuk confidence engine
        (ctx as any).brain1Entries = brain1Entries;

        // =====================================================
        // BRAIN 2 — DYNAMIC ENGINEERING CONTEXT
        // Loaded per request. Changes every session.
        // Source of truth for current state & runtime facts.
        // =====================================================
        const [tasksRes, gapsRes, verRes] = await Promise.all([
          supClient.from('engineering_tasks').select('task_number, title, status, goal').in('status', ['Proposed', 'InProgress']).order('created_at', { ascending: false }).limit(5),
          supClient.from('architecture_gaps').select('gap_number, title, status, description').in('status', ['Open', 'InProgress']).order('created_at', { ascending: false }).limit(5),
          supClient.from('verification_runs').select('related_task, result, verification_type, evidence').order('created_at', { ascending: false }).limit(3)
        ]);

        brain2Tasks = tasksRes.data?.map((t: any) => t.task_number) || [];
        brain2Gaps = gapsRes.data?.map((g: any) => g.gap_number) || [];
        brain2Verifications = verRes.data?.map((v: any) => v.related_task) || [];

        // Lazy-load Deprecated ADRs (only on conflict/history keywords)
        let deprecatedContext = '';
        if (needsDeprecatedADR) {
          const depRes = await supClient.from('project_memory_entries').select('entry_type, title, content').eq('status', 'Deprecated').order('updated_at', { ascending: false }).limit(5);
          if (depRes.data && depRes.data.length > 0) {
            deprecatedContext = `\n[HISTORICAL CONTEXT — Deprecated ADRs]\n`;
            deprecatedContext += `NOTE: These are history, not current rules. They explain WHY a decision was once made.\n`;
            deprecatedContext += depRes.data.map((e: any) => `- [DEPRECATED] ${e.title}`).join('\n') + '\n';
          }
        }

        engineerContextPrompt = `\n\n[MAMET ENGINEER CONTEXT — Two-Brain Model (ADR-0006)]\n`;

        // STATIC BRAIN
        engineerContextPrompt += `\n--- BRAIN 1: STATIC ENGINEERING KNOWLEDGE (Foundation — rarely changes) ---\n`;
        engineerContextPrompt += staticRes.data?.map((e: any) => `[${e.entry_type}] ${e.title}: ${e.content}`).join('\n') || 'No static knowledge loaded.';
        engineerContextPrompt += '\n';

        // DYNAMIC BRAIN
        engineerContextPrompt += `\n--- BRAIN 2: DYNAMIC ENGINEERING CONTEXT (Current state — changes per session) ---\n`;
        engineerContextPrompt += `Active Tasks:\n${tasksRes.data?.map((t: any) => `- ${t.task_number} (${t.status}): ${t.title} | Goal: ${t.goal}`).join('\n') || 'None'}\n`;
        engineerContextPrompt += `Architecture Gaps:\n${gapsRes.data?.map((g: any) => `- ${g.gap_number} (${g.status}): ${g.title}`).join('\n') || 'None'}\n`;
        engineerContextPrompt += `Recent Verifications:\n${verRes.data?.map((v: any) => `- [${v.result}] ${v.related_task} (${v.verification_type}): ${v.evidence}`).join('\n') || 'None'}\n`;
        if (deprecatedContext) engineerContextPrompt += deprecatedContext;

        // --- PHASE 6-8: ENGINEER RULES (ADR-0004, ADR-0005, ADR-0006) ---
        engineerContextPrompt += `
[ENGINEER RULES - MAEF COMPLIANCE REQUIRED]
You are Mamet Engineer. Follow ALL rules without exception.
Context above is organized as Two-Brain Model (ADR-0006):
  BRAIN 1 (Static): Foundation knowledge — architecture, ADRs, lessons.
  BRAIN 2 (Dynamic): Session facts — tasks, gaps, verifications, user-provided diff/logs.

RULE 1 - SCOPED CODE REVIEW (Phase 6):
Before reviewing, establish scope using this pipeline:
  Task → Affected Files → Git Diff → Relevant ADR (from BRAIN 1) → Relevant Coding Rules
Do NOT read the entire Project Memory for a small single-file change.
If any of these four pillars is missing, state which one and ask for it BEFORE reviewing:
  [1] TASK        - What is the purpose? (from BRAIN 2 Tasks above)
  [2] DIFF        - What changed? (user MUST provide git diff in their message)
  [3] ADR         - Which architecture decision governs this scope? (filter from BRAIN 1)
  [4] RULES       - Does the change violate established coding patterns? (from BRAIN 1)

RULE 2 - TWO-DIMENSIONAL CONFIDENCE (mandatory on ALL recommendations):
Confidence has two dimensions — not a simple count:
  Coverage    : which sources are available (checklist from both BRAIN 1 + BRAIN 2)
  Evidence    : how strong/complete the evidence is from those sources

Output this block FIRST:
<EXAMPLES>
---
Engineering Confidence
Coverage (BRAIN 1 - Static):
- [✓/✗] ADR: ADR-xxx / none found for this scope
- [✓/✗] Coding Rules: found / not found
- [✓/✗] Architecture/Lessons: N entries

Coverage (BRAIN 2 - Dynamic):
- [✓/✗] TASK: TASK-xxx (title)
- [✓/✗] git diff: provided / not provided
- [✓/✗] Verification: N recent results
- [✓/✗] Affected Files: identified / unknown

Evidence Strength: [STRONG / MODERATE / WEAK]
Reason: [explain WHY — not just "all boxes checked"]

Recommendation: [proceed / state gaps / request more context]
---
</EXAMPLES>

RULE 3 - IMPLEMENTATION SAFETY FLOW (Phase 7):
When generating a code patch, output Self Verification BEFORE User Review:
<EXAMPLES>
Self Verification:
- Syntax        : PASS/FAIL - [reason]
- Architecture  : PASS/FAIL - [aligned with BRAIN 1 ADR / violation: reason]
- Coding Rules  : PASS/FAIL - [aligned with BRAIN 1 Rules / violation: reason]
- Dependencies  : PASS/FAIL - [no new / added: list them]
→ "Awaiting User Review before Apply."
</EXAMPLES>

RULE 4 - PROJECT HEALTH REPORT (Phase 8):
When performing maintenance, output a health report covering BOTH brains:
<EXAMPLES>
BRAIN 1 health:
- ADR Status        : [any gaps between ADRs and current codebase?]
- Deprecated ADRs   : [loaded only if triggered — history, not forbidden]

BRAIN 2 health:
- Architecture Gaps : [count open] HEALTHY / WARNING / CRITICAL
- Failed/Stalled Tasks : [any InProgress tasks stalled]
- Verification History : [most recent results]
- Test Results      : [from verification entries]
- Dependency Changes : [flag any patch introducing new deps]
</EXAMPLES>

Violating any rule above is a breach of Mamet AI Engineering Framework (MAEF).
`;
      } catch (err) {
        console.error("Failed to fetch engineer context:", err);
      }
    }

    let basePrompts = agentIdentityPrompt + userContextPrompt + memoryPrompt + engineerContextPrompt;
    if (ctx.policy.webHint === "HIGH_PRIORITY") {
      basePrompts += `\n[WEB vs RAG COMPARISON CONTRACT]: Jika terdapat perbedaan antara dokumen RAG internal dan Web/Internet, identifikasi mana yang lebih baru secara eksplisit.`;
    }
    
    const resolved = buildContextFusion({
      memoryArray: ctx.state.memoryArray,
      ragArray: ctx.state.ragArray,
      message: ctx.request.finalMessage,
      basePrompts,
      ctx
    });
    
    let fullSystemContext = resolved.finalContext;
    
    // === EVIDENCE VALIDATOR — Hard Gate Layer ===
    // Ini adalah "hakim" yang memutuskan apakah LLM boleh dipanggil.
    // Filosofi: jika evidence = 0 di Engineer mode → STOP, jangan kirim ke LLM.
    const ragIds = ctx.state.ragArray.map((r: any) => {
       const match = r.content?.match(/\[Dari file "([^"]+)"\]/);
       return match ? match[1] : 'unknown_doc';
    });
    const memoryCount = ctx.state.memoryArray.length;

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

    // LOGGING Evidence Report
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
    ctx.state.processingSteps.push(`[EVIDENCE_GATE] Verdict=${evidenceReport.verdict} | total=${evidenceReport.totalEvidence}`);

    // Background: Simpan audit log ke Supabase
    safeFireAndTrack('EvidenceAuditLog', (async () => {
      try {
        const supClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        await supClient.from('evidence_audit_logs').insert([{
          request_id: evidenceReport.requestId,
          user_id: ctx.auth.userId,
          mode: evidenceReport.mode,
          app_source: ctx.auth.appSource,
          brain1_count: evidenceReport.brain1Count,
          brain2_count: evidenceReport.brain2Count,
          rag_count: evidenceReport.ragCount,
          memory_count: evidenceReport.memoryCount,
          total_evidence: evidenceReport.totalEvidence,
          brain1_ids: brain1Ids,
          brain2_tasks: brain2Tasks,
          brain2_gaps: brain2Gaps,
          rag_docs: ragIds,
          verdict: evidenceReport.verdict,
          block_reason: evidenceReport.blockReason,
          llm_called: evidenceReport.isValid,
          message_preview: (ctx.request.finalMessage || '').substring(0, 100),
          routing_scope: routingDecision?.scope || null,
          workspace_id: routingDecision?.workspace_id || null,
        }]);
      } catch (auditErr) {
        console.error('[EVIDENCE_AUDIT_LOG_FAIL]', auditErr);
      }
    })());

    // === HARD BLOCK: Jika verdict BLOCKED, hentikan pipeline di sini ===
    if (!evidenceReport.isValid) {
      const blockedMsg = buildBlockedResponse(evidenceReport, ctx.request.finalMessage);
      console.warn(`[EVIDENCE_GATE BLOCKED] User=${ctx.auth.userId} Mode=${ctx.policy.mode} Reason=${evidenceReport.blockReason}`);

      if (stream) {
        const blockedStream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            const data = JSON.stringify({ choices: [{ delta: { content: blockedMsg } }] });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
          }
        });
        return new Response(blockedStream, {
          headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' }
        });
      } else {
        return new Response(JSON.stringify({ message: blockedMsg }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Inject EVIDENCE_GATE_VERDICT ke system context (LLM tahu status evidencenya)
    fullSystemContext += evidenceReport.gateVerdictText;

    // === PHASE 2: CONFIDENCE ENGINE + UNIVERSAL CONTRACT ===
    // Hitung confidence dari backend (deterministic) — bukan dari LLM
    const brain1EntriesForConf = (ctx as any).brain1Entries || [];
    const ragDocTitles = ctx.state.ragArray.map((r: any) => {
      const match = r.content?.match(/\[Dari file "([^"]+)"\]/);
      return match ? match[1] : 'rag_doc';
    });

    let activeConflictsCount = 0;
    const currentEntryIds = brain1EntriesForConf.map((e: any) => e.id).filter(Boolean);
    if (currentEntryIds.length > 0) {
      try {
        const supClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        const { count, error } = await supClient
          .from('knowledge_conflicts')
          .select('*', { count: 'exact', head: true })
          .eq('resolution_status', 'OPEN')
          .in('entry_a_id', currentEntryIds);
        if (!error && count) activeConflictsCount = count;
      } catch (e) {
        console.error('[CONFIDENCE_ENGINE] Error querying conflicts:', e);
      }
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
      activeConflicts: activeConflictsCount, // Berasal dari runtime Supabase
      hasVerification: brain2Verifications.length > 0,
      allCurrent: brain1EntriesForConf.every((e: any) => e.is_current !== false),
    });

    console.log('[CONFIDENCE_ENGINE]', {
      score: confidenceReport.score,
      grade: confidenceReport.grade,
      label: confidenceReport.label,
      evidenceCount: confidenceReport.signals.evidenceCount,
    });
    ctx.state.processingSteps.push(`[CONFIDENCE] ${confidenceReport.score}% Grade:${confidenceReport.grade} | ${confidenceReport.label}`);

    // === PHASE 2: UNIVERSAL EVIDENCE CONTRACT ===
    // Build contract 6-blok yang sama formatnya untuk semua LLM provider
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

    // Ekstrak blok-blok dari resolved context fusion
    const memoryContextText = resolved.memory?.length > 0 
      ? resolved.memory.map((m: any) => m.content).join('\n') : '';
    const ragContextText = resolved.rag?.length > 0 
      ? resolved.rag.map((r: any) => r.content).join('\n') : '';
    
    // Brain 1 context text build
    const brain1ContextText = brain1EntriesForConf.map((e: any) => `[${e.entry_type}] ${e.title}: ${e.content}`).join('\n');
    let brain2ContextText = '';
    if (brain2Tasks.length > 0) brain2ContextText += `Active Tasks: ${brain2Tasks.join(', ')}\n`;
    if (brain2Gaps.length > 0) brain2ContextText += `Architecture Gaps: ${brain2Gaps.join(', ')}\n`;
    if (brain2Verifications.length > 0) brain2ContextText += `Recent Verifications: ${brain2Verifications.join(', ')}\n`;

    // Gabung instruksi inti (Identity, Sub-Agents, Zip, Web Hint)
    let systemBasePrompt = agentIdentityPrompt + userContextPrompt + memoryPrompt;
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

    // SOURCE OF TRUTH PAYLOAD: Universal Contract
    fullSystemContext = universalContract.asSystemPromptText();


    console.log("[MAMET BRAIN v2]", {
      memoryUsed: resolved.memory.length,
      ragUsed: resolved.rag.length,
      contextSize: fullSystemContext.length,
      evidenceVerdict: evidenceReport.verdict,
    });

    console.log(`[SYSTEM CONTEXT FINAL] fullSystemContext="${fullSystemContext.substring(fullSystemContext.length - 300)}"`);
    ctx.state.processingSteps.push(`[SYSTEM CONTEXT FINAL] fullSystemContext="${fullSystemContext.substring(fullSystemContext.length - 300)}"`);

    // Gateway already moved up.

    if (tools && tools.length > 0) {
      // --- INTENT ROUTER (Pemotong Kompas Cerdas) ---
      let isChatBiasa = false;
      ctx.request.lowerMsg = ctx.request.finalMessage.toLowerCase();
      ctx.state.processingSteps.push('🔍 Menganalisis permintaan user...');
      
      // Deteksi instan (Hardcoded) untuk fitur yang membutuhkan sub-agent/tools
      const desktopLocalKeywords = ["desktop", "terminal", "cmd", "powershell", "hardisk", "hard disk", "folder saya", "file saya", "komputer saya", "laptop saya", "daftar file", "cek file", "isi desktop", "isi folder", "buka terminal", "jalankan perintah", "eksekusi", "direktori"];
      const isDesktopLocalRequest = ctx.policy.canUseDesktopTools && desktopLocalKeywords.some(kw => ctx.request.lowerMsg.includes(kw));

      if (isDesktopLocalRequest) {
        isChatBiasa = true;
        ctx.state.processingSteps.push('🖥️ Intent Router: Tugas lokal Desktop terdeteksi → Mamet langsung menangani (bypass Sub-Agent)');
        console.log("Intent Router: Desktop local request detected. Forcing CHAT_BIASA to let main LLM handle via <terminal> tags.");
      } else {
      const actionKeywords = [
        "jadwal", "cron", "otomatis", "remind", "ingatkan",
        "cari", "temukan", "search", "google", "internet", "web",
        "siapa", "mengapa", "bagaimana", "kapan", "dimana", "apakah",
        "berita", "motogp", "cuaca", "saham", "info", "terkini", "terbaru", "prediksi",
        "kurs", "harga", "nilai", "hitung", "matematika", "jumlah",
        "kode", "coding", "program", "javascript", "python", "html", "css", "buatkan", "tuliskan",
        "excel", "pdf", "file", "dokumen", "baca", "ringkas", "rangkum",
        "youtube", "yt", "video", "transkrip", "link", "url", "http",
        "slack", "discord", "telegram", "api", "webhook", "post", "send", "kirim",
        "login", "masuk", "sign in", "scrape", "credential", "username", "password", "sesi",
        "workspace", "folder", "analisis file", "periksa file", "scan folder", "baca file", "isi folder", "struktur folder", "LOCAL FOLDER CONTENT",
        "ingat", "ingatlah", "catat", "nama saya", "panggil saya", "saya suka", "favorit saya", "saya alergi", "kebiasaan saya", "informasi penting",
        "debat", "rapat", "diskusikan", "direksi", "ceo", "cfo", "cto", "board of directors", "keputusan bisnis",
        "shopee", "affiliate", "afiliate", "promosi", "produk", "jual", "komisi"
      ];
      const containsActionKeyword = actionKeywords.some(kw => ctx.request.lowerMsg.includes(kw));

      if (containsActionKeyword) {
        isChatBiasa = false;
        ctx.state.processingSteps.push('🎯 Intent Router: Mendeteksi kata kunci aksi → Butuh Sub-Agent');
        console.log("Intent Router: Mendeteksi kata kunci aksi. Bypass LLM check -> BUTUH_AGENT");
      } else {
        try {
          ctx.state.processingSteps.push('🧠 Intent Router: Mengklasifikasi jenis permintaan...');
          const intentCheckPrompt = `Analisis apakah input user berikut membutuhkan pencarian internet (web search), kunjungan website, analisis mendalam, penulisan/eksekusi kode, pemanggilan API, atau pembuatan jadwal/cron.
Pesan user: "${ctx.request.finalMessage}"

Kriteria:
- Jawab "CHAT_BIASA" jika pesan HANYA berupa sapaan (halo, pagi), obrolan santai (apa kabar, kamu siapa), ucapan terima kasih, atau pernyataan/pertanyaan umum yang bisa dijawab tanpa info luar/terkini/koding.
- Jawab "BUTUH_AGENT" jika pesan memerlukan informasi terkini, pencarian Google, pengerjaan kode, atau otomatisasi/cron.

Jawab HANYA dengan satu kata: "CHAT_BIASA" atau "BUTUH_AGENT".`;
          const intentResult = await runCoordinatorLLM(intentCheckPrompt, "Anda adalah router intent super ringan. Jawab HANYA satu kata.", true, rctx);
          if (intentResult.toUpperCase().includes("CHAT_BIASA")) {
             isChatBiasa = true;
             ctx.state.processingSteps.push('💬 Keputusan: Obrolan biasa → Jawab langsung tanpa sub-agent');
             console.log("Intent Router: Ini chat biasa. Bypass logika Sub-Agent untuk menghemat waktu dan kuota.");
          } else {
             ctx.state.processingSteps.push('⚡ Keputusan: Butuh aksi → Mempersiapkan sub-agent...');
          }
        } catch (err) {
          console.warn("Intent router error, mengabaikan intent check:", err);
        }
      }
      } // close desktopLocalRequest else

      if (isChatBiasa) {
        ctx.state.processingSteps.push('✍️ Menghubungi Model AI untuk menjawab langsung...');
        
        // --- MEMORY MANAGER (BACKGROUND SAVE) ---
        // Kita hanya mengambil 'message' murni (tanpa embel-embel dokumen 50rb karakter) agar token Groq tidak meledak
        // --- [REMOVED] MEMORY MANAGER DUPLICATE CALL ---

        if (stream && !extractedImage) {
          const streamRes = getStreamResponse(ctx.request.finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps }, rctx);
          if (streamRes) return streamRes;
        }
        replyMessage = await runLLM(ctx.request.finalMessage, fullSystemContext, history, rctx);
        
        // --- PHASE 3B: SOURCE TRACE EXTRACTION LAYER ---
        const extractSourceTrace = (msg: string): { replyWithoutTrace: string; sourceTrace?: string } => {
          const lines = msg.split('\n');
          const formatRegex = /[A-Z]{2,3}-\d{4}/;
          const keywordRegex = /^(?:\W|_)*(?:source\s*trace|sources?|referensi)\b/i;
          
          const scanLimit = Math.max(0, lines.length - 15);
          let headerIndex = -1;
          let firstIdIndex = -1;
          
          for (let i = scanLimit; i < lines.length; i++) {
             const line = lines[i].trim();
             if (headerIndex === -1 && keywordRegex.test(line)) headerIndex = i;
             if (firstIdIndex === -1 && formatRegex.test(line)) firstIdIndex = i;
          }
          
          let startIndex = -1;
          if (headerIndex !== -1) {
             let hasId = false;
             for (let i = headerIndex; i < lines.length; i++) {
                if (formatRegex.test(lines[i])) { hasId = true; break; }
             }
             if (hasId) startIndex = headerIndex;
             else if (firstIdIndex !== -1) startIndex = firstIdIndex;
          } else if (firstIdIndex !== -1) {
             startIndex = firstIdIndex;
          }
          
          if (startIndex !== -1) {
             return {
                replyWithoutTrace: lines.slice(0, startIndex).join('\n').trim(),
                sourceTrace: lines.slice(startIndex).join('\n').trim()
             };
          }
          
          return { replyWithoutTrace: msg, sourceTrace: undefined };
        };

        const { replyWithoutTrace, sourceTrace } = extractSourceTrace(replyMessage);

        // --- PHASE 3: VERIFICATION ENGINE SKELETON ---
        const vContext = {
          responseText: replyWithoutTrace,
          sourceTrace: sourceTrace,
          confidenceReport: confidenceReport,
          evidenceReport: evidenceReport,
          runtimeContext: ctx.state
        };
        const vReport = VerificationEngine.verify(vContext);
        
        console.log(`========================\nVERIFICATION DECISION\nDecision : ${vReport.decision}\nStatus   : ${vReport.status}\nScore    : ${vReport.score}\n========================`);
        logVerificationReport(vReport);

        // TASK 015 & 016: Audit Object & Logger
        const auditRecord = VerificationEngine.createAuditRecord(vReport, vContext);
        logVerificationAudit(auditRecord);

        // TASK 019: Verification Audit Persistence
        safeFireAndTrack('VerificationAuditLog', (async () => {
          try {
            const supClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
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
              user_id: ctx.auth.userId || null
            }]);
          } catch (auditErr) {
            console.error('[VERIFICATION_AUDIT_LOG_FAIL]', auditErr);
          }
        })());

        // TASK 018: Hard Response Gate
        switch (vReport.decision) {
          case "PASS":
            console.log("[HARD GATE] PASSED. Membuka blokir respons.");
            break;
          case "FAIL":
            console.warn(`[HARD GATE] BLOCKED. Keputusan verifikasi gagal (Skor: ${vReport.score}).`);
            return new Response(JSON.stringify({ message: "Verification Failed" }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
        // ---------------------------------------------
        
      } else {
        let coordinatorSystemPrompt = `Tugas Anda adalah menganalisis permintaan user dan memilih sub-agent yang tepat.
Anda memiliki tim Sub-Agent nyata berikut ini:
${getPluginPromptList(tools)}

PENTING:
1. Anda adalah mesin parsing JSON. Anda DILARANG KERAS merespons dengan kalimat atau teks biasa. Anda WAJIB mengembalikan HANYA sebuah Array JSON murni. Jika tidak butuh sub-agent, kembalikan [].
2. Jika user menanyakan informasi aktual, fakta terbaru, berita, pertandingan olahraga (seperti MotoGP 2026), cuaca, harga saham, atau info di luar batas pengetahuan internal Anda (akhir 2024), Anda WAJIB memanggil sub-agent "researcher" atau "deep_research". JANGAN gunakan sub-agent "logika" untuk menjawab pertanyaan fakta/aktual!
3. Jika user meminta penjadwalan, tugas berulang, atau otomatisasi, Anda WAJIB memanggil sub-agent "cron_manager". DILARANG MENGARANG JADWAL SENDIRI.
4. JIKA pertanyaan user adalah tentang data spesifik (nama orang, lokasi, jumlah, isi laporan) yang kemungkinan besar ada di Pangkalan Data RAG/Dokumen internal user, kembalikan []. Sistem RAG beroperasi otomatis di jalur terpisah. JANGAN panggil "researcher" (Pencarian Web) untuk mencari dokumen personal!
5. RULE KETAT KNOWLEDGE WORKSPACE (MACRO VS MICRO QUERY):
- MACRO QUERY: Jika user meminta "ringkas", "rangkum", "pola", "tren", "insight", "kesimpulan", "seluruh workspace", "semua dokumen", atau "isi workspace", Anda WAJIB memanggil "knowledge_manager" dengan instruksi yang tepat (GET_WORKSPACE_SUMMARY atau LIST_DOCUMENTS).
- MICRO QUERY: Jika user mencari data spesifik ("cari", "siapa", "berapa", "kapan", "detail", "informasi tentang") di dalam workspace, Anda WAJIB MENGEMBALIKAN []. Sistem RAG Micro (Vector Search) akan otomatis berjalan di jalur terpisah. JANGAN panggil knowledge_manager untuk Micro Query.
- LOKAL FOLDER: JIKA prompt mengandung kata "folder", "directory", "desktop", atau "hardisk" DAN TIDAK MENGANDUNG kata "workspace", MAKA "file_analyzer" WAJIB menjadi kandidat utama (atau balas [] pada Mode Desktop).
Contoh Output Wajib: [{"subagent": "researcher", "task": "Cari pemenang MotoGP Italia Mugello 2026"}]`;
        
        coordinatorSystemPrompt += guardianPromptDirective;

        if (desktopOSMode) {
          coordinatorSystemPrompt += `\nCATATAN DESKTOP MODE: Jika user meminta eksekusi di komputer lokalnya (Cek Desktop, Eksekusi Terminal CMD, Cari File Hardisk), MAKA ITU ADALAH "CHAT_BIASA", JANGAN panggil sub-agent! Karena Anda (Mamet) sudah bisa melakukannya sendiri secara native menggunakan tag <terminal> atau <search_disk>. Berikan output [] jika itu masalah lokal.`;
        }

      let planText = '[]';
      let plan: any[] = [];
      try {
        ctx.state.processingSteps.push('🤖 Kepala Agent (Coordinator): Merencanakan strategi...');
        planText = await runCoordinatorLLM(`Permintaan User: "${ctx.request.finalMessage}"`, coordinatorSystemPrompt, false, rctx);
        planText = planText.replace(/```json/g, '').replace(/```/g, '').trim();
        plan = JSON.parse(planText);
        if (plan.length > 0) {
          ctx.state.processingSteps.push(`📋 Rencana: ${plan.length} sub-agent akan ditugaskan → ${plan.map((p: any) => p.subagent).join(', ')}`);
        } else {
          ctx.state.processingSteps.push('📋 Coordinator memutuskan tidak ada sub-agent yang diperlukan');
        }
      } catch (err) {
        console.error("Mamet Healer: Mendeteksi format JSON rusak. Memperbaiki...");
        // --- MAMET HEALER (DOKTER BEDAH LOGIKA) ---
        const jsonMatch = planText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            plan = JSON.parse(jsonMatch[0].replace(/,\s*]/g, ']'));
            console.log("Mamet Healer: Berhasil memperbaiki JSON!");
          } catch(e) {
            console.error("Mamet Healer: Gagal memperbaiki JSON, sub-agent dibatalkan.");
            plan = [];
          }
        }
      }

      // --- MAMET HEALER: Fallback Layer (Downgraded Priority) ---
      // Jika LLM (Coordinator) memberikan object tunggal (halusinasi struktur), bungkus ke dalam Array
      if (plan && !Array.isArray(plan) && typeof plan === 'object') {
          console.warn("[Mamet Healer] Coordinator returned an object instead of array. Coercing to Array.");
          plan = [plan];
      }

      if (Array.isArray(plan)) {
        plan = plan.map(p => {
          if (p && typeof p.task !== 'string') {
            p.task = typeof p.task === 'object' ? JSON.stringify(p.task) : String(p.task || "");
          }
          if (p && !p.subagent) {
             console.warn(`[Mamet Healer] Missing subagent key detected in LLM output. Forcing to "UNKNOWN".`);
             p.subagent = 'UNKNOWN';
          }
          return p;
        });
      }

      // 🧱 STEP 1: EXECUTION CONTRACT LAYER (LIGHT VERSION)
      contractValidation = { step: "VALIDATION", status: "OK", reason_code: "PASSED", normalized_plan: plan };
      
      if (!Array.isArray(plan)) {
          contractValidation = { step: "VALIDATION", status: "REJECTED", reason_code: "SCHEMA_VIOLATION: Root is not an array", normalized_plan: [] };
      } else {
          for (const p of plan) {
              if (!p || typeof p !== 'object' || !p.subagent || !p.task || p.subagent === 'UNKNOWN' || p.subagent.trim() === '') {
                  contractValidation = { step: "VALIDATION", status: "REJECTED", reason_code: `SCHEMA_VIOLATION: Missing or invalid subagent/task fields`, normalized_plan: [] };
                  console.warn(`[Execution Contract] REJECTED: ${contractValidation.reason_code}. Object: ${JSON.stringify(p)}`);
                  break;
              }
          }
      }

      if (contractValidation.status === "REJECTED") {
          plan = []; // Block execution pipeline
          ctx.state.processingSteps.push(`❌ [Execution Contract] Skema ditolak: ${contractValidation.reason_code}`);
      } else {
          console.log(`[Execution Contract] VALIDATED OK. Starting execution loop.`);
      }

      let accumulatedContext = `Permintaan awal user: "${ctx.request.finalMessage}"\n\n`;

      if (plan && plan.length > 0) {
        // --- PHASE 4: DEPENDENCY-AWARE EXECUTION GRAPH BUILDER ---
        const INDEPENDENT_PLUGINS = new Set(['scraper', 'researcher', 'deep_research', 'youtube_analyst', 'file_analyzer', 'shopee_ninja', 'memory_manager', 'cron_manager']);
        const executionTiers: any[][] = [];
        let currentTier: any[] = [];
        const seenTasks = new Set();
        
        for (let i = 0; i < plan.length; i++) {
          if (i >= 5) {
            console.log("Mamet Healer: Membatasi maksimal 5 tugas (Budget Limit).");
            break;
          }
          
          const p = plan[i];
          const taskSignature = p.subagent + ":" + (p.task || "").substring(0, 30);
          
          if (seenTasks.has(taskSignature)) continue;
          seenTasks.add(taskSignature);
          
          if (INDEPENDENT_PLUGINS.has(p.subagent)) {
              // Independent plugins can be batched together for safe parallel execution
              currentTier.push(p);
          } else {
              // Dependent plugins flush the current batch, and run sequentially in their own tier
              if (currentTier.length > 0) {
                  executionTiers.push([...currentTier]);
                  currentTier = [];
              }
              executionTiers.push([p]);
          }
        }
        if (currentTier.length > 0) executionTiers.push(currentTier);

        // --- PHASE 4: CONTROLLED ORCHESTRATION & BUDGET ENFORCEMENT ---
        const GLOBAL_TIMEOUT_MS = 24000; // 24s total execution budget
        const PER_PLUGIN_TIMEOUT_MS = 12000;
        const orchestrationStartTime = Date.now();

        ctx.state.processingSteps.push(`🧠 Orchestrator: Membangun graph dengan ${executionTiers.length} tier eksekusi.`);

        for (let tierIdx = 0; tierIdx < executionTiers.length; tierIdx++) {
            const tierTasks = executionTiers[tierIdx];
            
            // Check Global Budget
            if (Date.now() - orchestrationStartTime > GLOBAL_TIMEOUT_MS) {
                console.warn(`[BUDGET_ENFORCER] Global Orchestration Budget Exceeded! Sisa tugas dibatalkan.`);
                ctx.state.processingSteps.push(`⚠️ Eksekusi dibatalkan karena melebihi total waktu budget (24s).`);
                break;
            }

            // Run Tier in Parallel safely
            const tierPromises = tierTasks.map(async (taskDef) => {
               const { subagent, task } = taskDef;
               let subagentResText = 'Gagal memproses.';
               let subagentSources: any[] = [];
               let subagentToolExec = null;
               
               const plugin = getPluginByName(subagent);
               if (!plugin) {
                   ctx.state.processingSteps.push(`⚠️ Sub-Agent "${subagent}" tidak ditemukan`);
                   return { subagent, task, subagentResText: `Sub-agent '${subagent}' tidak ditemukan di sistem plugin.`, subagentSources, subagentToolExec };
               }
               
               ctx.state.processingSteps.push(`🚀 Eksekusi [Tier ${tierIdx+1}]: Sub-Agent "${subagent}"`);
               
               const env = { 
                  GEMINI_API_KEY, GROQ_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, 
                  APIFY_API_TOKEN: Deno.env.get('APIFY_API_TOKEN') || '', allGeminiKeys: rctx.keys.allGemini 
               };
               const fullTask = `Tugas Spesifik Anda: ${task}\n\nPermintaan Asli User: "${ctx.request.finalMessage}"\n\nKonteks Tambahan (Hasil Tier Sebelumnya):\n${accumulatedContext}`;
               
               const customRunLLM = async (prompt: string, sys: string, hist: any[]) => {
                  const originalModel = model;
                  try {
                    if (subagent === 'coder' || subagent === 'debate') {
                       console.log(`🚥 Traffic Light: Sub-agent [${subagent}] dialihkan ke OpenRouter Gemini`);
                       model = 'openrouter-google-gemini-2.0-flash-exp';
                    } else if (subagent === 'scraper' || subagent === 'communicator' || subagent === 'youtube_analyst' || subagent === 'file_analyzer') {
                       console.log(`🚥 Traffic Light: Sub-agent [${subagent}] dialihkan ke GROQ`);
                       model = 'groq-llama-3.1';
                    } else {
                       console.log(`🚥 Traffic Light: Sub-agent [${subagent}] menggunakan GEMINI`);
                       model = 'gemini-2.0-flash';
                    }
                    return await runLLM(prompt, sys, hist, rctx);
                  } finally { model = originalModel; }
               };

               // --- MAMET HEALER (PHASE 3 ISOLATION + PHASE 4 BUDGET) ---
               const startTime = Date.now();
               let lifecycleState = 'CREATED';
               const abortController = new AbortController();
               const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(7)}`;

               try {
                  lifecycleState = 'RUNNING';
                  
                  // Phase 5: TRUE EXECUTION CANCELLATION LAYER
                  // Memberikan 'propagate execution hook' ke plugin agar auto-abort bekerja
                  const controlledFetch = (input: RequestInfo | URL, init?: RequestInit) => {
                      return fetch(input, { ...init, signal: init?.signal || abortController.signal });
                  };
                  
                  const executeContext = { 
                      task: fullTask, cleanTask: task, accumulatedContext, 
                      env: { ...env, signal: abortController.signal, fetch: controlledFetch }, 
                      runLLM: customRunLLM, userId: ctx.auth.userId, signal: abortController.signal 
                  };

                  const isolatedExecutionPromise = (async () => {
                     try {
                         const rawResult = await plugin.execute(executeContext);
                         if (lifecycleState !== 'RUNNING') {
                             console.warn(`[GATING_LAYER] Execution ${executionId} (${subagent}) late. Result DISCARDED.`);
                             return null; 
                         }
                         lifecycleState = 'COMPLETED';
                         return rawResult;
                     } catch (err) {
                         if (lifecycleState !== 'RUNNING') return null;
                         throw err;
                     }
                  })();

                  const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => {
                        if (lifecycleState === 'RUNNING') {
                            lifecycleState = 'ORPHANED';
                            abortController.abort(new Error('TIMEOUT_ABORT'));
                            reject(new Error('HARD_TIMEOUT_REACHED'));
                        }
                    }, PER_PLUGIN_TIMEOUT_MS);
                  });
                  
                  const result = await Promise.race([isolatedExecutionPromise, timeoutPromise]) as any;
                  
                  if (lifecycleState !== 'COMPLETED') throw new Error('GATING_VALIDATION_FAILED');
                  
                  subagentResText = result?.output || '';
                  subagentSources = result?.sources || [];
                  subagentToolExec = result?.toolExecution || null;
                  
                  const durationMs = Date.now() - startTime;
                  const outputPreview = (subagentResText || '').substring(0, 80).replace(/\n/g, ' ');
                  ctx.state.processingSteps.push(`✅ [Tier ${tierIdx+1}] "${subagent}" selesai (${durationMs}ms)${subagentSources.length > 0 ? ` → ${subagentSources.length} sumber referensi` : ''} → "${outputPreview}..."`);
               } catch (err: any) {
                  const durationMs = Date.now() - startTime;
                  const status = err.message === 'HARD_TIMEOUT_REACHED' ? 'timeout' : 'fail';
                  
                  subagentToolExec = { status: lifecycleState, safe_fallback: true, error_classification: status === 'timeout' ? "TIMEOUT_GATED" : "EXECUTION_ERROR" };
                  
                  if (status === 'timeout') {
                    subagentResText = `[SISTEM DILINDUNGI OLEH MAMET HEALER]: Eksekusi sub-agent "${subagent}" dibatalkan permanen (Hard Timeout ${PER_PLUGIN_TIMEOUT_MS/1000}s).`;
                    ctx.state.processingSteps.push(`⏳ [Tier ${tierIdx+1}] "${subagent}" tereliminasi (Hard Timeout Gated)`);
                  } else {
                    subagentResText = `[SISTEM DILINDUNGI OLEH MAMET HEALER]: Eksekusi sub-agent gagal pada mode terisolasi (${err.message || 'Unknown'}).`;
                    ctx.state.processingSteps.push(`❌ [Tier ${tierIdx+1}] "${subagent}" gagal terisolasi: ${err.message || 'Unknown'}`);
                  }
               }
               return { subagent, task, subagentResText, subagentSources, subagentToolExec };
            });

            // Tunggu semua tugas di tier ini selesai (Partial Result Aggregation)
            const tierResults = await Promise.allSettled(tierPromises);

            // Akumulasi hasil untuk Tier berikutnya
            for (const outcome of tierResults) {
                if (outcome.status === 'fulfilled') {
                    const res = outcome.value;
                    const safeSubagent = String(res.subagent || "UNKNOWN");
                    subagentRuns.push({ subagent: safeSubagent, task: res.task, output: res.subagentResText, sources: res.subagentSources, toolExecution: res.subagentToolExec });
                    accumulatedContext += `--- Hasil Sub-Agent [${safeSubagent.toUpperCase()}]: ---\nTugas: ${res.task}\nOutput: ${res.subagentResText}\n\n`;
                }
            }
            
            // Penundaan ringan antar Tier untuk Rate Limit LLM
            if (tierIdx < executionTiers.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        const synthesisPrompt = `Anda telah menugaskan beberapa sub-agent.${fullSystemContext}\n\nPermintaan Awal User: "${ctx.request.finalMessage}"\n\nRiwayat pekerjaan sub-agent:\n${accumulatedContext}\n\nJAWABLAH pesan/pertanyaan user dengan ramah dan natural berdasarkan informasi dari sub-agent di atas. \n\nPENTING: \n- JANGAN gunakan format kaku seperti "Laporan Hasil Kerja". Bersikaplah seperti manusia biasa (asisten yang ramah bernama Mamet).\n- Langsung berikan jawaban, sapaan balik, atau solusi tanpa perlu panjang lebar menjelaskan proses sub-agent (kecuali user secara spesifik bertanya tentang prosesnya).\n- Jika pada riwayat pekerjaan sub-agent terdapat bagian "Gambar Terkait" (dalam format Markdown ![Gambar](url)), Anda WAJIB menyertakan gambar-gambar tersebut di bagian paling akhir jawaban Anda untuk memberikan visualisasi kepada user.\n- Jika Sub-Agent mengembalikan pesan ERROR atau GAGAL, sampaikan kepada user dengan sopan bahwa tugas tersebut gagal. Jangan pernah mengarang data palsu!\n- Gunakan format Tabel Markdown HANYA jika menyajikan data terstruktur, statistik, harga, atau perbandingan.\n- DILARANG KERAS menggunakan blok \`\`\`mermaid\`\`\` KECUALI user secara tertulis meminta "buatkan diagram" atau "gambarkan flowchart". Jika user tidak meminta diagram, JANGAN pernah memakainya!`;
        
        ctx.state.processingSteps.push('📝 Merangkum dan menyintesis jawaban akhir...');
        
        // --- MEMORY MANAGER (BACKGROUND SAVE) ---
        const ENABLE_ASYNC_MEMORY_WRITE = Deno.env.get('ENABLE_ASYNC_MEMORY_WRITE') !== 'false';
        if (ENABLE_ASYNC_MEMORY_WRITE) {
            const supUrl = Deno.env.get('SUPABASE_URL') || '';
            const supKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
            if (ctx.policy.canWriteMemory) await safeFireAndTrack('MemoryWriteQueue_A', processMemoryWriteQueue(ctx.auth.userId, ctx.request.finalMessage, supUrl, supKey));
        }

        if (stream && !extractedImage) {
          const streamRes = getStreamResponse(synthesisPrompt, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps, auditMode, routingDecision, contractValidation }, rctx);
          if (streamRes) return streamRes;
        }
        replyMessage = await runLLM(synthesisPrompt, fullSystemContext, history, rctx);
      } else {
        if (stream && !extractedImage) {
          const streamRes = getStreamResponse(ctx.request.finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps, auditMode, routingDecision, contractValidation }, rctx);
          if (streamRes) return streamRes;
        }
        replyMessage = await runLLM(ctx.request.finalMessage, fullSystemContext, history, rctx);
      }
      }
    } else {
      // --- MEMORY MANAGER (BACKGROUND SAVE - DIRECT RESPONSE) ---
      const ENABLE_ASYNC_MEMORY_WRITE = Deno.env.get('ENABLE_ASYNC_MEMORY_WRITE') !== 'false';
      if (ENABLE_ASYNC_MEMORY_WRITE) {
          const supUrl = Deno.env.get('SUPABASE_URL') || '';
          const supKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
          if (ctx.policy.canWriteMemory) await safeFireAndTrack('MemoryWriteQueue_B', processMemoryWriteQueue(ctx.auth.userId, ctx.request.finalMessage, supUrl, supKey));
      }

      if (stream && !extractedImage) {
        ctx.state.processingSteps.push('✍️ Menjawab langsung (tanpa tools)...');
        const streamRes = getStreamResponse(ctx.request.finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps, auditMode, routingDecision, contractValidation }, rctx);
        if (streamRes) return streamRes;
      }
      replyMessage = await runLLM(ctx.request.finalMessage, fullSystemContext, history, rctx);
    }

    // Phase 5: Guarantee async delivery before sending JSON response
    if (pendingBackgroundTasks.length > 0) {
       await Promise.allSettled(pendingBackgroundTasks);
    }

    const aiResponse = {
      message: replyMessage,
      toolsUsed: tools,
      groundingSources,
      toolExecution,
      subagentRuns,
      processingSteps: ctx.state.processingSteps,
      timestamp: new Date(),
      userId: ctx.auth.userId
    };

    return new Response(JSON.stringify(aiResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
