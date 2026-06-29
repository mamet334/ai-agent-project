import { RuntimeContext } from './runtime_context.ts';
import { callGroq, callOpenAI, callOpenRouter } from './provider_manager.ts';

// Global state for Round-Robin API Keys (persists across warm invocations)
export let geminiKeyIndex = 0;
export const setGeminiKeyIndex = (idx: number) => { geminiKeyIndex = idx; };
export let groqKeyIndex = 0;
export const setGroqKeyIndex = (idx: number) => { groqKeyIndex = idx; };
export let openaiKeyIndex = 0;
export const setOpenaiKeyIndex = (idx: number) => { openaiKeyIndex = idx; };
export let openrouterKeyIndex = 0;
export const setOpenrouterKeyIndex = (idx: number) => { openrouterKeyIndex = idx; };

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

export const clearAllCooldowns = () => {
  providerCooldowns.clear();
};

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

export const callLLMWithCascade = async (
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

export const runLLM = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], rctx: RuntimeContext) => {
  if (rctx.policy.canUseDesktopTools && !systemPromptText.includes('DESKTOP NATIVE AWARENESS ENABLED')) {
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
export const runCoordinatorLLM = async (promptText: string, systemPromptText = '', preferFast = false, rctx: RuntimeContext) => {
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
