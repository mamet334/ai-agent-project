import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { Buffer } from 'node:buffer';
import { getPluginPromptList, getPluginByName } from './plugins/registry.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { executeRagPipeline } from './lib/rag/rag_pipeline.ts';
import { runSelfHealingLoopAsync } from './plugins/self_healing.ts';
import { processMemoryWriteQueue } from './memory_write_worker.ts';
import { WorkspaceGuardian } from './lib/workspace_guardian.ts';
import { validateEvidence, buildBlockedResponse } from './lib/evidence_validator.ts';
import { PolicyEngine } from './lib/policy_engine.ts';
import { calculateConfidence } from './lib/confidence_engine.ts';
import { buildUniversalContract } from './lib/universal_evidence_contract.ts';
import { VerificationEngine, logVerificationReport, logVerificationAudit } from './lib/verification_engine.ts';
import { RuntimeContext, createBackgroundTaskTracker, createRuntimeLogger } from './lib/runtime_context.ts';
import { callGroq, callOpenAI, callOpenRouter } from './lib/provider_manager.ts';
import {
  geminiKeyIndex, setGeminiKeyIndex,
  groqKeyIndex, setGroqKeyIndex,
  openaiKeyIndex, setOpenaiKeyIndex,
  openrouterKeyIndex, setOpenrouterKeyIndex,
  clearAllCooldowns, runLLM, runCoordinatorLLM
} from './lib/llm_orchestrator.ts';
import { getStreamResponse, corsHeaders } from './lib/stream_handler.ts';





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


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const runtimeEnv = {
    supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
    supabaseServiceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    supabaseAnonKey: Deno.env.get('SUPABASE_ANON_KEY') || '',
    apifyApiToken: Deno.env.get('APIFY_API_TOKEN') || '',
    enableAsyncMemoryWrite: Deno.env.get('ENABLE_ASYNC_MEMORY_WRITE') !== 'false'
  };

  const bypassCooldown = req.headers.get('x-bypass-cooldown') === 'true';
  if (bypassCooldown) {
    clearAllCooldowns();
    console.log("🔓 Cooldowns cleared via x-bypass-cooldown header!");
  }

  if (req.method === 'GET') {
    try {
      const supClient = createClient(runtimeEnv.supabaseUrl, runtimeEnv.supabaseServiceKey);
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
    const backgroundTasks = createBackgroundTaskTracker();

    // === AUTH BINDING LAYER (HARDENING) ===
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    
    if (!token) {
        return new Response(JSON.stringify({ error: "Unauthorized: Missing token" }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const authSupabase = createClient(
      runtimeEnv.supabaseUrl,
      runtimeEnv.supabaseAnonKey
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
        const supClient = createClient(runtimeEnv.supabaseUrl, runtimeEnv.supabaseServiceKey);
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

    const GEMINI_API_KEY = (byokGemini || getActiveKey('GEMINI_API_KEY', geminiKeyIndex, setGeminiKeyIndex) || '').trim();
    const GROQ_API_KEY = (byokGroq || getActiveKey('GROQ_API_KEY', groqKeyIndex, setGroqKeyIndex) || '').trim();
    const OPENAI_API_KEY = (byokOpenAI || getActiveKey('OPENAI_API_KEY', openaiKeyIndex, setOpenaiKeyIndex) || '').trim();
    const OPENROUTER_API_KEY = (byokOpenRouter || getActiveKey('OPENROUTER_API_KEY', openrouterKeyIndex, setOpenrouterKeyIndex) || '').trim();

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
      policy: { canUseDesktopTools: ctx.policy.canUseDesktopTools },
      stream: { isStream: !!stream, extractedImage, desktopOSMode, auditMode },
      env: runtimeEnv,
      logger: createRuntimeLogger(ctx.auth.userId, backgroundTasks, !!stream, runtimeEnv),
      state: { explicitModelErrors: '' },
      tasks: backgroundTasks
    };
    if (rctx.keys.allGemini.length === 0 && rctx.keys.gemini) {
      rctx.keys.allGemini.push(rctx.keys.gemini);
    }

    // [REMOVED streamGroqResponse - Replaced by unified getStreamResponse]


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

    // ========== MODIFIKASI UTAMA: streamOpenRouterResponse dengan error handling yang lebih baik ==========
    // [REMOVED streamOpenRouterResponse - Replaced by unified getStreamResponse]
    // ========== AKHIR MODIFIKASI ==========

    // allGeminiKeys initialization was moved to rctx

    let replyMessage = 'Gagal memproses jawaban dari AI.';
    let groundingSources: any[] = [];
    let toolExecution = null;
    let subagentRuns: any[] = [];
    

    // --- RAG KNOWLEDGE BASE SEARCH ---
    // Dipindahkan ke bawah setelah agentIdentityPrompt dan userContextPrompt terbentuk, diatur melalui executeRagPipeline.

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
    
    // --- RAG PIPELINE (FACADE) ---
    const ragResult = await executeRagPipeline({
      userId: ctx.auth.userId,
      query: ctx.request.finalMessage,
      globalMemory,
      isRagEnabled,
      effectiveRagThreshold,
      effectiveRagMatchCount,
      canReadMemory: ctx.policy.canReadMemory,
      mode: ctx.policy.mode,
      ragTopK: ctx.policy.ragTopK,
      webHint: ctx.policy.webHint,
      agentIdentityPrompt,
      userContextPrompt
    }, rctx);

    ctx.state.ragArray = ragResult.ragArray;
    ctx.state.memoryArray = ragResult.memoryArray;
    ctx.state.processingSteps.push(...ragResult.metadata.processingSteps);
    if (ragResult.metadata.routingDecision) {
       routingDecision = ragResult.metadata.routingDecision;
    }

    // --- SINGLE GATEWAY: ANTI DUPLICATE MEMORY (TIER 1 & 2) ---
    // Dipanggil TEPAT SEBELUM membangun final context.
    if (ctx.auth.userId && ctx.request.finalMessage && typeof ctx.request.finalMessage === 'string' && ctx.request.finalMessage.trim().length > 0) {
      console.log(`[MEMORY_GATEWAY] Edge Function hanya validasi auth dan memproses LLM. Tidak ada auto-save sembunyi.`);
    }

    let brain1Ids = ragResult.engineerContext?.brain1Ids || [];
    let brain2Tasks = ragResult.engineerContext?.brain2Tasks || [];
    let brain2Gaps = ragResult.engineerContext?.brain2Gaps || [];
    let brain2Verifications = ragResult.engineerContext?.brain2Verifications || [];
    
    if (ctx.policy.mode === 'ENGINEER' && ragResult.engineerContext) {
        (ctx as any).brain1Entries = ragResult.engineerContext.brain1Entries;
    }

    let fullSystemContext = ragResult.finalContext;
    
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
    rctx.tasks.fire('EvidenceAuditLog', (async () => {
      try {
        const supClient = createClient(rctx.env.supabaseUrl, rctx.env.supabaseServiceKey);
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
        const supClient = createClient(rctx.env.supabaseUrl, rctx.env.supabaseServiceKey);
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
    const memoryContextText = ragResult.memoryArray?.length > 0 
      ? ragResult.memoryArray.map((m: any) => m.content).join('\n') : '';
    const ragContextText = ragResult.ragArray?.length > 0 
      ? ragResult.ragArray.map((r: any) => r.content).join('\n') : '';
    
    // Brain 1 context text build
    const brain1ContextText = brain1EntriesForConf.map((e: any) => `[${e.entry_type}] ${e.title}: ${e.content}`).join('\n');
    let brain2ContextText = '';
    if (brain2Tasks.length > 0) brain2ContextText += `Active Tasks: ${brain2Tasks.join(', ')}\n`;
    if (brain2Gaps.length > 0) brain2ContextText += `Architecture Gaps: ${brain2Gaps.join(', ')}\n`;
    if (brain2Verifications.length > 0) brain2ContextText += `Recent Verifications: ${brain2Verifications.join(', ')}\n`;

    // Gabung instruksi inti (Identity, Sub-Agents, Zip, Web Hint)
    let systemBasePrompt = agentIdentityPrompt + userContextPrompt + ragResult.memoryPrompt;
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
      memoryUsed: ragResult.memoryArray.length,
      ragUsed: ragResult.ragArray.length,
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
        rctx.tasks.fire('VerificationAuditLog', (async () => {
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
                  APIFY_API_TOKEN: rctx.env.apifyApiToken, allGeminiKeys: rctx.keys.allGemini 
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
        if (rctx.env.enableAsyncMemoryWrite) {
            const supUrl = rctx.env.supabaseUrl;
            const supKey = rctx.env.supabaseServiceKey;
            if (ctx.policy.canWriteMemory) await rctx.tasks.fire('MemoryWriteQueue_A', processMemoryWriteQueue(ctx.auth.userId, ctx.request.finalMessage, supUrl, supKey));
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
      if (rctx.env.enableAsyncMemoryWrite) {
          const supUrl = rctx.env.supabaseUrl;
          const supKey = rctx.env.supabaseServiceKey;
          if (ctx.policy.canWriteMemory) await rctx.tasks.fire('MemoryWriteQueue_B', processMemoryWriteQueue(ctx.auth.userId, ctx.request.finalMessage, supUrl, supKey));
      }

      if (stream && !extractedImage) {
        ctx.state.processingSteps.push('✍️ Menjawab langsung (tanpa tools)...');
        const streamRes = getStreamResponse(ctx.request.finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps, auditMode, routingDecision, contractValidation }, rctx);
        if (streamRes) return streamRes;
      }
      replyMessage = await runLLM(ctx.request.finalMessage, fullSystemContext, history, rctx);
    }

    // Phase 5: Guarantee async delivery before sending JSON response
    await rctx.tasks.awaitAll();

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
