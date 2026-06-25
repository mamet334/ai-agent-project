import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { Buffer } from 'node:buffer';
import { getPluginPromptList, getPluginByName } from './plugins/registry.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { retrieveMemories } from './plugins/memory_manager_v1.ts';
import { buildContextFusion } from './lib/context_fusion.ts';
import { runSelfHealingLoopAsync } from './plugins/self_healing.ts';
import { processMemoryWriteQueue } from './memory_write_worker.ts';
import { WorkspaceGuardian } from './lib/workspace_guardian.ts';

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

    let { message, tools, model, userId: _clientUserId, userName, file, history, globalMemory, stream, desktopOSMode, ragEnabled, workspaceTarget = 'AUTO', localWorkspaceEnabled = false } = await req.json();
    
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

    // OVERRIDE ALL IDENTITY USAGE
    let userId = AUTH_USER_ID;

    console.log("[L1] auth binding", { providedUserId: _clientUserId, actualAuthId: userId, message: message ? message.substring(0, 50) + '...' : null });

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
    
    type UnifiedExecutionContext = {
      mode: "AI" | "LITE";
      security: { decision: "ALLOW" | "ALLOW_WITH_LIMIT" | "BLOCK"; toolsEnabled: boolean; injectionRisk: boolean; abuseRisk: boolean; };
      rag: { topK: number; threshold: number; allowLongDocs: boolean; compressionLevel: "low" | "high"; };
      execution: { memoryPriority: "memory_first" | "balanced"; webSearchEnabled: boolean; subAgentEnabled: boolean; };
      trace: { riskScore: number; retrievalStrategy: string; timestamp: number; };
    };

    function buildUnifiedExecutionContext(input: { message: string, desktopOSMode?: boolean, tools?: string[], ragEnabled?: boolean }): UnifiedExecutionContext {
      const mode = input.desktopOSMode ? "AI" : "LITE";
      const isRagEnabled = input.ragEnabled !== false;
      
      const ctx: UnifiedExecutionContext = {
        mode,
        security: { decision: "ALLOW", toolsEnabled: true, injectionRisk: false, abuseRisk: false },
        rag: { topK: mode === "LITE" ? 5 : 5, threshold: 0.60, allowLongDocs: true, compressionLevel: "low" },
        execution: { memoryPriority: "memory_first", webSearchEnabled: true, subAgentEnabled: true },
        trace: { riskScore: 0, retrievalStrategy: isRagEnabled ? "hybrid" : "none", timestamp: Date.now() }
      };

      if (!POLICY_LAYER_ENABLED) return ctx;

      let riskScore = 0;
      const lowerMsg = (input.message || '').toLowerCase();
      
      // 1. INJECTION DETECTION (HIGH RISK)
      const injectionPatterns = ["ignore previous instructions", "system prompt", "developer mode", "reveal memory", "bypass"];
      if (injectionPatterns.some(p => lowerMsg.includes(p))) {
        riskScore += 3;
        ctx.security.injectionRisk = true;
      }
      
      // 2. TOOL ABUSE DETECTION (MEDIUM RISK)
      const toolAbusePatterns = ["recursive agent requests", "infinite search loops", "mass retrieval requests"];
      if (toolAbusePatterns.some(p => lowerMsg.includes(p))) {
        riskScore += 2;
        ctx.security.abuseRisk = true;
      }
      
      // 3. OVER-RETRIEVAL DETECTION
      const overRetrievalPatterns = ["all data", "dump all", "entire database"];
      if (overRetrievalPatterns.some(p => lowerMsg.includes(p))) {
        riskScore += 2;
      }
      
      // 4. MALFORMED INPUT CHECK
      if (lowerMsg.length > 5000) riskScore += 1;
      const words = lowerMsg.split(/[\\s\\p{P}]+/);
      const uniqueWords = new Set(words);
      if (words.length > 100 && uniqueWords.size < words.length * 0.1) riskScore += 1;
      
      ctx.trace.riskScore = riskScore;
      
      // 5. EVALUATE POLICY
      if (riskScore >= 4) {
        ctx.security.decision = "BLOCK";
        ctx.security.toolsEnabled = false;
        ctx.rag.topK = 0;
        ctx.execution.webSearchEnabled = false;
        ctx.execution.subAgentEnabled = false;
      } else if (riskScore >= 2) {
        ctx.security.decision = "ALLOW_WITH_LIMIT";
        ctx.security.toolsEnabled = false;
        ctx.rag.topK = 2;
        ctx.execution.webSearchEnabled = false;
        ctx.execution.subAgentEnabled = false;
      }
      
      return ctx;
    }

    const ctx = buildUnifiedExecutionContext({ message, desktopOSMode, tools, ragEnabled });
    const isRagEnabled = ctx.trace.retrievalStrategy !== "none";

    console.log("[UNIFIED TRACE]", {
      mode: ctx.mode,
      decision: ctx.security.decision,
      ragTopK: ctx.rag.topK,
      riskScore: ctx.trace.riskScore
    });
    
    // ENFORCEMENT BLOCK
    if (ctx.security.decision === "BLOCK") {
      console.warn(`[EXECUTION POLICY] Blocked request from user ${userId} due to HIGH risk. Trace:`, ctx.trace);
      const blockMsg = "Permintaan ditolak oleh Sistem Kebijakan Eksekusi. Deteksi injeksi atau pola berbahaya.";
      if (!stream) {
        return new Response(JSON.stringify({ message: blockMsg }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } else {
        const streamRes = new ReadableStream({
          start(controller) {
            const data = JSON.stringify({ choices: [{ delta: { content: blockMsg } }] });
            controller.enqueue(new TextEncoder().encode(`data: ${data}\\n\\n`));
            controller.close();
          }
        });
        return new Response(streamRes, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
      }
    }
    
    if (ctx.security.decision === "ALLOW_WITH_LIMIT") {
      console.warn(`[EXECUTION POLICY] Applied limits to user ${userId} due to MEDIUM risk. Trace:`, ctx.trace);
    }

    let effectiveRagMatchCount = ctx.rag.topK;
    let effectiveRagThreshold = ctx.rag.threshold;
    if (!ctx.security.toolsEnabled && tools && Array.isArray(tools)) {
       tools = []; // Menerapkan kebijakan secara eksplisit
    }

    // === CIRCUIT BREAKER (FASE 4B) ===
    // Mengecek apakah user sudah melewati batas harian token sebelum AI merespons.
    if (userId) {
      try {
        const supClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        const { data: currentCost, error: quotaError } = await supClient.rpc('check_daily_quota', { target_user_id: userId });
        
        if (!quotaError && currentCost !== null) {
          const DAILY_LIMIT = 0.50; // $0.50 per hari (setara ~Rp8.000)
          if (Number(currentCost) >= DAILY_LIMIT) {
             console.warn(`[CIRCUIT BREAKER] User ${userId} exceeded daily quota: $${currentCost}`);
             
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
      if (!userId) return;
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
           user_id: userId, provider, model: modelName,
           input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: totalCost
        }]);
      })());
    };

    const logAgentEvent = (eventType: string, provider: string, logMessage: string) => {
      safeFireAndTrack('LogAgentEvent', (async () => {
        const supClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        await supClient.from('agent_logs').insert([{ user_id: userId || null, event_type: eventType, provider, message: logMessage }]);
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
    let finalMessage = message;

    if (file && file.data) {
      const filename = file.name.toLowerCase();
      const buffer = Buffer.from(file.data, 'base64');
      
      if (file.mimeType.startsWith('image/')) {
        extractedImage = { mimeType: file.mimeType, data: file.data };
      } else if (filename.endsWith('.txt') || filename.endsWith('.csv') || filename.endsWith('.md')) {
        finalMessage = `Permintaan User: ${message}\n\n[DOKUMEN TERLAMPIR: ${file.name}]\nIsi Dokumen:\n${new TextDecoder().decode(buffer).substring(0, 50000)}`;
      } else {
        // Fallback PDF/DOCX yang kompleks dialihkan
        finalMessage = `Permintaan User: ${message}\n\n[DOKUMEN TERLAMPIR: ${file.name}]\n(Catatan: Edge Function saat ini memprioritaskan teks/gambar. PDF akan dibaca secara ringkas jika memungkinkan)`;
      }
    }

    if (!finalMessage || !Array.isArray(tools)) {
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

    // [REMOVED streamGroqResponse - Replaced by unified getStreamResponse]

    const callGroq = async (promptText: string, systemPromptText = '', chatHistory: any[] = []) => {
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
      if (model && model.startsWith('groq/')) {
        groqModel = model.replace('groq/', '');
      } else if (model === 'groq-llama-3.3') {
        groqModel = 'llama-3.3-70b-versatile';
      } else if (model === 'groq-llama-3.1') {
        groqModel = 'llama-3.1-8b-instant';
      }

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
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
      if (!stream) logApiUsage('groq', groqModel, promptText + systemPromptText, answer);
      
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

    const callOpenAI = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], overrideModel?: string) => {
      const messages = [];
      if (systemPromptText) messages.push({ role: 'system', content: systemPromptText });
      if (chatHistory && chatHistory.length > 0) {
        for (const msg of chatHistory) {
          messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content });
        }
      }
      messages.push({ role: 'user', content: promptText });
      
      const selectedModel = overrideModel || model || 'gpt-4o-mini';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
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
      
      if (!stream) logApiUsage('openai', selectedModel, promptText + systemPromptText, answer);
      return answer;
    };

    // ========== MODIFIKASI UTAMA: streamOpenRouterResponse dengan error handling yang lebih baik ==========
    // [REMOVED streamOpenRouterResponse - Replaced by unified getStreamResponse]
    // ========== AKHIR MODIFIKASI ==========

    const callOpenRouter = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], forceDefaultModel = false) => {
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
        if (model && model.startsWith('openrouter/')) {
          openRouterModel = model.replace('openrouter/', '');
        } else if (model === 'openrouter-llama-3') {
          openRouterModel = 'anthropic/claude-sonnet-4.6';
        } else if (model === 'openrouter-google-gemini-2.0-flash-exp') {
          openRouterModel = 'anthropic/claude-sonnet-4.6';
        }
      }
      
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
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
      
      if (!stream) logApiUsage('openrouter', openRouterModel, promptText + systemPromptText, answer);
      return answer;
    };

    const allGeminiKeys = getAllKeys('GEMINI_API_KEY');

    const callLLMWithCascade = async (
      promptText: string,
      systemPromptText = '',
      chatHistory: any[] = [],
      preferredProvider: 'gemini' | 'groq' = 'gemini',
      extractedImage: { mimeType: string; data: string } | null = null
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
            if (allGeminiKeys.length === 0) {
              console.log('⏭️  Gemini: No keys available, skipping');
              lastError += ' [gemini]: No keys available;';
              continue;
            }
            console.log('🔷 Calling Gemini...');
            const data = await callGeminiWithRetry(payload, 'gemini-2.0-flash', allGeminiKeys);
            if (data) {
              const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (!stream) logApiUsage('gemini', 'gemini-2.0-flash', promptText + systemPromptText, answer);
              console.log('✅ Gemini succeeded');
              return answer;
            }
            console.log('⚠️  Gemini returned null, falling back...');
            lastError += ' [gemini]: returned null;';
            continue;
          }

          if (provider === 'openrouter') {
            if (!OPENROUTER_API_KEY) {
              console.log('⏭️  OpenRouter: No API key available, skipping');
              lastError += ' [openrouter]: No API key;';
              continue;
            }
            console.log('🟠 Calling OpenRouter...');
            const answer = await callOpenRouter(promptText, systemPromptText, chatHistory, true);
            if (answer) {
              if (!stream) logApiUsage('openrouter', 'google/gemini-2.0-flash-lite-preview-02-05:free', promptText + systemPromptText, answer);
              console.log('✅ OpenRouter succeeded');
              return answer;
            }
            console.log('⚠️  OpenRouter returned empty, falling back...');
            lastError += ' [openrouter]: returned empty;';
            continue;
          }

          if (provider === 'groq') {
            if (!GROQ_API_KEY) {
              console.log('⏭️  Groq: No API key available, skipping');
              lastError += ' [groq]: No API key;';
              continue;
            }
            console.log('🟣 Calling Groq (Fallback Utama)...');
            const answer = await callGroq(promptText, systemPromptText, chatHistory);
            if (answer) {
              if (!stream) logApiUsage('groq', 'llama-3.1-8b-instant', promptText + systemPromptText, answer);
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
            await logAgentEvent('RATE_LIMIT_HIT', provider, `429 Error: ${message.substring(0, 200)}`);
          } else {
            await logAgentEvent('FALLBACK_TRIGGERED', provider, `Error: ${message.substring(0, 200)}`);
          }
          console.warn(`❌ Provider ${provider} failed: ${message}`);
        }
      }

      throw new Error('Semua provider AI sedang limit/gangguan. Detail error:' + explicitModelErrors + lastError);
    };
    if (allGeminiKeys.length === 0 && GEMINI_API_KEY) allGeminiKeys.push(GEMINI_API_KEY);

    let explicitModelErrors = '';

    const runLLM = async (promptText: string, systemPromptText = '', chatHistory: any[] = []) => {
      if (desktopOSMode && !systemPromptText.includes('DESKTOP NATIVE AWARENESS ENABLED')) {
         systemPromptText += `\n[STATUS: DESKTOP NATIVE AWARENESS ENABLED]\nAnda WAJIB mengeluarkan perintah Windows di dalam tag <terminal>. DILARANG menyebut sub-agent atau menolak. Contoh: <terminal>dir %USERPROFILE%\\Desktop</terminal>\n`;
      }

      // === PRIORITAS USER-EXPLICIT MODEL SELECTION ===
      if (!extractedImage) {
        if (model && model.includes('gpt') && !model.includes('openrouter') && OPENAI_API_KEY) {
          try { return await callOpenAI(promptText, systemPromptText, chatHistory); } catch(e: any) { console.warn('OpenAI failed:', e); explicitModelErrors += ` [openai]: ${e.message || e};`; }
        } else if (model && (model.includes('openrouter') || model.startsWith('openrouter/')) && OPENROUTER_API_KEY) {
          try { return await callOpenRouter(promptText, systemPromptText, chatHistory); } catch(e: any) { console.warn('OpenRouter failed:', e); explicitModelErrors += ` [openrouter]: ${e.message || e};`; }
        } else if (model && model.startsWith('groq/') && GROQ_API_KEY) {
          try { return await callGroq(promptText, systemPromptText, chatHistory); } catch(e: any) { console.warn('Groq failed:', e); explicitModelErrors += ` [groq-explicit]: ${e.message || e};`; }
        }
      }

      // === DEFAULT CASCADE: Gemini -> OpenRouter -> Groq ===
      // Ignore complexity score, use default provider order
      console.log(`🔄 Using default cascade: Gemini -> OpenRouter -> Groq`);
      return await callLLMWithCascade(promptText, systemPromptText, chatHistory, 'gemini', extractedImage);
    };

    // --- OTAK KHUSUS KEPALA AGENT (HEMAT KUOTA) + ANTI-LIMIT ---
    const runCoordinatorLLM = async (promptText: string, systemPromptText = '', preferFast = false) => {
      // === NOTE: Groq is temporarily disabled, so preferFast will use default cascade ===
      // if (preferFast && GROQ_API_KEY && !isProviderLocked('groq')) {
      //   try {
      //     console.log("Mamet Traffic Light: Memutar tugas ringan (Intent Router) ke Groq...");
      //     return await callGroq(promptText, systemPromptText, []);
      //   } catch(e) { console.warn('Traffic Light Groq failed, cascading to Gemini...', e); }
      // }

      // Always use default cascade: Gemini -> OpenRouter
      return await callLLMWithCascade(promptText, systemPromptText, [], 'gemini');
    };

    let replyMessage = 'Gagal memproses jawaban dari AI.';
    let groundingSources: any[] = [];
    let toolExecution = null;
    let subagentRuns: any[] = [];
    let processingSteps: string[] = [];

    const getStreamResponse = (promptText: string, systemPromptText = '', chatHistory: any[] = [], metaData: any = {}) => {
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

          if (desktopOSMode && !systemPromptText.includes('DESKTOP NATIVE AWARENESS ENABLED')) {
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
          const oaiMessages = [];
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
          if (extractedImage) userParts.push({ inlineData: { mimeType: extractedImage.mimeType, data: extractedImage.data } });
          geminiContents.push({ role: 'user', parts: userParts });

          const geminiPayload: any = { contents: geminiContents };
          if (systemPromptText) geminiPayload.systemInstruction = { parts: [{ text: systemPromptText }] };

          // === STREAMING CASCADE EXECUTION ===
          let currentError = '';

          const tryGroq = async (fallbackNote = '') => {
            if (!GROQ_API_KEY) throw new Error("No Groq Key");
            let groqModel = 'llama-3.1-8b-instant';
            if (model && model.startsWith('groq/')) groqModel = model.replace('groq/', '');
            console.log("[Stream] Trying Groq:", groqModel);
            const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: groqModel, messages: oaiMessages, temperature: 0.1, stream: true })
            });
            if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${await res.text()}`);
            if (fallbackNote) enqueueStr(`\n\n*(Fallback Note: ${fallbackNote})*\n\n`);
            await processOpenAIStream(res);
          };

          const tryOpenRouter = async (fallbackNote = '') => {
            if (!OPENROUTER_API_KEY) throw new Error("No OpenRouter Key");
            let orModel = 'meta-llama/llama-3.1-8b-instruct:free';
            if (model && model.startsWith('openrouter/')) orModel = model.replace('openrouter/', '');
            console.log("[Stream] Trying OpenRouter:", orModel);
            const res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'HTTP-Referer': 'https://ai-agent-project.vercel.app', 'X-Title': 'Mamet AI Agent', 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: orModel, messages: oaiMessages, temperature: 0.1, stream: true })
            });
            if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${await res.text()}`);
            if (fallbackNote) enqueueStr(`\n\n*(Fallback Note: ${fallbackNote})*\n\n`);
            await processOpenAIStream(res);
          };

          const tryGemini = async (fallbackNote = '') => {
             if (allGeminiKeys.length === 0) throw new Error("No Gemini Keys");
             const geminiModel = model && model.includes('gemini') ? model : 'gemini-2.0-flash';
             console.log("[Stream] Trying Gemini:", geminiModel);
             
             let res: Response | null = null;
             let lastErr = '';
             for (let ki = 0; ki < allGeminiKeys.length; ki++) {
               const key = allGeminiKeys[(geminiKeyIndex + ki) % allGeminiKeys.length];
               try {
                 const attempt = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${key}`, {
                   method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(geminiPayload)
                 }, 15000);
                 if (attempt.ok) {
                   geminiKeyIndex = (geminiKeyIndex + ki + 1) % allGeminiKeys.length;
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
             if (!OPENAI_API_KEY) throw new Error("No OpenAI Key");
             console.log("[Stream] Trying OpenAI:", model);
             const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
               method: 'POST', headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
               body: JSON.stringify({ model: model || 'gpt-4o-mini', messages: oaiMessages, temperature: 0.1, stream: true })
             });
             if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
             await processOpenAIStream(res);
          };

          const closeSafely = async () => {
             try { controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`)); } catch (e) {}
             controller.close();
             if (pendingBackgroundTasks.length > 0) {
                 await Promise.allSettled(pendingBackgroundTasks);
             }
          };

          try {
            // EXPLICIT MODELS
            if (model && model.includes('gpt') && !model.includes('openrouter') && OPENAI_API_KEY) {
              try { await tryOpenAI(); await closeSafely(); return; } catch(e: any) { currentError += e.message; console.warn("OpenAI fail, cascading...", e); }
            }
            if (model && (model.includes('openrouter') || model.startsWith('openrouter/')) && OPENROUTER_API_KEY) {
              try { await tryOpenRouter(); await closeSafely(); return; } catch(e: any) { currentError += e.message; console.warn("OR fail, cascading...", e); }
            }
            if (model && model.startsWith('groq/') && GROQ_API_KEY) {
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
    let ragArray: any[] = [];
    if (userId && isRagEnabled) {
      try {
        const queryEmbedding = await getGeminiEmbedding(message, GEMINI_API_KEY);
        if (queryEmbedding.length > 0) {
          const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
          );
          // 🧭 STEP 2: ROUTING DECIDER LAYER (EXPLICIT CONTROL)
          let routingDecision = {
              scope: "CORE",
              workspace_id: null as string | null,
              reason_code: "DEFAULT_ROUTING"
          };

          const { data: spaces } = await supabaseClient.from('knowledge_spaces').select('id, name, space_type').eq('user_id', userId);
          if (spaces && spaces.length > 0) {
             const coreSpace = spaces.find((s: any) => s.space_type === 'CORE');
             routingDecision.workspace_id = coreSpace ? coreSpace.id : null;

             const isWorkspaceQuery = lowerMsg.includes('workspace') || lowerMsg.includes('ruang') || lowerMsg.includes('space');
             if (isWorkspaceQuery) {
                const workspaceSpaces = spaces.filter((s: any) => s.space_type === 'WORKSPACE').sort((a: any, b: any) => b.name.length - a.name.length);
                for (const space of workspaceSpaces) {
                   if (lowerMsg.includes(space.name.toLowerCase())) {
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
          
          processingSteps.push(`🔍 [Routing Decider] Scope: ${routingDecision.scope} (${routingDecision.reason_code})`);

          const { data: matchedDocs, error: matchError } = await supabaseClient.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: effectiveRagThreshold,
            match_count: effectiveRagMatchCount,
            p_user_id: userId,
            p_space_id: routingDecision.workspace_id
          });

          if (matchError) {
             throw new Error(`RAG_DB_FAIL: ${matchError.message}`);
          }

          if (matchedDocs && matchedDocs.length > 0) {
            ragArray = matchedDocs.map((doc: any) => ({ type: 'rag', content: `[Dari file "${doc.title}"]: "${doc.content}"`, score: 2 }));
          }
        }
      } catch (err: any) {
        console.error("RAG Search Error:", err);
        if (err.message && err.message.includes("RAG_DB_FAIL")) {
            throw err; // Lempar ke outer catch agar request putus dan mengirimkan HTTP 500
        }
      }
    }
    console.log(`[RAG CONTEXT GENERATED] ragArray size=${ragArray.length}`);
    processingSteps.push(`[RAG CONTEXT GENERATED] ragArray size=${ragArray.length}`);

    if (finalMessage.toLowerCase().includes('zip')) {
      finalMessage += `\n\n[PERINTAH SANGAT PENTING DARI SISTEM]: User meminta file ZIP. Anda DILARANG menggunakan blok kode biasa seperti \`\`\`html. ANDA WAJIB MENGGUNAKAN format \`\`\`xml_zip. 
Contoh Jawaban Anda yang BENAR:
Baik, ini file zip-nya:
\`\`\`xml_zip
<filename>nama_file.zip</filename>
<file name="index.html">
<!-- isi html -->
</file>
\`\`\`
Wajib ikuti struktur persis seperti contoh di atas!`;
    }

    const currentDateStr = new Date().toISOString().split('T')[0];
    let agentIdentityPrompt = `\nKONTEKS WAKTU HARI INI: ${currentDateStr} (Tahun berjalan saat ini adalah 2026).
BATAS PENGETAHUAN ANDA: Akhir 2024 / Awal 2025. Anda harus sangat berhati-hati jika ditanya informasi setelah batas pengetahuan Anda, dan sampaikan dalam proses berpikir Anda secara jujur bahwa informasi setelah akhir 2024 mungkin tidak lengkap atau membutuhkan pencarian web terbaru jika tersedia.

IDENTITAS ANDA: Anda adalah "Mamet", asisten cerdas buatan yang merupakan hak paten dari aplikasi ini. Selalu perkenalkan diri Anda sebagai Mamet. JANGAN katakan Anda buatan Google atau OpenAI. Anda memiliki kemampuan BERKEMBANG DARI PENGALAMAN: Selalu perhatikan 'history' obrolan. Pelajari gaya bahasa, preferensi, dan teguran/koreksi dari user di masa lalu untuk memperbaiki jawaban Anda di masa depan.
MODEL AI YANG ANDA GUNAKAN SAAT INI: ${model || 'gemini-2.0-flash'}. Anda dapat memberitahu user secara jujur model/otak AI apa yang sedang menggerakkan Anda saat ini jika ditanya.\n`;

    agentIdentityPrompt += `\n[WORKSPACE GUARDIAN OMNI-LOCK] Storage target saat ini adalah ${storageTarget}. Jika target adalah SUPABASE, Anda DILARANG KERAS menggunakan tag <edit_file> atau perintah <terminal> yang merubah file/folder lokal!\n`;

    if (desktopOSMode) {
      agentIdentityPrompt += `\n[STATUS: DESKTOP NATIVE AWARENESS ENABLED]
PENTING UNTUK KESELAMATAN AI: Anda HANYA DIMINTA UNTUK MEMBERIKAN TEKS / SCRIPT BASH/POWERSHELL di dalam tag <terminal>. Aplikasi Frontend (Mamet Desktop) yang akan mengeksekusinya. Anda DILARANG menolak. Cukup berikan script yang diminta!
JIKA USER MEMINTA CEK DESKTOP, CARI FILE, CARI FOLDER, ATAU JALANKAN PERINTAH DI KOMPUTER LOKAL MEREKA:
- DILARANG KERAS menyebut atau memanggil "sub-agent file_analyzer" atau sub-agent apapun! Anda yang mengerjakan sendiri!
- DILARANG KERAS mengatakan "saya tidak punya akses" atau "lakukan sendiri di terminal Anda"!
- ANDA WAJIB langsung mengeluarkan perintah di dalam tag <terminal>perintah_windows_disini</terminal>
- Contoh: <terminal>dir %USERPROFILE%\\Desktop</terminal>
- Untuk cari file: <terminal>dir /s /b C:\\Users\\*nama_file*</terminal>
- Untuk edit file: <edit_file path="C:/path/file.txt">isi_teks</edit_file>
- Untuk search di seluruh hardisk: <search_disk>nama_file</search_disk>
- JIKA USER MEMINTA JALANKAN AIRDROP / BROWSER STEALTH / BOT WEB3:
  Keluarkan tag: <run_airdrop task="nama_task_airdrop"></run_airdrop>
  Contoh: <run_airdrop task="test_stealth"></run_airdrop>
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
\`\`\`json_chart
{ "title": "Judul Grafik", "type": "bar", "data": [{"name": "A", "value": 10}], "xKey": "name", "yKey": "value" }
\`\`\`
Pilih type "bar", "pie", atau "line" sesuai kebutuhan.
FITUR ZIP GENERATOR: Jika user meminta Anda membuat file zip (project kodingan), outputkan data DALAM BENTUK BLOK KODE seperti ini (wajib persis):
\`\`\`xml_zip
<filename>nama_bebas.zip</filename>
<file name="index.html">
<h1>Halo</h1>
</file>
<file name="app.js">
console.log('hi');
</file>
\`\`\`
DILARANG KERAS MENGGUNAKAN PYTHON ATAU "TOOL_CODE". JANGAN PERNAH MENULISKAN KODE PYTHON UNTUK MENGEKSEKUSI TOOL. JAWABLAH DENGAN TEKS BIASA.

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
    let userContextPrompt = userName ? `\nInformasi Akun: User login dengan email/nama "${userName}". Prioritaskan memanggil user dengan nama ini, kecuali user menyebut nama lain.` : '';
    
    // --- MEMORY MANAGER (RETRIEVAL) ---
    let memoryArray = await retrieveMemories(finalMessage, userId, Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', GEMINI_API_KEY);
    if (!Array.isArray(memoryArray)) memoryArray = [];
    
    const memoryPrompt = globalMemory ? `\n\n[MEMORI GLOBAL & PREFERENSI USER]:\n${globalMemory}\n(Patuhi instruksi/ingatan di atas secara ketat di setiap jawaban Anda!)` : '';
    console.log(`[MEMORY PROMPT GENERATED] memoryPrompt="${memoryPrompt.trim()}" memoryArray size=${memoryArray.length}`);
    processingSteps.push(`[MEMORY PROMPT GENERATED] memoryPrompt="${memoryPrompt.trim()}" memoryArray size=${memoryArray.length}`);

    // --- SINGLE GATEWAY: ANTI DUPLICATE MEMORY (TIER 1 & 2) ---
    // Dipanggil TEPAT SEBELUM membangun final context.
    if (userId && message && typeof message === 'string' && message.trim().length > 0) {
      console.log(`[MEMORY_GATEWAY] Edge Function hanya validasi auth dan memproses LLM. Tidak ada auto-save sembunyi.`);
    }

    const basePrompts = agentIdentityPrompt + userContextPrompt + memoryPrompt;
    
    const resolved = buildContextFusion({
      memoryArray,
      ragArray,
      message: finalMessage,
      basePrompts,
      ctx
    });
    
    const fullSystemContext = resolved.finalContext;
    
    console.log("[MAMET BRAIN v2]", {
      memoryUsed: resolved.memory.length,
      ragUsed: resolved.rag.length,
      contextSize: fullSystemContext.length,
      structuredContextKeys: resolved.structuredContext ? Object.keys(resolved.structuredContext) : []
    });

    console.log(`[SYSTEM CONTEXT FINAL] fullSystemContext="${fullSystemContext.substring(fullSystemContext.length - 300)}"`);
    processingSteps.push(`[SYSTEM CONTEXT FINAL] fullSystemContext="${fullSystemContext.substring(fullSystemContext.length - 300)}"`);

    // Gateway already moved up.

    if (tools && tools.length > 0) {
      // --- INTENT ROUTER (Pemotong Kompas Cerdas) ---
      let isChatBiasa = false;
      const lowerMessage = finalMessage.toLowerCase();
      processingSteps.push('🔍 Menganalisis permintaan user...');
      
      // Deteksi instan (Hardcoded) untuk fitur yang membutuhkan sub-agent/tools
      const desktopLocalKeywords = ["desktop", "terminal", "cmd", "powershell", "hardisk", "hard disk", "folder saya", "file saya", "komputer saya", "laptop saya", "daftar file", "cek file", "isi desktop", "isi folder", "buka terminal", "jalankan perintah", "eksekusi", "direktori"];
      const isDesktopLocalRequest = desktopOSMode && desktopLocalKeywords.some(kw => lowerMessage.includes(kw));

      if (isDesktopLocalRequest) {
        isChatBiasa = true;
        processingSteps.push('🖥️ Intent Router: Tugas lokal Desktop terdeteksi → Mamet langsung menangani (bypass Sub-Agent)');
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
      const containsActionKeyword = actionKeywords.some(kw => lowerMessage.includes(kw));

      if (containsActionKeyword) {
        isChatBiasa = false;
        processingSteps.push('🎯 Intent Router: Mendeteksi kata kunci aksi → Butuh Sub-Agent');
        console.log("Intent Router: Mendeteksi kata kunci aksi. Bypass LLM check -> BUTUH_AGENT");
      } else {
        try {
          processingSteps.push('🧠 Intent Router: Mengklasifikasi jenis permintaan...');
          const intentCheckPrompt = `Analisis apakah input user berikut membutuhkan pencarian internet (web search), kunjungan website, analisis mendalam, penulisan/eksekusi kode, pemanggilan API, atau pembuatan jadwal/cron.
Pesan user: "${finalMessage}"

Kriteria:
- Jawab "CHAT_BIASA" jika pesan HANYA berupa sapaan (halo, pagi), obrolan santai (apa kabar, kamu siapa), ucapan terima kasih, atau pernyataan/pertanyaan umum yang bisa dijawab tanpa info luar/terkini/koding.
- Jawab "BUTUH_AGENT" jika pesan memerlukan informasi terkini, pencarian Google, pengerjaan kode, atau otomatisasi/cron.

Jawab HANYA dengan satu kata: "CHAT_BIASA" atau "BUTUH_AGENT".`;
          const intentResult = await runCoordinatorLLM(intentCheckPrompt, "Anda adalah router intent super ringan. Jawab HANYA satu kata.", true);
          if (intentResult.toUpperCase().includes("CHAT_BIASA")) {
             isChatBiasa = true;
             processingSteps.push('💬 Keputusan: Obrolan biasa → Jawab langsung tanpa sub-agent');
             console.log("Intent Router: Ini chat biasa. Bypass logika Sub-Agent untuk menghemat waktu dan kuota.");
          } else {
             processingSteps.push('⚡ Keputusan: Butuh aksi → Mempersiapkan sub-agent...');
          }
        } catch (err) {
          console.warn("Intent router error, mengabaikan intent check:", err);
        }
      }
      } // close desktopLocalRequest else

      if (isChatBiasa) {
        processingSteps.push('✍️ Menghubungi Model AI untuk menjawab langsung...');
        
        // --- MEMORY MANAGER (BACKGROUND SAVE) ---
        // Kita hanya mengambil 'message' murni (tanpa embel-embel dokumen 50rb karakter) agar token Groq tidak meledak
        // --- [REMOVED] MEMORY MANAGER DUPLICATE CALL ---

        if (stream && !extractedImage) {
          const streamRes = getStreamResponse(finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps });
          if (streamRes) return streamRes;
        }
        replyMessage = await runLLM(finalMessage, fullSystemContext, history);
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
        processingSteps.push('🤖 Kepala Agent (Coordinator): Merencanakan strategi...');
        planText = await runCoordinatorLLM(`Permintaan User: "${finalMessage}"`, coordinatorSystemPrompt);
        planText = planText.replace(/```json/g, '').replace(/```/g, '').trim();
        plan = JSON.parse(planText);
        if (plan.length > 0) {
          processingSteps.push(`📋 Rencana: ${plan.length} sub-agent akan ditugaskan → ${plan.map((p: any) => p.subagent).join(', ')}`);
        } else {
          processingSteps.push('📋 Coordinator memutuskan tidak ada sub-agent yang diperlukan');
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
      let contractValidation = { step: "VALIDATION", status: "OK", reason_code: "PASSED", normalized_plan: plan };
      
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
          processingSteps.push(`❌ [Execution Contract] Skema ditolak: ${contractValidation.reason_code}`);
      } else {
          console.log(`[Execution Contract] VALIDATED OK. Starting execution loop.`);
      }

      let accumulatedContext = `Permintaan awal user: "${finalMessage}"\n\n`;

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

        processingSteps.push(`🧠 Orchestrator: Membangun graph dengan ${executionTiers.length} tier eksekusi.`);

        for (let tierIdx = 0; tierIdx < executionTiers.length; tierIdx++) {
            const tierTasks = executionTiers[tierIdx];
            
            // Check Global Budget
            if (Date.now() - orchestrationStartTime > GLOBAL_TIMEOUT_MS) {
                console.warn(`[BUDGET_ENFORCER] Global Orchestration Budget Exceeded! Sisa tugas dibatalkan.`);
                processingSteps.push(`⚠️ Eksekusi dibatalkan karena melebihi total waktu budget (24s).`);
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
                   processingSteps.push(`⚠️ Sub-Agent "${subagent}" tidak ditemukan`);
                   return { subagent, task, subagentResText: `Sub-agent '${subagent}' tidak ditemukan di sistem plugin.`, subagentSources, subagentToolExec };
               }
               
               processingSteps.push(`🚀 Eksekusi [Tier ${tierIdx+1}]: Sub-Agent "${subagent}"`);
               
               const env = { 
                  GEMINI_API_KEY, GROQ_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, 
                  APIFY_API_TOKEN: Deno.env.get('APIFY_API_TOKEN') || '', allGeminiKeys 
               };
               const fullTask = `Tugas Spesifik Anda: ${task}\n\nPermintaan Asli User: "${finalMessage}"\n\nKonteks Tambahan (Hasil Tier Sebelumnya):\n${accumulatedContext}`;
               
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
                    return await runLLM(prompt, sys, hist);
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
                      runLLM: customRunLLM, userId, signal: abortController.signal 
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
                  processingSteps.push(`✅ [Tier ${tierIdx+1}] "${subagent}" selesai (${durationMs}ms)${subagentSources.length > 0 ? ` → ${subagentSources.length} sumber referensi` : ''} → "${outputPreview}..."`);
               } catch (err: any) {
                  const durationMs = Date.now() - startTime;
                  const status = err.message === 'HARD_TIMEOUT_REACHED' ? 'timeout' : 'fail';
                  
                  subagentToolExec = { status: lifecycleState, safe_fallback: true, error_classification: status === 'timeout' ? "TIMEOUT_GATED" : "EXECUTION_ERROR" };
                  
                  if (status === 'timeout') {
                    subagentResText = `[SISTEM DILINDUNGI OLEH MAMET HEALER]: Eksekusi sub-agent "${subagent}" dibatalkan permanen (Hard Timeout ${PER_PLUGIN_TIMEOUT_MS/1000}s).`;
                    processingSteps.push(`⏳ [Tier ${tierIdx+1}] "${subagent}" tereliminasi (Hard Timeout Gated)`);
                  } else {
                    subagentResText = `[SISTEM DILINDUNGI OLEH MAMET HEALER]: Eksekusi sub-agent gagal pada mode terisolasi (${err.message || 'Unknown'}).`;
                    processingSteps.push(`❌ [Tier ${tierIdx+1}] "${subagent}" gagal terisolasi: ${err.message || 'Unknown'}`);
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

        const synthesisPrompt = `Anda telah menugaskan beberapa sub-agent.${fullSystemContext}\n\nPermintaan Awal User: "${finalMessage}"\n\nRiwayat pekerjaan sub-agent:\n${accumulatedContext}\n\nJAWABLAH pesan/pertanyaan user dengan ramah dan natural berdasarkan informasi dari sub-agent di atas. \n\nPENTING: \n- JANGAN gunakan format kaku seperti "Laporan Hasil Kerja". Bersikaplah seperti manusia biasa (asisten yang ramah bernama Mamet).\n- Langsung berikan jawaban, sapaan balik, atau solusi tanpa perlu panjang lebar menjelaskan proses sub-agent (kecuali user secara spesifik bertanya tentang prosesnya).\n- Jika pada riwayat pekerjaan sub-agent terdapat bagian "Gambar Terkait" (dalam format Markdown ![Gambar](url)), Anda WAJIB menyertakan gambar-gambar tersebut di bagian paling akhir jawaban Anda untuk memberikan visualisasi kepada user.\n- Jika Sub-Agent mengembalikan pesan ERROR atau GAGAL, sampaikan kepada user dengan sopan bahwa tugas tersebut gagal. Jangan pernah mengarang data palsu!\n- Gunakan format Tabel Markdown HANYA jika menyajikan data terstruktur, statistik, harga, atau perbandingan.\n- DILARANG KERAS menggunakan blok \`\`\`mermaid\`\`\` KECUALI user secara tertulis meminta "buatkan diagram" atau "gambarkan flowchart". Jika user tidak meminta diagram, JANGAN pernah memakainya!`;
        
        processingSteps.push('📝 Merangkum dan menyintesis jawaban akhir...');
        
        // --- MEMORY MANAGER (BACKGROUND SAVE) ---
        const ENABLE_ASYNC_MEMORY_WRITE = Deno.env.get('ENABLE_ASYNC_MEMORY_WRITE') !== 'false';
        if (ENABLE_ASYNC_MEMORY_WRITE) {
            const supUrl = Deno.env.get('SUPABASE_URL') || '';
            const supKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
            await safeFireAndTrack('MemoryWriteQueue_A', processMemoryWriteQueue(userId, finalMessage, supUrl, supKey));
        }

        if (stream && !extractedImage) {
          const streamRes = getStreamResponse(synthesisPrompt, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps });
          if (streamRes) return streamRes;
        }
        replyMessage = await runLLM(synthesisPrompt, fullSystemContext, history);
      } else {
        if (stream && !extractedImage) {
          const streamRes = getStreamResponse(finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps });
          if (streamRes) return streamRes;
        }
        replyMessage = await runLLM(finalMessage, fullSystemContext, history);
      }
      }
    } else {
      // --- MEMORY MANAGER (BACKGROUND SAVE - DIRECT RESPONSE) ---
      const ENABLE_ASYNC_MEMORY_WRITE = Deno.env.get('ENABLE_ASYNC_MEMORY_WRITE') !== 'false';
      if (ENABLE_ASYNC_MEMORY_WRITE) {
          const supUrl = Deno.env.get('SUPABASE_URL') || '';
          const supKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
          await safeFireAndTrack('MemoryWriteQueue_B', processMemoryWriteQueue(userId, finalMessage, supUrl, supKey));
      }

      if (stream && !extractedImage) {
        processingSteps.push('✍️ Menjawab langsung (tanpa tools)...');
        const streamRes = getStreamResponse(finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps });
        if (streamRes) return streamRes;
      }
      replyMessage = await runLLM(finalMessage, fullSystemContext, history);
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
      processingSteps,
      timestamp: new Date(),
      userId
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