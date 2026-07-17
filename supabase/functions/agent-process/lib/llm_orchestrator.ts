import { RuntimeContext } from './runtime_context.ts';
import { eventBus } from './event/event_bus.ts';
import { CapabilityRegistry } from './adapters/adapter_registry.ts';

// API Key state moved to Adapters



// === COOLDOWN CONFIGURATION ===
const PROVIDER_COOLDOWN_DURATIONS: Record<string, number> = {
  'gemini': 60000,        // 60 seconds for Gemini
  'openrouter': 60000,    // 60 seconds for OpenRouter
  'groq': 3600000         // 1 hour for Groq (rentan rate limit)
};

// Cooldown state moved to CapabilityRegistry

export const callLLMWithMetadata = async (
  promptText: string,
  systemPromptText = '',
  chatHistory: any[] = [],
  preferredProvider: string = 'gemini',
  extractedImage: { mimeType: string; data: string } | null = null,
  rctx: RuntimeContext,
  tools: string[] = []
): Promise<{ result: string; metadata?: any }> => {
  await CapabilityRegistry.initializeAdapters(rctx);

  const buildPayload = (tools: string[] = []) => {
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
    
    if (tools.includes('web_search')) {
      payload.tools = [{ googleSearch: {} }];
    }
    
    // Batasi output tokens agar tidak melampaui limit/kredit 
    payload.generationConfig = { maxOutputTokens: 8192 };
    
    return payload;
  };

  let cascadeOrder: Array<string> = ['gemini', 'groq', 'openrouter', 'openai'];
  
  if (preferredProvider && cascadeOrder.includes(preferredProvider)) {
     // Pindahkan preferredProvider ke urutan teratas
     cascadeOrder = [preferredProvider, ...cascadeOrder.filter(p => p !== preferredProvider)];
  }

  // Filter available via cooldown check in Registry
  const availableAdapters = CapabilityRegistry.getAvailableAIAdapters(cascadeOrder);

  console.log(`🎯 Cascade order: ${availableAdapters.map(a => a.name).join(' -> ')}`);

  const payload = buildPayload(tools);
  let lastError = '';

  if (availableAdapters.length === 0) {
    lastError = `No available AI adapters. Locked: ${cascadeOrder.filter(p => CapabilityRegistry.isProviderLocked(p)).join(', ')}`;
  }

  for (const adapter of availableAdapters) {
    console.log(`📍 Executing Capability Adapter: ${adapter.name}`);
    
    try {
      const adapterInput = {
        promptText,
        systemPromptText,
        chatHistory,
        payload,
        forceDefaultModel: adapter.name === 'OpenRouterAdapter' ? true : false,
        model: rctx.model.model
      };

        const result = await adapter.execute(adapterInput, { trace_id: (rctx?.tasks as any)?.traceId || 'unknown' });
      
      if (result && result.result) {
        if (!rctx.stream.isStream) {
          rctx.logger.logApiUsage(result.source, rctx.model.model || 'auto', promptText + systemPromptText, result.result);
        }
        console.log(`✅ ${adapter.name} succeeded`);
        eventBus.emit({ type: 'Capability.Executed', source: adapter.name, payload: { success: true, rctx } });
        return { result: result.result, metadata: result.metadata };
      }

      console.log(`⚠️  ${adapter.name} returned empty, falling back...`);
      lastError += ` [${adapter.name}]: returned empty;`;
      
    } catch (err: any) {
      const message = String(err.message || err);
      lastError += ` [${adapter.name}]: ${message};`;
      const isRateLimit = message.includes('429') || message.includes('rate limit') || message.includes('RATE_LIMIT') || message.includes('quota');
      
      const providerKey = adapter.name.toLowerCase().replace('adapter', '');
      
      if (isRateLimit) {
        console.log(`🚫 Adapter ${adapter.name} hit rate limit (429), locking for ${PROVIDER_COOLDOWN_DURATIONS[providerKey] || 60000}ms`);
        CapabilityRegistry.lockProvider(providerKey, PROVIDER_COOLDOWN_DURATIONS[providerKey] || 60000);
        await rctx.logger.logAgentEvent('RATE_LIMIT_HIT', providerKey, `429 Error: ${message.substring(0, 200)}`);
      } else {
        await rctx.logger.logAgentEvent('FALLBACK_TRIGGERED', providerKey, `Error: ${message.substring(0, 200)}`);
      }
      console.warn(`❌ Adapter ${adapter.name} failed: ${message}`);
    }
  }

  throw new Error('Semua AI Adapter gagal (limit/gangguan). Detail error:' + rctx.state.explicitModelErrors + lastError);
};

export const callLLMWithCascade = async (
  promptText: string,
  systemPromptText = '',
  chatHistory: any[] = [],
  preferredProvider: string = 'gemini',
  extractedImage: { mimeType: string; data: string } | null = null,
  rctx: RuntimeContext
): Promise<string> => {
  const res = await callLLMWithMetadata(promptText, systemPromptText, chatHistory, preferredProvider, extractedImage, rctx, []);
  return res.result;
};

