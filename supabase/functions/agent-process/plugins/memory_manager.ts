import { processAndSaveMemory } from './memory_manager_v1.ts';

export default {
  name: 'memory_manager',
  description: 'Gunakan ini JIKA pengguna memberikan instruksi atau informasi pribadi yang penting untuk diingat (misal: "Nama saya Budi", "Saya alergi kacang", "Selalu panggil saya Bos"). Tugas Anda mengekstrak fakta tersebut.',
  execute: async ({ task, runLLM, env, userId }) => {
    try {
      if (!userId) return { output: "User ID tidak ditemukan. Tidak bisa menyimpan memori." };

      const extractPrompt = `Anda adalah Spesialis Ekstraksi Memori. User baru saja mengatakan sesuatu.
Tugas Anda: Ekstrak FAKTA INTI atau PREFERENSI PENTING dari ucapan user menjadi satu kalimat pendek dan padat.
Jika tidak ada fakta penting (hanya basa-basi), balas dengan "NONE".
Tugas asli: ${task}`;

      const extractedFact = await runLLM(extractPrompt, "Hanya kembalikan kalimat fakta pendek, atau 'NONE'.");
      
      if (!extractedFact || extractedFact.trim() === 'NONE' || extractedFact.trim().toLowerCase() === 'none') {
        return { output: "Tidak ada memori baru yang perlu disimpan." };
      }

      // Simpan langsung ke user_memories V1
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const geminiKey = env.GEMINI_API_KEY || '';
      const groqKey = env.GROQ_API_KEY || '';

      await processAndSaveMemory(extractedFact, "[SUB-AGENT EXPLICIT SAVE]", userId, supabaseUrl, supabaseKey, geminiKey, groqKey);

      return {
        output: `Memori berhasil ditanamkan ke dalam otak Vektor V1 (user_memories): "${extractedFact}"`,
        toolExecution: { name: 'auto_memory_extraction_v1', args: { fact: extractedFact } }
      };
    } catch (err) {
      return { output: `Eksekusi memory_manager gagal: ${err}` };
    }
  }
};
