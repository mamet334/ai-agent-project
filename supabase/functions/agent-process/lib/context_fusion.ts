export function buildStructuredContext({ memoryArray = [], ragArray = [], message = '', basePrompts = '', ctx = null }) {
  // 1. Process Memory (ALWAYS INJECTED / NON-COMPETITIVE)
  const finalMemory = [];
  const seenContent = new Set();
  let currentChars = basePrompts.length;

  const validMemory = memoryArray
    .map(m => ({ ...m, content: m.content || m.summary || '' }))
    .filter(m => m.content.trim() !== '');

  for (const item of validMemory) {
    const lower = item.content.toLowerCase();
    let isConflict = false;
    for (const seen of seenContent) {
      if (lower.includes(seen) || seen.includes(lower)) {
        isConflict = true;
        break;
      }
    }
    if (!isConflict) {
      if (currentChars + item.content.length > 10000) break; // Emergency safety cap
      finalMemory.push(item);
      seenContent.add(lower);
      currentChars += item.content.length;
    }
  }

  // 2. Process RAG (APPENDED WITHOUT COMPETING FOR SLOTS)
  const finalRag = [];
  const validRag = ragArray
    .map(r => ({ ...r, content: r.content || '' }))
    .filter(r => r.content.trim() !== '');

  for (const item of validRag) {
    const lower = item.content.toLowerCase();
    let isConflict = false;
    
    // Cegah RAG mengulang fakta yang sudah ada di Memory
    for (const seen of seenContent) {
      if (lower.includes(seen) || seen.includes(lower)) {
        isConflict = true;
        break;
      }
    }
    
    if (!isConflict) {
      if (currentChars + item.content.length > 15000) break; // Secondary safety cap
      finalRag.push(item);
      seenContent.add(lower);
      currentChars += item.content.length;
    }
  }

  const structuredContext = {
    basePrompts,
    memory: {
      items: finalMemory,
      summary: finalMemory.length > 0 ? `${finalMemory.length} memory items retrieved.` : null
    },
    rag: {
      documents: finalRag,
      summary: finalRag.length > 0 ? `${finalRag.length} document chunks retrieved.` : null
    },
    user: {
      intent: message ? message.substring(0, 100) : 'unknown',
      riskFlags: ctx ? Object.keys(ctx.security).filter(k => k.includes('Risk') && ctx.security[k]) : []
    },
    execution: {
      mode: ctx ? ctx.mode : 'UNKNOWN',
      ragTopK: ctx ? ctx.rag.topK : finalRag.length
    }
  };

  return structuredContext;
}

export function buildFinalPrompt(structuredContext) {
  if (!structuredContext) return '';

  let finalContext = structuredContext.basePrompts || '';

  if (structuredContext.memory && structuredContext.memory.items.length > 0) {
    finalContext += '\n\n[MEMORY CONTEXT]\n';
    finalContext += structuredContext.memory.items.map(m => {
       const stateTag = m.memory_state === 'HISTORICAL' ? '[HISTORICAL] ' : '';
       return `- ${stateTag}${m.content}`;
    }).join('\n');
  }

  if (structuredContext.rag && structuredContext.rag.documents.length > 0) {
    finalContext += '\n\n[RAG CONTEXT]\nBerikut adalah data dokumen milik user. JIKA RELEVAN dengan pertanyaan user, gunakan data ini. Jika tidak relevan, abaikan saja:\n';
    finalContext += structuredContext.rag.documents.map(r => `- ${r.content}`).join('\n');
  }

  // EXECUTION CONTEXT TRACE
  if (structuredContext.execution && structuredContext.execution.mode !== 'UNKNOWN') {
    finalContext += `\n\n[EXECUTION CONTEXT]\nmode: ${structuredContext.execution.mode}\nragTopK: ${structuredContext.execution.ragTopK}\n`;
  }

  if (structuredContext.memory && structuredContext.memory.items.length > 0 && 
      structuredContext.rag && structuredContext.rag.documents.length > 0) {
    finalContext += '\n\n[INSTRUCTION BLOCK]\n- Memory has higher priority than RAG for user preferences or facts.\n- Resolve contradictions deterministically (ikuti MEMORY).\n';
  }

  return finalContext;
}

// Backward-compatible wrapper
export function buildContextFusion(args) {
  const structuredContext = buildStructuredContext(args);
  const finalContext = buildFinalPrompt(structuredContext);

  return {
    memory: structuredContext.memory.items,
    rag: structuredContext.rag.documents,
    finalContext,
    structuredContext
  };
}