export const runLLM = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], rctx: RuntimeContext) => {
  if (rctx.policy.canUseDesktopTools && !systemPromptText.includes('DESKTOP NATIVE AWARENESS ENABLED')) {
     systemPromptText += `\n[STATUS: DESKTOP NATIVE AWARENESS ENABLED]\nAnda WAJIB mengeluarkan perintah Windows di dalam tag <terminal>. DILARANG menyebut sub-agent atau menolak. Contoh: <terminal>dir %USERPROFILE%\\Desktop</terminal>\n`;
  }

  // === PRIORITAS USER-EXPLICIT MODEL SELECTION via UI provider (if provided) ===
  let preferredProvider = 'gemini';

  const uiProviderRaw =
    (rctx as any)?.model?.provider ||
    (rctx as any)?.model?.selectedProvider ||
    (rctx as any)?.state?.provider ||
    (rctx as any)?.state?.selectedProvider;

  const uiProvider = typeof uiProviderRaw === 'string' ? uiProviderRaw.toLowerCase() : null;

  // If UI explicitly chose provider, honor it first (prevents "openai" heuristic from hijacking OpenRouter).
  if (uiProvider === 'openrouter') preferredProvider = 'openrouter';
  else if (uiProvider === 'openai') preferredProvider = 'openai';
  else if (uiProvider === 'groq') preferredProvider = 'groq';
  else if (uiProvider === 'gemini') preferredProvider = 'gemini';
  else {
    // fallback logic
    if (!rctx.stream.extractedImage && rctx.model.model) {
      // CRITICAL FIX:
      // If UI provider is null BUT model id looks like "openai/xxx" (contains '/'),
      // force OpenRouter so we don't accidentally route to OpenAIAdapter.
      if (typeof rctx.model.model === 'string' && rctx.model.model.includes('/')) {
        preferredProvider = 'openrouter';
      } else {
        if (rctx.model.model.includes('gpt') && !rctx.model.model.includes('openrouter')) {
          preferredProvider = 'openai';
        } else if (rctx.model.model.includes('openrouter') || rctx.model.model.startsWith('openrouter/')) {
          preferredProvider = 'openrouter';
        } else if (rctx.model.model.startsWith('groq/')) {
          preferredProvider = 'groq';
        }
      }
    }
  }

  console.log('[DEBUG][runLLM] rctx.model=', (rctx as any)?.model, ' uiProvider=', uiProvider, ' preferredProvider=', preferredProvider);
  console.log(`🔄 runLLM delegated to Capability Registry with preferred provider: ${preferredProvider}`);
  return await callLLMWithCascade(promptText, systemPromptText, chatHistory, preferredProvider, rctx.stream.extractedImage, rctx);
};

export const runStreamLLM = async function*(promptText: string, systemPromptText = '', chatHistory: any[] = [], rctx: RuntimeContext): AsyncGenerator<string, void, unknown> {
  await CapabilityRegistry.initializeAdapters(rctx);
  const input = { promptText, systemPromptText, chatHistory, image: rctx.stream.extractedImage };

  let preferredAdapters: string[] = [];

  const uiProviderRaw =
    (rctx as any)?.model?.provider ||
    (rctx as any)?.model?.selectedProvider ||
    (rctx as any)?.state?.provider ||
    (rctx as any)?.state?.selectedProvider;

  const uiProvider = typeof uiProviderRaw === 'string' ? uiProviderRaw.toLowerCase() : null;

  if (!input.image) {
    // honor UI provider first
    if (uiProvider === 'openrouter') preferredAdapters.push('openrouter');
    else if (uiProvider === 'openai') preferredAdapters.push('openai');
    else if (uiProvider === 'groq') preferredAdapters.push('groq');

    // fallback inference if uiProvider not provided
    if (preferredAdapters.length === 0) {
      // CRITICAL FIX (stream path):
      // model like "openai/gpt-4o-mini" must route to openrouter adapter.
      if (rctx.model.model && typeof rctx.model.model === 'string' && rctx.model.model.includes('/')) {
        preferredAdapters.push('openrouter');
      } else {
        if (rctx.model.model && rctx.model.model.includes('gpt') && !rctx.model.model.includes('openrouter')) preferredAdapters.push('openai');
        if (rctx.model.model && (rctx.model.model.includes('openrouter') || rctx.model.model.startsWith('openrouter/'))) preferredAdapters.push('openrouter');
        if (rctx.model.model && rctx.model.model.startsWith('groq/')) preferredAdapters.push('groq');
      }
    }
  }

  console.log('[DEBUG][runStreamLLM] rctx.model=', (rctx as any)?.model, ' uiProvider=', uiProvider, ' preferredAdapters=', preferredAdapters);

  // Append cascade
  for (const p of ['gemini', 'groq', 'openrouter']) {
     if (!preferredAdapters.includes(p)) preferredAdapters.push(p);
  }

  const availableAdapters = CapabilityRegistry.getAvailableAIAdapters(preferredAdapters);
  let lastError = '';
  
  if (availableAdapters.length === 0) {
      yield `\n\n**Internal Server Error:** No AI adapters available. Check API keys.\n\n`;
      return;
  }

  for (const adapter of availableAdapters) {
     try {
       console.log(`📍 Streaming via Capability Adapter: ${adapter.name}`);
       const streamIter = adapter.stream(input, { trace_id: (rctx?.tasks as any)?.traceId || 'unknown' });
       // Peek the first chunk to catch connection errors early
       const firstResult = await streamIter.next();
       
       if (!firstResult.done && firstResult.value) {
          yield firstResult.value;
       }
       
       // If no error on first chunk, we are connected and locked in. 
       // Yield the rest.
       yield* streamIter;
       return; // Success, end cascade
     } catch(err: any) {
       const msg = err.message || String(err);
       console.warn(`❌ Adapter ${adapter.name} stream failed: ${msg}`);
       if (msg.includes('FATAL_CLIENT_ERROR')) {
           yield `\n\n**[SYSTEM HALTED] Client Error:** ${msg}\n\n`;
           return;
       }
       lastError += ` [${adapter.name}]: ${msg};`;
       yield `\n\n*(Fallback Note: ${adapter.name} failed, cascading...)*\n\n`;
     }
  }

  yield `\n\n**Semua AI Provider sedang limit atau gangguan.**\nDetail error: ${lastError}`;
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
