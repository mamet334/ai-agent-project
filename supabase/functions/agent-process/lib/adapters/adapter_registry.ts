import { CapabilityAdapter } from './capability_adapter.ts';
import { GeminiAdapter, GroqAdapter, OpenRouterAdapter } from './ai_adapter.ts';
import { RuntimeContext } from '../runtime_context.ts';

export class CapabilityRegistry {
  private static adapters = new Map<string, CapabilityAdapter>();
  private static isInitialized = false;

  public static async initializeAdapters(rctx: RuntimeContext) {
    // Re-initialize for each execution context to ensure keys are fresh
    this.adapters.clear();
    
    const gemini = new GeminiAdapter(rctx);
    const groq = new GroqAdapter(rctx);
    const openRouter = new OpenRouterAdapter(rctx);

    if (await gemini.initialize()) this.adapters.set('gemini', gemini);
    if (await groq.initialize()) this.adapters.set('groq', groq);
    if (await openRouter.initialize()) this.adapters.set('openrouter', openRouter);
    
    this.isInitialized = true;
  }

  public static getAdapter(name: string): CapabilityAdapter | undefined {
    return this.adapters.get(name);
  }

  public static getAvailableAIAdapters(preferredOrder: string[]): CapabilityAdapter[] {
    const available: CapabilityAdapter[] = [];
    for (const name of preferredOrder) {
      const adapter = this.adapters.get(name);
      if (adapter) available.push(adapter);
    }
    return available;
  }
}
