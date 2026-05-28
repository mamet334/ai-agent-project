export default {
  name: 'researcher',
  description: 'Menggunakan penelusuran web (web_search) untuk mencari info aktual, berita terkini, atau referensi online.',
  execute: async ({ task, accumulatedContext, env, runLLM }) => {
    try {
      const subPayload = {
        contents: [{ role: 'user', parts: [{ text: `Cari informasi web mengenai: ${task}\n\nKonteks:\n${accumulatedContext}` }] }],
        tools: [{ googleSearch: {} }]
      };
      const subRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(subPayload)
      });
      const subData = await subRes.json();
      const candidate = subData.candidates?.[0];
      const output = candidate?.content?.parts?.[0]?.text || '';
      
      let sources = [];
      if (candidate?.groundingMetadata?.groundingChunks) {
        sources = candidate.groundingMetadata.groundingChunks
          .map((chunk: any) => ({ title: chunk.web?.title || 'Sumber Web', uri: chunk.web?.uri }))
          .filter((s: any) => s.uri);
      }
      return { output, sources };
    } catch (err) {
      return { output: `Riset gagal: ${err}` };
    }
  }
};
