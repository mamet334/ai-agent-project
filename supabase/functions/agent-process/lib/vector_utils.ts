export function chunkText(text: string, maxLength: number = 4500): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = i + maxLength;
    if (end < text.length) {
      let breakPoint = text.lastIndexOf('\n', end);
      if (breakPoint <= i) breakPoint = text.lastIndexOf('. ', end);
      if (breakPoint > i) {
        end = breakPoint + 1;
      }
    }
    chunks.push(text.substring(i, end).trim());
    i = end;
  }
  return chunks.filter(c => c.length > 0);
}

export async function getGeminiEmbeddingWithRetry(text: string, allKeys: string[], maxRetries = 3): Promise<number[]> {
  let lastError = 'Unknown error';
  let geminiKeyIndex = 0;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    for (let ki = 0; ki < allKeys.length; ki++) {
      const key = allKeys[(geminiKeyIndex + ki) % allKeys.length];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${key}`;
      
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/gemini-embedding-2',
            content: { parts: [{ text }] }
          })
        });

        if (response.ok) {
          geminiKeyIndex = (geminiKeyIndex + ki + 1) % allKeys.length;
          const data = await response.json();
          return data.embedding.values;
        }

        const errText = await response.text();
        lastError = `Status ${response.status}: ${errText}`;
        
        if (response.status === 429) {
          console.warn(`Gemini key #${ki} hit 429, trying next key...`);
          continue;
        }
      } catch (e: any) {
        lastError = e.message || String(e);
      }
    }
    
    if (attempt < maxRetries - 1) {
      const waitMs = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  
  throw new Error(`Gemini Embedding Error: ${lastError}`);
}
