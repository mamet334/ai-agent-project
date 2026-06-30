import { eventBus } from '../lib/event/event_bus.ts';

export default {
  name: 'memory_manager',
  description: 'Gunakan ini JIKA pengguna memberikan instruksi atau informasi pribadi yang penting untuk diingat (misal: "Nama saya Budi", "Saya alergi kacang", "Selalu panggil saya Bos"). Tugas Anda mengekstrak fakta tersebut.',
  execute: async ({ task, runLLM, env, userId }) => {
    try {
      if (!userId) return { output: "User ID tidak ditemukan. Tidak bisa menyimpan memori." };

      const extractPrompt = `Anda adalah Spesialis Ekstraksi Memori. User baru saja mengatakan sesuatu.
Tugas Anda: Ekstrak FAKTA INTI atau PREFERENSI PENTING dari ucapan user menjadi JSON murni.
Jika tidak ada fakta penting (hanya basa-basi), balas dengan {"content": "NONE"}.

FORMAT WAJIB (STRICT JSON):
{
  "content": "kalimat pendek yang mendeskripsikan memori",
  "memory_type": "LOCATION" | "PREFERENCE" | "FACT",
  "confidence": 0.99
}

Tugas asli: ${task}`;

      const jsonOutput = await runLLM(extractPrompt, "Hanya kembalikan objek JSON murni.");
      let parsed = { content: 'NONE', memory_type: 'FACT', confidence: 0.9 };
      try {
         parsed = JSON.parse(jsonOutput.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch (e) {
         console.error("Subagent memory_manager gagal parsing JSON:", e);
      }
      
      if (!parsed.content || parsed.content.trim() === 'NONE' || parsed.content.trim().toLowerCase() === 'none') {
        return { output: "Tidak ada memori baru yang perlu disimpan." };
      }

      // Simpan memori melalui Event Bus secara asinkron (Sesuai ADR 11)
      eventBus.emit({
        type: 'Memory.WriteRequested',
        source: 'memory_manager_plugin',
        payload: {
          userId: userId,
          message: parsed.content,
          canWriteMemory: true, // Asumsi tool hanya diizinkan berjalan di Engineer mode (diatur oleh policy)
          mode: 'ENGINEER' // Asumsikan LITE diblok dari mengeksekusi tool ini
        }
      });

      return {
        output: `Permintaan penyimpanan memori dikirim: "${parsed.content}" (${parsed.memory_type})`,
        toolExecution: { name: 'auto_memory_extraction_v1', args: parsed }
      };
    } catch (err) {
      return { output: `Eksekusi memory_manager gagal: ${err}` };
    }
  }
};
