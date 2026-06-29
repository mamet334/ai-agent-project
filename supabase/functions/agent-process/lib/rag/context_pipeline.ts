import { RuntimeContext } from '../runtime_context.ts';

export interface ContextPipelineParams {
  memoryArray: any[];
  ragArray: any[];
  message: string;
  agentIdentityPrompt: string;
  userContextPrompt: string;
  memoryPrompt: string;
  engineerContextPrompt: string;
  webHint?: string;
  mode: string;
  ragTopK: number;
}

export interface ContextPipelineResult {
  memory: any[];
  rag: any[];
  finalContext: string;
  structuredContext: any;
}

function buildStructuredContext(params: ContextPipelineParams) {
  let basePrompts = params.agentIdentityPrompt + params.userContextPrompt + params.memoryPrompt + params.engineerContextPrompt;
  if (params.webHint === "HIGH_PRIORITY") {
    basePrompts += `\n[WEB vs RAG COMPARISON CONTRACT]: Jika terdapat perbedaan antara dokumen RAG internal dan Web/Internet, identifikasi mana yang lebih baru secara eksplisit.`;
  }

  // 1. Process Memory
  const finalMemory: any[] = [];
  const seenContent = new Set<string>();
  let currentCharsMemory = basePrompts.length;

  const validMemory = (params.memoryArray || [])
    .map(m => ({ ...m, content: m.content || m.summary || '', memory_state: m.memory_state || 'ACTIVE' }))
    .filter(m => m.content.trim() !== '');

  for (const item of validMemory) {
    const lower = item.content.toLowerCase();
    if (!seenContent.has(lower)) {
      if (currentCharsMemory + item.content.length <= 10000) {
        finalMemory.push(item);
        seenContent.add(lower);
        currentCharsMemory += item.content.length;
      }
    }
  }

  // 2. Process RAG
  const finalRag: any[] = [];
  let currentCharsRag = currentCharsMemory;
  const validRag = (params.ragArray || [])
    .map(r => ({ ...r, content: r.content || '' }))
    .filter(r => r.content.trim() !== '');

  for (const item of validRag) {
    const lower = item.content.toLowerCase();
    if (!seenContent.has(lower)) {
      if (currentCharsRag + item.content.length <= 15000) {
        finalRag.push(item);
        seenContent.add(lower);
        currentCharsRag += item.content.length;
      }
    }
  }

  return {
    basePrompts,
    memory: { items: finalMemory },
    rag: { documents: finalRag },
    user: { intent: params.message ? params.message.substring(0, 100) : 'unknown' },
    execution: { mode: params.mode || 'UNKNOWN', ragTopK: params.ragTopK ?? finalRag.length }
  };
}

function buildFinalPrompt(structuredContext: any): string {
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

export function buildContextPipeline(params: ContextPipelineParams, rctx: RuntimeContext): ContextPipelineResult {
  const structuredContext = buildStructuredContext(params);
  const finalContext = buildFinalPrompt(structuredContext);
  
  if (rctx.logger && typeof rctx.logger === 'object') {
      // Allow for potential logging through rctx.logger if needed in future
  }

  return {
    memory: structuredContext.memory.items,
    rag: structuredContext.rag.documents,
    finalContext,
    structuredContext
  };
}
