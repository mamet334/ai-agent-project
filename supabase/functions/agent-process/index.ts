import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { Buffer } from 'node:buffer';
import { getPluginPromptList, getPluginByName } from './plugins/registry.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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
        if (res.status === 429) {
          seenRateLimit = true;
          console.warn(`Gemini key #${ki} got 429, trying next key...`);
          continue; // Try next key
        }
        // Other errors - try next key too
        console.warn(`Gemini key #${ki} error ${res.status}, trying next...`);
      } catch (e) {
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
  return null; // All retries failed
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

  try {
    let { message, tools, model, userId, userName, file, history, globalMemory, stream, desktopOSMode, ragEnabled } = await req.json();

    const isRagEnabled = ragEnabled !== false;

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
    const logApiUsage = async (provider: string, modelName: string, inputText: string, outputText: string) => {
      if (!userId) return;
      try {
        // Estimasi kasar: 1 token = 4 karakter
        const inputTokens = Math.ceil(inputText.length / 4);
        const outputTokens = Math.ceil(outputText.length / 4);
        
        // Asumsi biaya (Cost per 1k token)
        let costIn = 0.0001; let costOut = 0.0002; // Default (Gemini/DeepSeek)
        if (modelName.includes('gpt-4o')) { costIn = 0.005; costOut = 0.015; }
        else if (modelName.includes('llama')) { costIn = 0.00005; costOut = 0.00008; }

        const totalCost = ((inputTokens / 1000) * costIn) + ((outputTokens / 1000) * costOut);
        
        const supClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        await supClient.from('api_usage').insert([{ 
           user_id: userId, provider, model: modelName,
           input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: totalCost
        }]);
      } catch (e) { console.error("Logging token failed", e); }
    };

    const logAgentEvent = async (eventType: string, provider: string, logMessage: string) => {
      try {
        const supClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        await supClient.from('agent_logs').insert([{ user_id: userId || null, event_type: eventType, provider, message: logMessage }]);
      } catch (e) { console.error("Log error failed:", e); }
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

    const streamGroqResponse = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], metaData: any = {}, fallbackSource = '') => {
      const messages = [];
      if (systemPromptText) messages.push({ role: 'system', content: systemPromptText });
      if (chatHistory && chatHistory.length > 0) {
        for (const msg of chatHistory) {
          messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content });
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
          temperature: 0.1,
          stream: true
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Groq Stream Error:", errText);
        const fallbackNote = fallbackSource ? `\n\n*(Catatan Mamet Healer: Groq ikut meledak saat mencoba menjadi otak cadangan untuk ${fallbackSource} yang sebelumnya gagal.)*` : '';
        const stream = new ReadableStream({
          start(controller) {
            const data = JSON.stringify({ choices: [{ delta: { content: `\n\n**Groq API Error**: ${errText}${fallbackNote}` } }] });
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            controller.close();
          }
        });
        return new Response(stream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
      }

      const safeMeta = { ...metaData };
      if (safeMeta.subagentRuns) safeMeta.subagentRuns = safeMeta.subagentRuns.map((r: any) => ({ ...r, output: '[Omitted]' }));

      return new Response(res.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'X-Agent-Metadata': btoa(encodeURIComponent(JSON.stringify(safeMeta)))
        }
      });
    };

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

    const streamOpenAIResponse = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], metaData: any = {}) => {
      const messages = [];
      if (systemPromptText) messages.push({ role: 'system', content: systemPromptText });
      if (chatHistory && chatHistory.length > 0) {
        for (const msg of chatHistory) {
          messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content });
        }
      }
      messages.push({ role: 'user', content: promptText });
      
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: messages,
          temperature: 0.1,
          stream: true
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("OpenAI Stream Error:", errText);
        
        // --- MAMET HEALER (PENYEMBUH KOMA / AUTO-FALLBACK) ---
        if (GROQ_API_KEY) {
          console.log("Mamet Healer: Memutar rute ke Groq (Fallback)...");
          await logAgentEvent('FALLBACK_TRIGGERED', 'OpenAI', `Stream Error: ${errText.substring(0, 200)}`);
          return streamGroqResponse(promptText, systemPromptText + "\n\n(Catatan: Anda sedang menggunakan otak cadangan Groq karena OpenAI mengalami gangguan/limit)", chatHistory, metaData, 'OpenAI');
        }

        const stream = new ReadableStream({
          start(controller) {
            const data = JSON.stringify({ choices: [{ delta: { content: `\n\n**OpenAI API Error**: ${errText}` } }] });
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            controller.close();
          }
        });
        return new Response(stream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
      }

      const safeMeta = { ...metaData };
      if (safeMeta.subagentRuns) safeMeta.subagentRuns = safeMeta.subagentRuns.map((r: any) => ({ ...r, output: '[Omitted]' }));
      
      return new Response(res.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'X-Agent-Metadata': btoa(encodeURIComponent(JSON.stringify(safeMeta)))
        }
      });
    };

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
    const streamOpenRouterResponse = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], metaData: any = {}) => {
      try {
        // Validasi API key
        if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.trim() === '') {
          console.error("❌ OPENROUTER_API_KEY kosong atau tidak valid");
          throw new Error("OPENROUTER_API_KEY is missing");
        }

        const messages = [];
        if (systemPromptText) messages.push({ role: 'system', content: systemPromptText });
        if (chatHistory && chatHistory.length > 0) {
          for (const msg of chatHistory) {
            messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content });
          }
        }
        messages.push({ role: 'user', content: promptText });
        
        let openRouterModel = 'google/gemini-2.0-flash-exp:free';
        if (model && model.startsWith('openrouter/')) {
          openRouterModel = model.replace('openrouter/', '');
        } else if (model === 'openrouter-llama-3') {
          openRouterModel = 'meta-llama/llama-3.1-8b-instruct:free';
        } else if (model === 'openrouter-google-gemini-2.0-flash-exp') {
          openRouterModel = 'google/gemini-2.0-flash-exp:free';
        }
        
        console.log(`🔵 [OpenRouter] Memanggil model: ${openRouterModel}, Key: ${OPENROUTER_API_KEY.substring(0,6)}...`);
        
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
            temperature: 0.1,
            stream: true
          })
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error(`🔴 [OpenRouter] HTTP ${res.status}: ${errText}`);
          
          // Coba fallback ke Groq jika tersedia
          if (GROQ_API_KEY && GROQ_API_KEY.trim() !== '') {
            console.log("🟡 Mamet Healer: Fallback ke Groq...");
            await logAgentEvent('FALLBACK_TRIGGERED', 'OpenRouter', `HTTP ${res.status}: ${errText.substring(0, 200)}`);
            return streamGroqResponse(promptText, systemPromptText + "\n\n(Catatan: Fallback ke Groq karena OpenRouter error)", chatHistory, metaData, 'OpenRouter');
          }
          
          // Jika tidak ada fallback, kirim error sebagai stream
          const errorStream = new ReadableStream({
            start(controller) {
              const data = JSON.stringify({ choices: [{ delta: { content: `\n\n**OpenRouter Error (${res.status})**: ${errText.substring(0, 300)}` } }] });
              controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
              controller.close();
            }
          });
          return new Response(errorStream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
        }

        // Sukses
        const safeMeta = { ...metaData };
        if (safeMeta.subagentRuns) safeMeta.subagentRuns = safeMeta.subagentRuns.map((r: any) => ({ ...r, output: '[Omitted]' }));

        return new Response(res.body, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream',
            'X-Agent-Metadata': btoa(encodeURIComponent(JSON.stringify(safeMeta)))
          }
        });
        
      } catch (err: any) {
        console.error("💥 [OpenRouter] Exception fatal:", err.message, err.stack);
        
        // Fallback ke Groq jika tersedia
        if (GROQ_API_KEY && GROQ_API_KEY.trim() !== '') {
          console.log("🟡 Mamet Healer: Exception, fallback ke Groq...");
          return streamGroqResponse(promptText, systemPromptText + "\n\n(Catatan: Fallback ke Groq karena OpenRouter exception)", chatHistory, metaData, 'OpenRouter');
        }
        
        const errorStream = new ReadableStream({
          start(controller) {
            const data = JSON.stringify({ choices: [{ delta: { content: `\n\n**OpenRouter Fatal Error**: ${err.message}` } }] });
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            controller.close();
          }
        });
        return new Response(errorStream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
      }
    };
    // ========== AKHIR MODIFIKASI ==========

    const callOpenRouter = async (promptText: string, systemPromptText = '', chatHistory: any[] = []) => {
      const messages = [];
      if (systemPromptText) messages.push({ role: 'system', content: systemPromptText });
      if (chatHistory && chatHistory.length > 0) {
        for (const msg of chatHistory) {
          messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content });
        }
      }
      messages.push({ role: 'user', content: promptText });
      
      let openRouterModel = 'google/gemini-2.0-flash-exp:free';
      if (model && model.startsWith('openrouter/')) {
        openRouterModel = model.replace('openrouter/', '');
      } else if (model === 'openrouter-llama-3') {
        openRouterModel = 'meta-llama/llama-3.1-8b-instruct:free';
      } else if (model === 'openrouter-google-gemini-2.0-flash-exp') {
        openRouterModel = 'google/gemini-2.0-flash-exp:free';
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

      // === DEFAULT CASCADE ORDER: Gemini -> OpenRouter -> Groq ===
      // Only prioritize Groq if user explicitly requests it
      const cascadeOrder: Array<'gemini' | 'openrouter' | 'groq'> =
        preferredProvider === 'groq'
          ? ['groq', 'gemini', 'openrouter']
          : ['gemini', 'openrouter', 'groq'];

      const availableProviders = getAvailableProviders(cascadeOrder);
      console.log(`🎯 Cascade order: ${availableProviders.join(' -> ')} (locked: ${cascadeOrder.filter(p => isProviderLocked(p)).join(', ') || 'none'})`);

      const payload = buildPayload();
      for (const provider of availableProviders) {
        console.log(`📍 Trying provider: ${provider}`);
        
        try {
          if (provider === 'gemini') {
            if (allGeminiKeys.length === 0) {
              console.log('⏭️  Gemini: No keys available, skipping');
              continue;
            }
            console.log('🔷 Calling Gemini...');
            const data = await callGeminiWithRetry(payload, 'gemini-2.5-flash', allGeminiKeys);
            if (data) {
              const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (!stream) logApiUsage('gemini', 'gemini-2.5-flash', promptText + systemPromptText, answer);
              console.log('✅ Gemini succeeded');
              return answer;
            }
            console.log('⚠️  Gemini returned null, falling back...');
            continue;
          }

          if (provider === 'openrouter') {
            if (!OPENROUTER_API_KEY) {
              console.log('⏭️  OpenRouter: No API key available, skipping');
              continue;
            }
            console.log('🟠 Calling OpenRouter...');
            const answer = await callOpenRouter(promptText, systemPromptText, chatHistory);
            if (answer) {
              if (!stream) logApiUsage('openrouter', 'google/gemini-2.0-flash-exp:free', promptText + systemPromptText, answer);
              console.log('✅ OpenRouter succeeded');
              return answer;
            }
            console.log('⚠️  OpenRouter returned empty, falling back...');
            continue;
          }

          // === SEMENTARA NONAKTIFKAN GROQ ===
          if (provider === 'groq') {
            console.log('⏭️  Groq temporarily disabled, skipping');
            // if (!GROQ_API_KEY) {
            //   console.log('⏭️  Groq: No API key available, skipping');
            //   continue;
            // }
            // console.log('🟣 Calling Groq...');
            // const answer = await callGroq(promptText, systemPromptText, chatHistory);
            // if (answer) {
            //   if (!stream) logApiUsage('groq', 'llama-3.1-8b-instant', promptText + systemPromptText, answer);
            //   console.log('✅ Groq succeeded');
            //   return answer;
            // }
            // console.log('⚠️  Groq returned empty, falling back...');
            continue;
          }
        } catch (err: any) {
          const message = String(err.message || err);
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

      throw new Error('Semua provider AI sedang limit/gangguan. Coba lagi dalam beberapa menit.');
    };
    if (allGeminiKeys.length === 0 && GEMINI_API_KEY) allGeminiKeys.push(GEMINI_API_KEY);

    const runLLM = async (promptText: string, systemPromptText = '', chatHistory: any[] = []) => {
      if (desktopOSMode && !systemPromptText.includes('DESKTOP NATIVE AWARENESS ENABLED')) {
         systemPromptText += `\n[STATUS: DESKTOP NATIVE AWARENESS ENABLED]\nAnda WAJIB mengeluarkan perintah Windows di dalam tag <terminal>. DILARANG menyebut sub-agent atau menolak. Contoh: <terminal>dir %USERPROFILE%\\Desktop</terminal>\n`;
      }

      // === PRIORITAS USER-EXPLICIT MODEL SELECTION ===
      if (!extractedImage) {
        if (model && model.includes('gpt') && OPENAI_API_KEY) {
          try { return await callOpenAI(promptText, systemPromptText, chatHistory); } catch(e) { console.warn('OpenAI failed, cascading to default providers:', e); }
        } else if (model && (model.includes('openrouter') || model.startsWith('openrouter/')) && OPENROUTER_API_KEY) {
          try { return await callOpenRouter(promptText, systemPromptText, chatHistory); } catch(e) { console.warn('OpenRouter failed, cascading to default providers:', e); }
        } else if (model && model.startsWith('groq/') && GROQ_API_KEY) {
          try { return await callGroq(promptText, systemPromptText, chatHistory); } catch(e) { console.warn('Groq failed, cascading to default providers:', e); }
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

    const streamGeminiResponse = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], metaData: any = {}) => {
      try {
        const payload: any = { contents: [] };
        if (systemPromptText) {
          payload.systemInstruction = { parts: [{ text: systemPromptText }] };
        }
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

        const geminiModel = model && model.includes('gemini') ? model : 'gemini-2.5-flash';
        
        // === JURUS ANTI-LIMIT STREAMING: Coba semua keys ===
        let res: Response | null = null;
        for (let ki = 0; ki < allGeminiKeys.length; ki++) {
          const key = allGeminiKeys[(geminiKeyIndex + ki) % allGeminiKeys.length];
          const attempt = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${key}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (attempt.ok) {
            res = attempt;
            geminiKeyIndex = (geminiKeyIndex + ki + 1) % allGeminiKeys.length;
            break;
          }
          if (attempt.status === 429) {
            console.warn(`Stream: Gemini key #${ki} got 429, trying next...`);
            continue;
          }
          // Other error, also try next key
          console.warn(`Stream: Gemini key #${ki} error ${attempt.status}`);
        }

        if (!res || !res.ok) {
          // === FALLBACK STREAMING: OpenRouter lalu Groq ===
          console.log('Mamet Anti-Limit Stream: Semua Gemini keys limit, falling back...');
          if (OPENROUTER_API_KEY) {
            return streamOpenRouterResponse(promptText, systemPromptText, chatHistory, metaData);
          }
          if (GROQ_API_KEY) {
            return streamGroqResponse(promptText, systemPromptText, chatHistory, metaData, 'Gemini-429');
          }
          const errStream = new ReadableStream({
            start(controller) {
              const data = JSON.stringify({ choices: [{ delta: { content: `\n\n**Semua API sedang limit.** Coba lagi dalam beberapa menit atau tambahkan API key cadangan di Settings.` } }] });
              controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
              controller.close();
            }
          });
          return new Response(errStream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
        }

        // Convert Gemini SSE format to OpenAI SSE format expected by frontend
        let buffer = '';
        let isThinking = false;
        const transformStream = new TransformStream({
          transform(chunk, controller) {
            const text = new TextDecoder().decode(chunk);
            buffer += text;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));
                  const part = data.candidates?.[0]?.content?.parts?.[0];
                  const content = part?.text || '';
                  const partIsThought = !!part?.thought;
                  
                  if (content) {
                    let prefix = '';
                    if (partIsThought && !isThinking) {
                      prefix = '<think>';
                      isThinking = true;
                    } else if (!partIsThought && isThinking) {
                      prefix = '</think>\n\n';
                      isThinking = false;
                    }
                    
                    const openAiFormat = JSON.stringify({ choices: [{ delta: { content: prefix + content } }] });
                    controller.enqueue(new TextEncoder().encode(`data: ${openAiFormat}\n\n`));
                  }
                } catch (e) {
                   console.error("Gemini parse error in Edge Function:", e.message);
                }
              }
            }
          },
          flush(controller) {
            if (isThinking) {
              const openAiFormat = JSON.stringify({ choices: [{ delta: { content: '</think>' } }] });
              controller.enqueue(new TextEncoder().encode(`data: ${openAiFormat}\n\n`));
            }
          }
        });

        // Sanitize metadata to avoid header limits and invalid ByteString errors (emojis)
        const safeMeta = { ...metaData };
        if (safeMeta.subagentRuns) {
          safeMeta.subagentRuns = safeMeta.subagentRuns.map((r: any) => ({ ...r, output: '[Omitted to save header space]' }));
        }
        
        return new Response(res.body?.pipeThrough(transformStream), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream',
            'X-Agent-Metadata': btoa(encodeURIComponent(JSON.stringify(safeMeta)))
          }
        });
      } catch (err: any) {
        console.error("streamGeminiResponse Error:", err);
        const stream = new ReadableStream({
          start(controller) {
            const data = JSON.stringify({ choices: [{ delta: { content: `\n\n**Internal Server Error di Gemini Stream**: ${err.message}` } }] });
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            controller.close();
          }
        });
        return new Response(stream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
      }
    };

    const getStreamResponse = (prompt: string, sysPrompt: string, hist: any[], meta: any) => {
      if (desktopOSMode && !sysPrompt.includes('DESKTOP NATIVE AWARENESS ENABLED')) {
         sysPrompt += `\n[STATUS: DESKTOP NATIVE AWARENESS ENABLED]
Anda WAJIB mengeluarkan perintah Windows di dalam tag <terminal>. DILARANG menyebut sub-agent atau menolak. Contoh: <terminal>dir %USERPROFILE%\\Desktop</terminal>\n`;
      }
      
      if (model && model.includes('gpt') && OPENAI_API_KEY) {
        return streamOpenAIResponse(prompt, sysPrompt, hist, meta);
      } else if (model && (model.includes('openrouter') || model.startsWith('openrouter/')) && OPENROUTER_API_KEY) {
        return streamOpenRouterResponse(prompt, sysPrompt, hist, meta);
      } else if (model && model.includes('gemini') && GEMINI_API_KEY) {
        return streamGeminiResponse(prompt, sysPrompt, hist, meta);
      } else if (model && model.startsWith('groq/') && GROQ_API_KEY) {
        return streamGroqResponse(prompt, sysPrompt, hist, meta);
      } else if (GROQ_API_KEY) {
        return streamGroqResponse(prompt, sysPrompt, hist, meta);
      }
      return null;
    };
    
    // --- RAG KNOWLEDGE BASE SEARCH ---
    let ragContext = '';
    if (userId && isRagEnabled) {
      try {
        const queryEmbedding = await getGeminiEmbedding(message, GEMINI_API_KEY);
        if (queryEmbedding.length > 0) {
          const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
          );
          
          const { data: matchedDocs, error: matchError } = await supabaseClient.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: 0.5,
            match_count: 5,
            p_user_id: userId
          });

          if (!matchError && matchedDocs && matchedDocs.length > 0) {
            ragContext = `\n\n[DOKUMEN REFERENSI KNOWLEDGE BASE]:\nBerikan jawaban berdasarkan data relevan yang ditemukan dalam database dokumen milik user berikut ini:\n`;
            for (const doc of matchedDocs) {
              ragContext += `- [Dari file "${doc.title}"]: "${doc.content}"\n`;
            }
          }
        }
      } catch (err) {
        console.error("RAG Search Error:", err);
      }
    }

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
MODEL AI YANG ANDA GUNAKAN SAAT INI: ${model || 'gemini-2.5-flash'}. Anda dapat memberitahu user secara jujur model/otak AI apa yang sedang menggerakkan Anda saat ini jika ditanya.\n`;

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
\nAnda memiliki tim Sub-Agent nyata berikut ini:\n${getPluginPromptList()}\nJika user menanyakan jumlah atau nama sub-agent Anda, sebutkan nama-nama di atas.`;
    const userContextPrompt = userName ? `\nInformasi Akun: User login dengan email/nama "${userName}". Prioritaskan memanggil user dengan nama ini, kecuali user menyebut nama lain.` : '';
    const memoryPrompt = globalMemory ? `\n\n[MEMORI GLOBAL & PREFERENSI USER]:\n${globalMemory}\n(Patuhi instruksi/ingatan di atas secara ketat di setiap jawaban Anda!)` : '';
    const fullSystemContext = agentIdentityPrompt + userContextPrompt + memoryPrompt + ragContext;

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
        "workspace", "folder", "analisis file", "periksa file", "scan folder", "baca file", "isi folder", "struktur folder", "WORKSPACE FILES CONTENT",
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
        if (stream && !extractedImage) {
          const streamRes = getStreamResponse(finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps });
          if (streamRes) return streamRes;
        }
        replyMessage = await runLLM(finalMessage, fullSystemContext, history);
      } else {
        let coordinatorSystemPrompt = `Tugas Anda adalah menganalisis permintaan user dan memilih sub-agent yang tepat.
Anda memiliki tim Sub-Agent nyata berikut ini:
${getPluginPromptList()}

PENTING:
1. Anda adalah mesin parsing JSON. Anda DILARANG KERAS merespons dengan kalimat atau teks biasa. Anda WAJIB mengembalikan HANYA sebuah Array JSON murni. Jika tidak butuh sub-agent, kembalikan [].
2. Jika user menanyakan informasi aktual, fakta terbaru, berita, pertandingan olahraga (seperti MotoGP 2026), cuaca, harga saham, atau info di luar batas pengetahuan internal Anda (akhir 2024), Anda WAJIB memanggil sub-agent "researcher" atau "deep_research". JANGAN gunakan sub-agent "logika" untuk menjawab pertanyaan fakta/aktual!
3. Jika user meminta penjadwalan, tugas berulang, atau otomatisasi, Anda WAJIB memanggil sub-agent "cron_manager". DILARANG MENGARANG JADWAL SENDIRI.

Contoh Output Wajib: [{"subagent": "researcher", "task": "Cari pemenang MotoGP Italia Mugello 2026"}]`;

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

      let accumulatedContext = `Permintaan awal user: "${finalMessage}"\n\n`;

      if (plan && plan.length > 0) {
        const seenTasks = new Set();
        for (let i = 0; i < plan.length; i++) {
          // --- MAMET HEALER (OBAT PENENANG / INFINITE LOOP BREAKER) ---
          if (i >= 5) {
            console.log("Mamet Healer: Jumlah tugas terlalu banyak (>5). Menyuntikkan obat penenang...");
            break;
          }
          
          const { subagent, task } = plan[i];
          const taskSignature = subagent + ":" + (task || "").substring(0, 30);
          
          if (seenTasks.has(taskSignature)) {
            console.log("Mamet Healer: Mendeteksi perulangan instruksi (Loop). Menghentikan proses sub-agent...");
            break;
          }
          seenTasks.add(taskSignature);

          let subagentResText = 'Gagal memproses.';
          let subagentSources: any[] = [];
          let subagentToolExec = null;

          const plugin = getPluginByName(subagent);
          if (plugin) {
            processingSteps.push(`🚀 Menjalankan Sub-Agent "${subagent}": ${task}`);
            const env = { 
              GEMINI_API_KEY, 
              GROQ_API_KEY, 
              OPENAI_API_KEY, 
              OPENROUTER_API_KEY, 
              APIFY_API_TOKEN: Deno.env.get('APIFY_API_TOKEN') || '',
              allGeminiKeys 
            };
            const fullTask = `Tugas Spesifik Anda: ${task}\n\nPermintaan Asli User: "${finalMessage}"\n\nKonteks Tambahan:\n${accumulatedContext}`;
            
            // --- TRAFFIC LIGHT ROUTER (AI BERLAPIS) ---
            const customRunLLM = async (prompt: string, sys: string, hist: any[]) => {
              const originalModel = model;
              try {
                if (subagent === 'coder' || subagent === 'debate') {
                   console.log(`🚥 Traffic Light: Sub-agent [${subagent}] dialihkan ke OpenRouter Gemini (Tugas Berat)`);
                   model = 'openrouter-google-gemini-2.0-flash-exp';
                } else if (subagent === 'scraper' || subagent === 'memory_manager' || subagent === 'communicator' || subagent === 'youtube_analyst' || subagent === 'file_analyzer') {
                   console.log(`🚥 Traffic Light: Sub-agent [${subagent}] dialihkan ke GROQ (Tugas Ringan)`);
                   model = 'groq-llama-3.1';
                } else {
                   console.log(`🚥 Traffic Light: Sub-agent [${subagent}] menggunakan GEMINI (Tugas Utama)`);
                   model = 'gemini-2.5-flash';
                }
                return await runLLM(prompt, sys, hist);
              } finally {
                model = originalModel; // Restore original model ke setelan awal
              }
            };

            // --- MAMET HEALER (PENAWAR RACUN / ERROR SHIELD) ---
            try {
              const result = await plugin.execute({ task: fullTask, cleanTask: task, accumulatedContext, env, runLLM: customRunLLM, userId });
              subagentResText = result.output;
              subagentSources = result.sources || [];
              subagentToolExec = result.toolExecution || null;
              const outputPreview = (subagentResText || '').substring(0, 80).replace(/\n/g, ' ');
              processingSteps.push(`✅ Sub-Agent "${subagent}" selesai${subagentSources.length > 0 ? ` → ${subagentSources.length} sumber referensi` : ''} → "${outputPreview}..."`);
            } catch (err: any) {
              console.error(`Mamet Healer: Menangkap Error mematikan dari Sub-Agent [${subagent}]!`, err);
              subagentResText = `[SISTEM DILINDUNGI OLEH MAMET HEALER]: Sub-agent gagal beroperasi karena error teknis (${err.message || 'Unknown'}). Tolong sampaikan ke user dengan ramah bahwa fitur ini sedang terkendala.`;
              processingSteps.push(`❌ Sub-Agent "${subagent}" gagal: ${err.message || 'Unknown error'}`);
            }
          } else {
             subagentResText = `Sub-agent '${subagent}' tidak ditemukan di sistem plugin.`;
             processingSteps.push(`⚠️ Sub-Agent "${subagent}" tidak ditemukan`);
          }

          subagentRuns.push({
            subagent, task, output: subagentResText, sources: subagentSources, toolExecution: subagentToolExec
          });
          accumulatedContext += `--- Hasil Sub-Agent [${subagent.toUpperCase()}]: ---\nTugas: ${task}\nOutput: ${subagentResText}\n\n`;
          
          // Penundaan 1 detik untuk menghindari API Rate Limit (Error 429) pada akun gratis
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const synthesisPrompt = `Anda telah menugaskan beberapa sub-agent.${fullSystemContext}\n\nPermintaan Awal User: "${finalMessage}"\n\nRiwayat pekerjaan sub-agent:\n${accumulatedContext}\n\nJAWABLAH pesan/pertanyaan user dengan ramah dan natural berdasarkan informasi dari sub-agent di atas. \n\nPENTING: \n- JANGAN gunakan format kaku seperti "Laporan Hasil Kerja". Bersikaplah seperti manusia biasa (asisten yang ramah bernama Mamet).\n- Langsung berikan jawaban, sapaan balik, atau solusi tanpa perlu panjang lebar menjelaskan proses sub-agent (kecuali user secara spesifik bertanya tentang prosesnya).\n- Jika pada riwayat pekerjaan sub-agent terdapat bagian "Gambar Terkait" (dalam format Markdown ![Gambar](url)), Anda WAJIB menyertakan gambar-gambar tersebut di bagian paling akhir jawaban Anda untuk memberikan visualisasi kepada user.\n- Jika Sub-Agent mengembalikan pesan ERROR atau GAGAL, sampaikan kepada user dengan sopan bahwa tugas tersebut gagal. Jangan pernah mengarang data palsu!\n- Gunakan format Tabel Markdown HANYA jika menyajikan data terstruktur, statistik, harga, atau perbandingan.\n- DILARANG KERAS menggunakan blok \`\`\`mermaid\`\`\` KECUALI user secara tertulis meminta "buatkan diagram" atau "gambarkan flowchart". Jika user tidak meminta diagram, JANGAN pernah memakainya!`;
        
        processingSteps.push('📝 Merangkum dan menyintesis jawaban akhir...');
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
      if (stream && !extractedImage) {
        processingSteps.push('✍️ Menjawab langsung (tanpa tools)...');
        const streamRes = getStreamResponse(finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps });
        if (streamRes) return streamRes;
      }
      replyMessage = await runLLM(finalMessage, fullSystemContext, history);
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