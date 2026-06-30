import { CapabilityAdapter, AdapterContext, AdapterResult } from './capability_adapter.ts';
import { RuntimeContext } from '../runtime_context.ts';

export class GeminiEmbeddingAdapter implements CapabilityAdapter {
  name = 'GeminiEmbeddingAdapter';
  type = 'EMBEDDING' as const;
  private rctx: RuntimeContext;
  private static keyIndex = 0;

  constructor(rctx: RuntimeContext) {
    this.rctx = rctx;
  }

  async initialize() {
    return this.rctx.keys.allGemini.length > 0;
  }

  async execute(input: any, context: AdapterContext): Promise<AdapterResult> {
    const { text } = input;
    const allKeys = this.rctx.keys.allGemini;
    const maxRetries = 2;
    let lastError = 'Unknown error';

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      for (let ki = 0; ki < allKeys.length; ki++) {
        const key = allKeys[(GeminiEmbeddingAdapter.keyIndex + ki) % allKeys.length];
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'models/gemini-embedding-2', content: { parts: [{ text }] } })
          });
          
          if (res.ok) {
            GeminiEmbeddingAdapter.keyIndex = (GeminiEmbeddingAdapter.keyIndex + ki + 1) % allKeys.length;
            const data = await res.json();
            const embedding = data.embedding?.values || [];
            if (embedding.length > 0) {
              return { result: embedding, confidence: 1.0, source: 'gemini_embedding', trace_id: context.trace_id };
            }
          }
          
          const errText = await res.text();
          lastError = `Status ${res.status}: ${errText}`;
        } catch (e: any) {
          lastError = e.message || String(e);
        }
      }
    }

    throw new Error(`Gemini embedding failed. Last error: ${lastError}`);
  }

  async *stream(input: any, context: AdapterContext): AsyncGenerator<string, void, unknown> {
    throw new Error("Stream not supported for embedding adapter");
  }

  async healthCheck() {
    return await this.initialize();
  }

  async shutdown() {}
}

export class OpenAIEmbeddingAdapter implements CapabilityAdapter {
  name = 'OpenAIEmbeddingAdapter';
  type = 'EMBEDDING' as const;
  private rctx: RuntimeContext;

  constructor(rctx: RuntimeContext) {
    this.rctx = rctx;
  }

  async initialize() {
    return !!this.rctx.keys.openAI;
  }

  async execute(input: any, context: AdapterContext): Promise<AdapterResult> {
    const { text } = input;
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.rctx.keys.openAI}`,
        'Content-Type': 'application/json'
      },
      // Force dimensions to 768 to match Gemini compatibility in pgvector
      body: JSON.stringify({
        input: text,
        model: 'text-embedding-3-small',
        dimensions: 768
      })
    });
    
    if (!res.ok) {
      throw new Error(`OpenAI embedding HTTP ${res.status}: ${await res.text()}`);
    }
    
    const data = await res.json();
    const embedding = data.data?.[0]?.embedding || [];
    if (embedding.length > 0) {
      return { result: embedding, confidence: 1.0, source: 'openai_embedding', trace_id: context.trace_id };
    }
    
    throw new Error(`OpenAI embedding failed to return valid data.`);
  }

  async *stream(input: any, context: AdapterContext): AsyncGenerator<string, void, unknown> {
    throw new Error("Stream not supported for embedding adapter");
  }

  async healthCheck() {
    return await this.initialize();
  }

  async shutdown() {}
}
