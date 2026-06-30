import { CapabilityAdapter, AdapterContext, AdapterResult } from './capability_adapter.ts';
import { callGroq, callOpenRouter, callOpenAI } from '../provider_manager.ts';
import { RuntimeContext } from '../runtime_context.ts';

export class GroqAdapter implements CapabilityAdapter {
  name = 'GroqAdapter';
  type = 'AI' as const;
  private rctx: RuntimeContext;

  constructor(rctx: RuntimeContext) {
    this.rctx = rctx;
  }

  async initialize() {
    return !!this.rctx.keys.groq;
  }

  async execute(input: any, context: AdapterContext): Promise<AdapterResult> {
    const { promptText, systemPromptText, chatHistory } = input;
    const answer = await callGroq(promptText, systemPromptText || '', chatHistory || [], this.rctx);
    return {
      result: answer,
      confidence: 0.9,
      source: 'groq',
      trace_id: context.trace_id
    };
  }

  async healthCheck() {
    return await this.initialize();
  }

  async shutdown() {}
}

export class OpenRouterAdapter implements CapabilityAdapter {
  name = 'OpenRouterAdapter';
  type = 'AI' as const;
  private rctx: RuntimeContext;

  constructor(rctx: RuntimeContext) {
    this.rctx = rctx;
  }

  async initialize() {
    return !!this.rctx.keys.openRouter;
  }

  async execute(input: any, context: AdapterContext): Promise<AdapterResult> {
    const { promptText, systemPromptText, chatHistory, forceDefaultModel } = input;
    const answer = await callOpenRouter(promptText, systemPromptText || '', chatHistory || [], !!forceDefaultModel, this.rctx);
    return {
      result: answer,
      confidence: 0.9,
      source: 'openrouter',
      trace_id: context.trace_id
    };
  }

  async healthCheck() {
    return await this.initialize();
  }

  async shutdown() {}
}

export class GeminiAdapter implements CapabilityAdapter {
  name = 'GeminiAdapter';
  type = 'AI' as const;
  private rctx: RuntimeContext;
  private static keyIndex = 0;

  constructor(rctx: RuntimeContext) {
    this.rctx = rctx;
  }

  async initialize() {
    return this.rctx.keys.allGemini.length > 0;
  }

  async execute(input: any, context: AdapterContext): Promise<AdapterResult> {
    const { payload, model } = input;
    const allKeys = this.rctx.keys.allGemini;
    const maxRetries = 3;
    let seenRateLimit = false;
    let lastError = 'Unknown error';

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      for (let ki = 0; ki < allKeys.length; ki++) {
        const key = allKeys[(GeminiAdapter.keyIndex + ki) % allKeys.length];
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash'}:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          if (res.ok) {
            GeminiAdapter.keyIndex = (GeminiAdapter.keyIndex + ki + 1) % allKeys.length;
            const data = await res.json();
            const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            return {
              result: answer,
              confidence: 0.95,
              source: 'gemini',
              trace_id: context.trace_id
            };
          }
          
          const errText = await res.text();
          lastError = `Status ${res.status}: ${errText}`;
          if (res.status === 429) {
            seenRateLimit = true;
            console.warn(`[GeminiAdapter] key #${ki} got 429, trying next key...`);
            continue;
          }
          console.warn(`[GeminiAdapter] key #${ki} error ${res.status}, trying next...`);
        } catch (e: any) {
          lastError = e.message || String(e);
          console.warn(`[GeminiAdapter] network error:`, e);
        }
      }
      
      if (attempt < maxRetries - 1) {
        const waitMs = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, waitMs));
      }
    }

    if (seenRateLimit) {
      throw new Error(`RATE_LIMIT`);
    }
    throw new Error(`Gemini failed all retries. Last error: ${lastError}`);
  }

  async healthCheck() {
    return await this.initialize();
  }

  async shutdown() {}
}
