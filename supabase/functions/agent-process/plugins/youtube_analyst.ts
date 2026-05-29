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
      const prompt = `Anda adalah seorang YouTube Content Analyst & Creative Writer. 
Berikut adalah hasil ekstraksi teks mentah (Subtitle) dari sebuah video YouTube. Teks ini mungkin mengandung banyak typo atau kalimat terpotong.

Tugas Spesifik dari User: "${task}"

TEKS MENTAH YOUTUBE:
"${cleanedText}"

Instruksi Anda:
1. Pahami isi Teks Mentah Youtube di atas. Abaikan salah ketik.
2. KERJAKAN Tugas Spesifik dari User dengan sempurna. Jika user meminta merangkum, buatlah rangkuman. Jika user meminta dibuatkan Naskah TikTok, Artikel SEO, atau Skrip Video, buatkan sesuai gaya bahasa yang cocok untuk format tersebut.
3. Gunakan data dari Teks Mentah YouTube sebagai sumber kebenaran (source of truth).
4. PENTING: Jika Teks Mentah kosong atau isinya sama sekali tidak berhubungan dengan konteks wajar, beri tahu user bahwa video tidak memiliki teks yang valid.`;

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
