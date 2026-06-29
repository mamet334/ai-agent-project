import { RuntimeContext } from '../runtime_context.ts';

export const generateEmbedding = async (text: string, rctx: RuntimeContext): Promise<number[]> => {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${rctx.keys.gemini}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'models/gemini-embedding-2', content: { parts: [{ text }] } })
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.embedding?.values || [];
  } catch (e) {
    console.error("Embedding API failed", e);
    return [];
  }
};
