import { YoutubeTranscript } from 'https://esm.sh/youtube-transcript@1.2.1';

export default {
  name: 'youtube_analyst',
  description: 'Mengekstrak teks subtitle (Closed Captions) dari video YouTube berdasarkan URL, lalu merangkum isi videonya secara mendetail.',
  execute: async ({ task, runLLM }) => {
    try {
      // 1. Ekstrak URL YouTube dari teks tugas menggunakan Regex
      const urlRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
      const match = task.match(urlRegex);
      
      if (!match) {
        return { output: "Error: Tidak ada Link YouTube valid yang ditemukan di dalam permintaan Anda." };
      }

      const videoId = match[1];
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      
      // 2. Ambil Transkrip Teks menggunakan package youtube-transcript
      let transcriptText = "";
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        // Gabungkan semua teks dari detik ke detik
        transcriptText = transcript.map(t => t.text).join(' ');
      } catch (err) {
        return { 
          output: `Gagal mengekstrak teks dari YouTube. Kemungkinan video ini tidak memiliki Subtitle (Closed Captions) atau diproteksi oleh pembuatnya. Error: ${err.message}` 
        };
      }

      if (!transcriptText || transcriptText.trim().length === 0) {
        return {
          output: `[SISTEM ERROR: GAGAL MENARIK SUBTITLE]\nVideo ini (ID: ${videoId}) kemungkinan besar tidak memiliki Subtitle otomatis yang diaktifkan oleh kreatornya. JANGAN merangkum apapun, langsung beri tahu pengguna bahwa videonya tidak dapat diakses teksnya.`
        };
      }

      // Bersihkan teks (hapus jeda seperti [Musik], dll jika perlu, walau LLM sudah cukup pintar)
      let cleanedText = transcriptText.replace(/\[.*?\]/g, ' ').substring(0, 30000); // Batasi max karakter
      
      if (cleanedText.trim().length === 0) {
        return {
          output: `[SISTEM ERROR: GAGAL MENARIK SUBTITLE]\nVideo ini (ID: ${videoId}) kemungkinan hanya berisi musik tanpa teks yang bisa dibaca. JANGAN merangkum apapun!`
        };
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
