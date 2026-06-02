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
          console.log("youtube-transcript failed, trying Apify fallback...", err.message);
          const apifyToken = Deno.env.get("APIFY_API_TOKEN");
          
          if (apifyToken) {
            try {
              // Timeout 50 detik agar tidak melebihi batas Edge Function
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 50000);
              
              // Menggunakan Actor "supreme_coder/youtube-transcript-scraper" di Apify
              const apifyRes = await fetch(`https://api.apify.com/v2/acts/supreme_coder~youtube-transcript-scraper/run-sync-get-dataset-items?token=${apifyToken}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                  urls: [{ url: videoUrl }],
                  languages: ["id", "en", "auto"]
                }),
                signal: controller.signal
              });
              clearTimeout(timeout);
              
              if (!apifyRes.ok) {
                 throw new Error("Apify API error: " + await apifyRes.text());
              }
              const apifyData = await apifyRes.json();
              
              if (apifyData && apifyData.length > 0) {
                 if (apifyData[0].errorCode || apifyData[0].error) {
                    throw new Error(apifyData[0].error || "Transkrip tidak ditemukan");
                 }
                 const item = apifyData[0];
                 if (typeof item.text === 'string' && item.text.length > 0) {
                    transcriptText = item.text;
                 } else if (typeof item.transcript === 'string' && item.transcript.length > 0) {
                    transcriptText = item.transcript;
                 } else if (Array.isArray(item.captions)) {
                    transcriptText = item.captions.map(c => typeof c === 'string' ? c : (c.text || c.content || '')).join(' ');
                 } else if (Array.isArray(item.text)) {
                    transcriptText = item.text.map(t => typeof t === 'string' ? t : (t.text || t.content || '')).join(' ');
                 } else if (Array.isArray(item.transcript)) {
                    transcriptText = item.transcript.map(t => typeof t === 'string' ? t : (t.text || t.content || '')).join(' ');
                 } else {
                    const { videoDetails, ...rest } = item;
                    transcriptText = JSON.stringify(rest);
                 }
              } else {
                 throw new Error("Apify mengembalikan hasil kosong.");
              }
            } catch(apifyErr) {
               const timeoutMsg = apifyErr.name === 'AbortError' ? ' (Timeout 50 detik)' : '';
               return { 
                  output: `⚠️ Gagal mengekstrak teks dari YouTube.\n\n**Metode 1 (Gratis):** ${err.message}\n**Metode 2 (Apify):** ${apifyErr.message}${timeoutMsg}\n\nKemungkinan penyebab:\n- Video tidak memiliki subtitle (manual maupun auto-generated)\n- YouTube memblokir IP server\n- Koneksi ke Apify timeout\n\n💡 **SARAN:** Copy-paste transkrip video secara manual ke chat ini, dan saya akan menganalisisnya!` 
               };
            }
          } else {
            return { 
              output: `Gagal mengekstrak teks dari YouTube. Kemungkinan IP diblokir (CAPTCHA) atau video diproteksi.\nError: ${err.message}\n\n⚠️ SISTEM MENDETEKSI APIFY_API_TOKEN BELUM DISET. Tambahkan token untuk mengaktifkan Bypass Anti-Bot.\nSARAN: Silakan copy-paste transkrip manual atau tambahkan token Apify.` 
            };
          }
        }

        transcriptText = String(transcriptText || "");
        if (transcriptText.trim().length === 0) {
          return {
            output: `[SISTEM ERROR: GAGAL MENARIK SUBTITLE]\nVideo ini kemungkinan tidak memiliki Subtitle otomatis. JANGAN merangkum apapun!`
          };
        }

        const rawText = transcriptText.replace(/\[.*?\]/g, ' ');
        const taskLower = task.toLowerCase();
        
        // Mode Pintar: Potong teks berdasarkan instruksi untuk mengakali limit token (TPM)
        // Groq Free Tier = 6000 TPM. Kita batasi transkrip maks 4000 karakter (~1000 token) untuk keamanan penuh.
        if (taskLower.includes('depan') || taskLower.includes('awal')) {
          cleanedText = rawText.substring(0, 4000);
        } else if (taskLower.includes('tengah')) {
          const start = Math.max(0, Math.floor(rawText.length / 2) - 2000);
          cleanedText = rawText.substring(start, start + 4000);
        } else if (taskLower.includes('akhir')) {
          const start = Math.max(0, rawText.length - 4000);
          cleanedText = rawText.substring(start);
        } else if (taskLower.includes('seluruhnya') || taskLower.includes('semua')) {
          cleanedText = rawText.substring(0, 8000);
        } else {
          // Default: Intisari (2000 depan + 2000 belakang) → Total 4000 karakter (~1000 token, aman untuk Groq Free)
          if (rawText.length > 4000) {
            cleanedText = rawText.substring(0, 2000) + "\n\n... [BAGIAN TENGAH DIPOTONG OTOMATIS OLEH MAMET UNTUK MENGHEMAT KUOTA] ...\n\n" + rawText.substring(rawText.length - 2000);
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
4. Gunakan bahasa Indonesia yang profesional, modern, dan mudah dipahami.
5. JIKA Anda diminta menampilkan teks/transkrip/lirik lengkap, tuliskan teks tersebut secara langsung sebagai paragraf biasa yang rapi dengan baris baru (line break) yang wajar (misal per kalimat atau bait lagu). DILARANG menggunakan blok kode (markdown code block \`\`\`) untuk menampilkan lirik/transkrip agar tidak sulit dibaca oleh user.`;

      const summary = await runLLM(prompt);

      return {
        output: summary,
        sources: [{ title: 'Video YouTube', uri: videoUrl }],
        toolExecution: {
          name: 'extract_youtube_transcript',
          args: { videoId: videoId, transcript_length: cleanedText.length }
        }
      };

    } catch (err) {
      return { output: `YouTube Analyst Error: ${err.message}` };
    }
  }
};
