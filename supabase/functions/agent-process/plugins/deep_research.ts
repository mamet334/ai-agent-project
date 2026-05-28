export default {
  name: 'deep_research',
  description: 'Melakukan riset mendalam (Deep Research). Mencari referensi di Google, lalu mengunjungi web tersebut untuk membaca seluruh isinya, dan menyusun laporan riset ekstensif.',
  execute: async ({ task, env, runLLM }) => {
    try {
      // 1. Lakukan pencarian Google tahap pertama (mengambil Links)
      const searchPayload = {
        contents: [{ role: 'user', parts: [{ text: `Tolong carikan informasi untuk: ${task}` }] }],
        tools: [{ googleSearch: {} }]
      };
      
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(searchPayload)
      });
      
      const searchData = await res.json();
      const candidate = searchData.candidates?.[0];
      
      let sources = [];
      let urlsToScrape = [];
      
      if (candidate?.groundingMetadata?.groundingChunks) {
        sources = candidate.groundingMetadata.groundingChunks
          .map((chunk: any) => ({ title: chunk.web?.title || 'Sumber Web', uri: chunk.web?.uri }))
          .filter((s: any) => s.uri);
          
        // Ambil maksimal 3 URL teratas untuk di-scrape secara mendalam
        urlsToScrape = sources.map(s => s.uri).slice(0, 3);
      }

      if (urlsToScrape.length === 0) {
        return { 
          output: "Deep Research dibatalkan: Tidak dapat menemukan referensi URL yang valid dari Google.",
          sources: []
        };
      }

      // 2. Kunjungi (Scrape) website-website tersebut secara berantai
      let scrapedContents = "";
      for (let i = 0; i < urlsToScrape.length; i++) {
        const url = urlsToScrape[i];
        try {
          // Fetch raw HTML
          const htmlRes = await fetch(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI-Agent-Deep-Research' } 
          });
          if (!htmlRes.ok) continue;
          
          const htmlText = await htmlRes.text();
          
          // Bersihkan tag HTML (Sangat Sederhana tapi efektif untuk LLM)
          const cleanText = htmlText
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Hapus CSS
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Hapus JS
            .replace(/<[^>]+>/g, ' ') // Hapus semua tag HTML
            .replace(/\s+/g, ' ') // Rapikan spasi
            .trim()
            .substring(0, 5000); // Batasi 5000 karakter per halaman agar tidak Over-Token
            
          scrapedContents += `\n\n--- KONTEN DARI WEB: ${url} ---\n${cleanText}`;
        } catch (e) {
          console.log(`Gagal scrape url ${url}`, e);
        }
      }

      // 3. Sintesis laporan akhir menggunakan LLM berdasarkan teks yang sudah di-scrape
      const synthesisPrompt = `Anda adalah seorang Analis Riset Senior. Tugas Anda adalah membuat Laporan Makalah Riset yang sangat mendalam dan profesional.
Topik Riset: ${task}

Berikut adalah data mentah hasil kunjungan robot kami ke beberapa website:
${scrapedContents}

Instruksi:
1. Bacalah seluruh teks mentah di atas.
2. Ekstrak fakta, data numerik, opini, atau argumen kunci.
3. Susun menjadi laporan terstruktur (Gunakan Heading Markdown, Bullet points, dll).
4. Jika datanya mendukung, buatlah tabel perbandingan.
5. Berikan kesimpulan akhir yang tajam.`;

      const finalOutput = await runLLM(synthesisPrompt);

      return { 
        output: finalOutput, 
        sources: sources,
        toolExecution: {
          name: 'deep_web_scraping',
          args: { urls: urlsToScrape }
        }
      };
    } catch (err) {
      return { output: `Deep Research Error: ${err.message}` };
    }
  }
};
