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

      // Kirim ke rag-process untuk dimasukkan ke otak Vektor
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

      if (!supabaseUrl) return { output: "Gagal menyimpan memori: Supabase URL tidak ditemukan." };

      const res = await fetch(`${supabaseUrl}/functions/v1/rag-process`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
          'x-byok-gemini': env.GEMINI_API_KEY || ''
        },
        body: JSON.stringify({
          title: 'Memori Obrolan Otomatis',
          text: extractedFact,
          userId: userId
        })
      });

      if (!res.ok) {
        const err = await res.text();
        return { output: `Gagal menyimpan memori ke Vector DB. Status: ${res.status}. Error: ${err}` };
      }

      return {
        output: `Memori berhasil ditanamkan ke dalam otak Vektor: "${extractedFact}"`,
        toolExecution: { name: 'auto_memory_extraction', args: { fact: extractedFact } }
      };
    } catch (err) {
      return { output: `Eksekusi memory_manager gagal: ${err}` };
    }
  }
};
