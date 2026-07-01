import { runLLM } from '../llm_orchestrator.ts';

export async function compressChatHistory(history: any[], rctx: any): Promise<any[]> {
  if (!history || history.length === 0) return history;
  
  // Hitung perkiraan panjang string dari history
  const totalLength = history.reduce((acc, msg) => acc + (msg.content?.length || 0), 0);
  
  // Jika panjang total masih aman (< 4000 karakter, sekitar 1000 token), biarkan saja
  if (totalLength < 4000 || history.length <= 2) {
    return history;
  }

  console.log(`[CognitiveMemoryCompressor] History size is ${totalLength} chars across ${history.length} messages. Triggering autonomous compression...`);

  // Kita biarkan 2 pesan terakhir tetap utuh agar konteks percakapan langsung tetap tajam
  const messagesToCompress = history.slice(0, history.length - 2);
  const recentMessages = history.slice(history.length - 2);
  
  const historyText = messagesToCompress.map((m, i) => `[Turn ${i+1} - ${m.role}]: ${m.content}`).join('\n\n');
  
  const prompt = `Anda adalah Cognitive Memory Compressor untuk Mamet OS.
Tugas Anda adalah merangkum transkrip percakapan masa lalu (dibawah) menjadi SATU pesan ringkasan yang padat, akurat, dan mempertahankan seluruh fakta, keputusan, serta tindakan penting.
Hilangkan obrolan basa-basi, salam, dan laporan eksekusi OS yang panjang. Fokus pada esensi percakapan.

TRANSKRIP PERCAKAPAN:
${historyText}

Tuliskan ringkasan Anda secara langsung tanpa kalimat pengantar. (Maksimal 1-2 paragraf).`;

  try {
    const compressedText = await runLLM(prompt, "System: Compress the context.", [], rctx);
    console.log(`[CognitiveMemoryCompressor] Compression successful. New length: ${compressedText.length} chars.`);
    
    // Gabungkan pesan ringkasan dengan 2 pesan terbaru
    return [
      { role: 'model', content: `[COGNITIVE MEMORY COMPRESSION ACTIVE]\n(Percakapan sebelumnya telah disusutkan menjadi ringkasan berikut untuk menghemat memori):\n\n${compressedText}` },
      ...recentMessages
    ];
  } catch (error) {
    console.warn(`[CognitiveMemoryCompressor] Compression failed, falling back to original history. Error:`, error);
    // Jika gagal, potong paksa secara kasar
    if (totalLength > 10000) {
      return [
        { role: 'system', content: '[WARNING: History truncated due to size limits]' },
        ...history.slice(-4)
      ];
    }
    return history;
  }
}
