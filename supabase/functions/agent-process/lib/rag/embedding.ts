import { RuntimeContext } from '../runtime_context.ts';
import { CapabilityRegistry } from '../adapters/adapter_registry.ts';

export const generateEmbedding = async (text: string, rctx: RuntimeContext): Promise<number[]> => {
  // Ensure adapters are initialized (usually done in Orchestrator, but safe to call)
  await CapabilityRegistry.initializeAdapters(rctx);
  
  const availableAdapters = CapabilityRegistry.getAvailableEmbeddingAdapters(['gemini_embedding', 'openai_embedding']);
  
  if (availableAdapters.length === 0) {
      console.error("[Embedding] No embedding adapters available. Please check your API keys.");
      return [];
  }

  let lastError = '';

  for (const adapter of availableAdapters) {
      try {
          // Provide trace_id if available, fallback to 'unknown'
          const traceId = (rctx?.tasks as any)?.traceId || 'unknown';
          const res = await adapter.execute({ text }, { trace_id: traceId });
          
          if (res.result && Array.isArray(res.result) && res.result.length === 768) {
              return res.result;
          } else {
              console.warn(`[Embedding] Adapter ${adapter.name} returned invalid dimension (expected 768, got ${res.result?.length}).`);
          }
      } catch(e: any) {
          console.warn(`[Embedding] Adapter ${adapter.name} failed:`, e.message || String(e));
          lastError += `[${adapter.name}]: ${e.message}; `;
      }
  }
  
  console.error(`[Embedding] All embedding adapters failed. Errors: ${lastError}`);
  return [];
};
