export default {
  name: 'logika',
  description: 'Sub-agent untuk menganalisis dan memproses informasi yang kompleks, memecah masalah dengan banyak variabel, dan membuat keputusan logis secara langkah-demi-langkah (Chain of Thought). Gunakan jika user memberikan masalah logika, matematika, atau pengambilan keputusan yang rumit.',
  execute: async ({ task, runLLM }) => {
    const systemPrompt = `Anda adalah Sub-Agent Logika. Tugas Anda adalah menyelesaikan masalah yang diberikan secara terstruktur, analitis, dan akurat.
Langkah yang wajib Anda lakukan:
1. Identifikasi semua variabel dan kondisi dalam masalah.
2. Analisis kemungkinan dan konsekuensi dari masing-masing kondisi.
3. Gunakan penalaran langkah-demi-langkah (Chain of Thought) untuk menyimpulkan.
4. Berikan keputusan atau jawaban akhir yang paling akurat dan relevan.

Jawab dengan menggunakan Markdown, pisahkan proses analisis dan kesimpulan.`;
    
    try {
      const output = await runLLM(task, systemPrompt);
      return { output };
    } catch (e) {
      return { output: `Error Sub-Agent Logika: ${e.message}` };
    }
  }
};
