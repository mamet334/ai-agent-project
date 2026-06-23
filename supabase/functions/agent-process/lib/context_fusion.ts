export function buildContextFusion({ memoryArray = [], ragArray = [], message = '', basePrompts = '' }) {
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

  // 3. Build Final Context String
  let finalContext = basePrompts;
  
  if (finalMemory.length > 0) {
    finalContext += '\n\n[MEMORY - PRIORITY 3]\n';
    finalContext += finalMemory.map(m => {
       const stateTag = m.memory_state === 'HISTORICAL' ? '[HISTORICAL] ' : '';
       return `- ${stateTag}${m.content}`;
    }).join('\n');
  }

  if (finalRag.length > 0) {
    finalContext += '\n\n[RAG - PRIORITY 2]\nBerikut adalah data dokumen milik user. JIKA RELEVAN dengan pertanyaan user, gunakan data ini. Jika tidak relevan, abaikan saja:\n';
    finalContext += finalRag.map(r => `- ${r.content}`).join('\n');
  }

  if (finalMemory.length > 0 && finalRag.length > 0) {
    finalContext += '\n\n[FINAL RULE]\n- Always prioritize memory over RAG for user preferences or facts. Jika ada kontradiksi antara RAG dan MEMORY, ikuti MEMORY.\n';
  }

  return {
    memory: finalMemory,
    rag: finalRag,
    finalContext
  };
}
