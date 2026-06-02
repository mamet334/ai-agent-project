import { YoutubeTranscript } from 'https://esm.sh/youtube-transcript@1.2.1';

export default {
  name: 'youtube_analyst',
  description: 'Mengekstrak teks subtitle (Closed Captions) dari video YouTube berdasarkan URL, lalu merangkum isi videonya secara mendetail.',
  execute: async ({ task, runLLM }) => {
    try {
      // 1. Ekstrak URL YouTube dari teks tugas menggunakan Regex
      const urlRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
      const match = task.match(urlRegex);
      
      let cleanedText = "";
      let videoUrl = "Teks Manual";
      let videoId = "manual";

      if (!match) {
        // Jika tidak ada URL tapi teksnya lumayan panjang, asumsikan user menempelkan transkrip manual
        if (task.length > 50) {
          cleanedText = task.substring(0, 30000);
        } else {
          return { output: "Error: Tidak ada Link YouTube valid yang ditemukan, dan teks yang diberikan terlalu pendek untuk dianalisis." };
        }
      } else {
        videoId = match[1];
        videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        // 2. Ambil Transkrip Teks menggunakan package youtube-transcript
        let transcriptText = "";
        try {
          const transcript = await YoutubeTranscript.fetchTranscript(videoId);
          transcriptText = transcript.map(t => t.text).join(' ');
        } catch (err) {
          console.log("youtube-transcript failed, trying Apify fallback...");
          const apifyToken = Deno.env.get("APIFY_API_TOKEN");
          
          if (apifyToken) {
            try {
              // Menggunakan Actor "YouTube Transcript Scraper" di Apify
              // API memanggil Endpoint Sync yang akan menjalankan task dan langsung mengembalikan hasilnya
              const apifyRes = await fetch(`https://api.apify.com/v2/acts/h7vHXaVv4925Xq9c8/run-sync-get-dataset-items?token=${apifyToken}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videoUrls: [videoUrl] })
              });
              
              if (!apifyRes.ok) {
                 throw new Error("Apify API error: " + await apifyRes.text());
              }
              const apifyData = await apifyRes.json();
              
              if (apifyData && apifyData.length > 0) {
                 // Mengambil teks dari respon Apify (bervariasi tergantung actor, biasanya ada di text/transcript/captions)
                 transcriptText = apifyData[0].text || apifyData[0].transcript || JSON.stringify(apifyData[0].captions || apifyData[0]);
              } else {
                 throw new Error("Apify mengembalikan hasil kosong.");
              }
            } catch(apifyErr) {
               return { 
                  output: `Gagal mengekstrak teks dari YouTube. Kedua metode (Gratis & Apify) diblokir.\nError Awal: ${err.message}\nError Apify: ${apifyErr.message}\n\nSARAN: Silakan copy-paste transkrip video secara manual ke obrolan ini.` 
               };
            }
          } else {
            return { 
              output: `Gagal mengekstrak teks dari YouTube. Kemungkinan IP diblokir (CAPTCHA) atau video diproteksi.\nError: ${err.message}\n\n⚠️ SISTEM MENDETEKSI APIFY_API_TOKEN BELUM DISET. Tambahkan token untuk mengaktifkan Bypass Anti-Bot.\nSARAN: Silakan copy-paste transkrip manual atau tambahkan token Apify.` 
            };
          }
        }

        if (!transcriptText || transcriptText.trim().length === 0) {
          return {
            output: `[SISTEM ERROR: GAGAL MENARIK SUBTITLE]\nVideo ini kemungkinan tidak memiliki Subtitle otomatis. JANGAN merangkum apapun!`
          };
        }

        const rawText = transcriptText.replace(/\[.*?\]/g, ' ');
        const taskLower = task.toLowerCase();
        
        // Mode Pintar: Potong teks berdasarkan instruksi untuk mengakali limit token (TPM)
        if (taskLower.includes('depan') || taskLower.includes('awal')) {
          cleanedText = rawText.substring(0, 12000);
        } else if (taskLower.includes('tengah')) {
          const start = Math.max(0, Math.floor(rawText.length / 2) - 6000);
          cleanedText = rawText.substring(start, start + 12000);
        } else if (taskLower.includes('akhir')) {
          const start = Math.max(0, rawText.length - 12000);
          cleanedText = rawText.substring(start);
        } else if (taskLower.includes('seluruhnya') || taskLower.includes('semua')) {
          cleanedText = rawText.substring(0, 30000); // Mode nekat (bisa kena limit)
        } else {
          // Default: Intisari (5000 depan + 5000 belakang) -> Total 10.000 karakter (~2000 token, dijamin aman dari limit Groq/OpenRouter)
          if (rawText.length > 12000) {
            cleanedText = rawText.substring(0, 6000) + "\n\n... [BAGIAN TENGAH DIPOTONG OTOMATIS OLEH MAMET UNTUK MENGHEMAT KUOTA] ...\n\n" + rawText.substring(rawText.length - 6000);
          } else {
            cleanedText = rawText;
          }
        }
      }

      // 3. Masukkan teks kotor ke "Pipeline" LLM untuk disaring & dirangkum
      const prompt = `Anda adalah "YouTube Master Analyst", sebuah AI cerdas yang menguasai 5 disiplin ilmu sekaligus: Strategi Pertumbuhan, SEO YouTube, Scriptwriting Konten, Monetisasi, dan Analisis Kompetitor.

Berikut adalah teks mentah (Subtitle/Transcript) dari video YouTube yang diminta user.
Tugas Spesifik dari User: "${task}"

TEKS MENTAH YOUTUBE:
"${cleanedText}"

INSTRUKSI EKSEKUSI:
1. JIKA user meminta tugas yang sangat spesifik (misal: "Buat artikel blog", "Buat thread Twitter", "Rangkum 2 paragraf"), ABAIKAN kerangka analisis 5 disiplin ilmu dan FOKUS PENUH mengerjakan permintaan spesifik tersebut menggunakan data video.
2. JIKA user meminta analisis secara umum, bedah konten video tersebut secara tajam menggunakan kerangka berikut (gunakan format Markdown yang rapi dan emoji):
   🎯 ANALISIS POTENSI & STRATEGI
   (Target audience, Hook, dan potensi niche)
   🔍 OPTIMASI SEO
   (Rekomendasi Judul Click-Through-Rate tinggi, Keyword, dan Tag)
   ✍️ BEDAH KONTEN & SCRIPT
   (Struktur video, Pacing, dan poin-poin utama)
   💰 POTENSI MONETISASI
   (Peluang sponsor, afiliasi, atau produk digital yang cocok)
   🕵️ KOMPETITOR & DIFERENSIASI
   (Apa yang membuat video ini unik dibanding kompetitor)
3. Jadikan teks mentah YouTube sebagai sumber kebenaran (Source of Truth).
4. Gunakan bahasa Indonesia yang profesional, modern, dan mudah dipahami.`;

      const summary = await runLLM(prompt);

      return {
        output: summary,
        sources: [{ title: 'Video YouTube', uri: videoUrl }],
        toolExecution: {
          name: 'extract_youtube_transcript',
          args: { videoId: videoId, transcript_length: transcriptText.length }
        }
      };

    } catch (err) {
      return { output: `YouTube Analyst Error: ${err.message}` };
    }
  }
};
