/**
 * Context Fusion Layer (Minimalist Edition)
 * Structures input context to improve readability and probabilistic interpretation.
 * Uses lightweight semantic XML-like blocks.
 * OMITTED: HISTORY and USER_INPUT are intentionally excluded from this prompt builder
 * because they are handled natively via the LLM API's message array in index.ts (Token duplication prevention).
 */

export function buildStructuredContext({ memoryArray = [], ragArray = [], message = '', basePrompts = '', ctx = null }) {
  // 1. Process Memory
  const finalMemory = [];
  const seenContent = new Set();

  const validMemory = memoryArray
    .map(m => ({ ...m, content: m.content || m.summary || '', memory_state: m.memory_state || 'ACTIVE' }))
    .filter(m => m.content.trim() !== '');

  for (const item of validMemory) {
    const lower = item.content.toLowerCase();
    if (!seenContent.has(lower)) {
      finalMemory.push(item);
      seenContent.add(lower);
    }
  }

  // 2. Process RAG
  const finalRag = [];
  const validRag = ragArray
    .map(r => ({ ...r, content: r.content || '' }))
    .filter(r => r.content.trim() !== '');

  for (const item of validRag) {
    const lower = item.content.toLowerCase();
    if (!seenContent.has(lower)) {
      finalRag.push(item);
      seenContent.add(lower);
    }
  }

  return {
    basePrompts,
    memory: { items: finalMemory },
    rag: { documents: finalRag },
    user: { intent: message ? message.substring(0, 100) : 'unknown' },
    execution: { mode: ctx ? ctx.mode : 'UNKNOWN', ragTopK: ctx && ctx.rag ? ctx.rag.topK : finalRag.length }
  };
}

export function buildFinalPrompt(structuredContext: any): string {
  if (!structuredContext) return '';

  const parts: string[] = [];

  // 1. SYSTEM BLOCK
  if (structuredContext.basePrompts) {
    parts.push('<SYSTEM>\n' + structuredContext.basePrompts + '\n</SYSTEM>');
  }

  // Trace Block
  const mode = structuredContext.execution?.mode || 'UNKNOWN';
  const ragTopK = structuredContext.execution?.ragTopK || 0;
  parts.push(`<EXECUTION_TRACE mode="${mode}" ragTopK="${ragTopK}" />`);
  parts.push(`<POLICY>Relevance between Memory and RAG depends on user query context and is not globally fixed.</POLICY>`);

  // 2. MEMORY BLOCK
  if (structuredContext.memory?.items?.length > 0) {
    const memoryStrings = structuredContext.memory.items.map((m: any) => {
       const prefix = m.memory_state === 'HISTORICAL' ? '[HISTORICAL] ' : '';
       return `${prefix}${m.content}`;
    });
    parts.push(`<MEMORY>\n${memoryStrings.join('\n')}\n</MEMORY>`);
  }

  // 3. RAG BLOCK
  if (structuredContext.rag?.documents?.length > 0) {
    const ragStrings = structuredContext.rag.documents.map((r: any) => r.content);
    parts.push(`<RAG>\n${ragStrings.join('\n')}\n</RAG>`);
  }

  return parts.join('\n\n');
}

export function buildContextFusion(args: any) {
  const structuredContext = buildStructuredContext(args);
  const finalContext = buildFinalPrompt(structuredContext);

  return {
    memory: structuredContext.memory.items,
    rag: structuredContext.rag.documents,
    finalContext,
    structuredContext
  };
}
