export function buildContextFusion({ memoryArray = [], ragArray = [], message = '', basePrompts = '' }) {
  // STRICT SCORING GATE: Only items with valid numeric scores are allowed
  const allContexts = [
    ...memoryArray.map(m => ({ ...m, priorityType: 3, totalWeight: m.score * 3, content: m.content || m.summary || '' })),
    ...ragArray.map(r => ({ ...r, priorityType: 2, totalWeight: r.score * 2, content: r.content || '' }))
  ].filter(c => typeof c.totalWeight === 'number' && !isNaN(c.totalWeight) && c.content.trim() !== '');

  // Ranking absolut berdasarkan kombinasi bobot dan skor dinamis
  allContexts.sort((a, b) => b.totalWeight - a.totalWeight);

  // Seleksi TOP-K yang paling relevan (k = 7)
  const topKContexts = allContexts.slice(0, 7);

  // Filter duplicate substring if needed inside topK
  const finalMemory = [];
  const finalRag = [];
  const seenContent = new Set();
  let currentChars = basePrompts.length;

  for (const item of topKContexts) {
    const lower = item.content.toLowerCase();
    
    let isConflict = false;
    for (const seen of seenContent) {
      if (lower.includes(seen) || seen.includes(lower)) {
        isConflict = true;
        break;
      }
    }

    if (!isConflict) {
      if (currentChars + item.content.length > 8000) continue;
      
      if (item.priorityType === 3) {
        finalMemory.push(item);
      } else {
        finalRag.push(item);
      }
      seenContent.add(lower);
      currentChars += item.content.length;
    }
  }

  // 3. Build Final Context String
  let finalContext = basePrompts;
  
  if (finalMemory.length > 0) {
    finalContext += '\n\n[MEMORY - PRIORITY 3]\n';
    finalContext += finalMemory.map(m => `- ${m.content}`).join('\n');
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
