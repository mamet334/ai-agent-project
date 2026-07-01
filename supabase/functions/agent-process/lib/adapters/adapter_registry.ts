import { CapabilityAdapter } from './capability_adapter.ts';
import { GeminiAdapter, GroqAdapter, OpenRouterAdapter, OpenAIAdapter } from './ai_adapter.ts';
import { GeminiEmbeddingAdapter, OpenAIEmbeddingAdapter } from './embedding_adapter.ts';
import { RuntimeContext } from '../runtime_context.ts';

export class CapabilityRegistry {
  private static adapters = new Map<string, CapabilityAdapter>();
  private static isInitialized = false;
  private static providerCooldowns = new Map<string, number>();

  public static clearAllCooldowns() {
    this.providerCooldowns.clear();
  }

  public static isProviderLocked(provider: string): boolean {
    const expires = this.providerCooldowns.get(provider);
    if (!expires) return false;
    if (Date.now() > expires) {
      this.providerCooldowns.delete(provider);
      return false;
    }
    return true;
  }

  public static lockProvider(provider: string, durationMs: number = 60000) {
    this.providerCooldowns.set(provider, Date.now() + durationMs);
    console.log(`🔒 Provider cooldown set for ${provider} (${durationMs}ms)`);
  }

  public static async initializeAdapters(rctx: RuntimeContext) {
    // Re-initialize for each execution context to ensure keys are fresh
    this.adapters.clear();
    
    const gemini = new GeminiAdapter(rctx);
    const groq = new GroqAdapter(rctx);
    const openRouter = new OpenRouterAdapter(rctx);
    const openai = new OpenAIAdapter(rctx);
    const geminiEmbedding = new GeminiEmbeddingAdapter(rctx);
    const openaiEmbedding = new OpenAIEmbeddingAdapter(rctx);

    if (await gemini.initialize()) this.adapters.set('gemini', gemini);
    if (await groq.initialize()) this.adapters.set('groq', groq);
    if (await openRouter.initialize()) this.adapters.set('openrouter', openRouter);
    if (await openai.initialize()) this.adapters.set('openai', openai);
    if (await geminiEmbedding.initialize()) this.adapters.set('gemini_embedding', geminiEmbedding);
    if (await openaiEmbedding.initialize()) this.adapters.set('openai_embedding', openaiEmbedding);
    
    this.isInitialized = true;
  }

  public static getAdapter(name: string): CapabilityAdapter | undefined {
    return this.adapters.get(name);
  }

  public static getAvailableAIAdapters(preferredOrder: string[]): CapabilityAdapter[] {
    const available: CapabilityAdapter[] = [];
    for (const name of preferredOrder) {
      if (this.isProviderLocked(name)) continue;
      const adapter = this.adapters.get(name);
      if (adapter) available.push(adapter);
    }
    return available;
  }

  public static getAvailableEmbeddingAdapters(preferredOrder: string[]): CapabilityAdapter[] {
    const available: CapabilityAdapter[] = [];
    for (const name of preferredOrder) {
      const adapter = this.adapters.get(name);
      if (adapter && adapter.type === 'EMBEDDING') available.push(adapter);
    }
    return available;
  }
}
