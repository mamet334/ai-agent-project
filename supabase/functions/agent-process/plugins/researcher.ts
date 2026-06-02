export default {
  name: 'researcher',
  description: 'Menggunakan penelusuran web (web_search) untuk mencari info aktual, berita terkini, atau referensi online.',
  execute: async ({ task, cleanTask, accumulatedContext, env, runLLM }) => {
    try {
      const query = cleanTask || task;
      const subPayload = {
        contents: [{ role: 'user', parts: [{ text: `Cari informasi web mengenai: ${query}\n\nKonteks:\n${accumulatedContext}` }] }],
        tools: [{ googleSearch: {} }]
      };
      const keys = env.allGeminiKeys && env.allGeminiKeys.length > 0
        ? env.allGeminiKeys
        : [env.GEMINI_API_KEY];

      let lastError = null;
      for (const key of keys) {
        try {
          const subRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(subPayload)
          });
          const subData = await subRes.json();
          if (subData.error) {
            lastError = subData.error;
            console.warn(`Researcher key rotation warning: ${subData.error.message}, trying next key...`);
            continue;
          }
          const candidate = subData.candidates?.[0];
          const output = candidate?.content?.parts?.[0]?.text || '';
          
          let sources = [];
          if (candidate?.groundingMetadata?.groundingChunks) {
            sources = candidate.groundingMetadata.groundingChunks
              .map((chunk: any) => ({ title: chunk.web?.title || 'Sumber Web', uri: chunk.web?.uri }))
              .filter((s: any) => s.uri);
          }
          return { output, sources };
        } catch (e: any) {
          lastError = e;
          console.warn(`Researcher key rotation network error:`, e);
        }
      }
      return { output: `Riset gagal: Semua Gemini API key habis kuota atau error. (${lastError?.message || lastError})` };
    } catch (err) {
      return { output: `Riset gagal: ${err}` };
    }
  }
};
