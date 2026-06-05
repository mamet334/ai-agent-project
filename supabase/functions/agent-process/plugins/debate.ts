export default {
  name: 'debate',
  description: 'BOARD OF DIRECTORS SIMULATOR: Memanggil 3 persona AI (CEO, CFO, CTO) secara serentak untuk berdebat dan membedah suatu ide/masalah bisnis dari berbagai sudut pandang (Visi, Risiko Keuangan, dan Inovasi Teknologi), lalu memberikan Keputusan Bisnis Final.',
  execute: async ({ task, accumulatedContext, runLLM }) => {
    try {
      const topic = `Topik Diskusi: ${task}\nKonteks Tambahan: ${accumulatedContext}`;
      
      // 3 Persona dipanggil secara PARALEL untuk menghemat waktu
      const [ceoResponse, cfoResponse, ctoResponse] = await Promise.all([
        runLLM(
          `Bahas topik berikut dari sudut pandang seorang CEO (Chief Executive Officer) yang visioner.\nFokus pada ekspansi, strategi pasar, kepemimpinan, dan gambaran besar.\n\n${topic}`, 
          "Anda adalah CEO yang ambisius dan visioner."
        ),
        runLLM(
          `Bahas topik berikut dari sudut pandang seorang CFO (Chief Financial Officer) & Risk Manager yang pesimis dan sangat hati-hati.\nFokus pada risiko finansial, efisiensi biaya, potensi kerugian, dan ancaman regulasi.\n\n${topic}`, 
          "Anda adalah CFO yang sangat pelit, analitis, dan selalu waspada akan risiko."
        ),
        runLLM(
          `Bahas topik berikut dari sudut pandang seorang CTO (Chief Technology Officer) yang gila inovasi.\nFokus pada implementasi teknologi terbaru, efisiensi sistem, AI, dan skalabilitas.\n\n${topic}`, 
          "Anda adalah CTO jenius yang terobsesi dengan teknologi modern."
        )
      ]);

      const debateLog = `
👔 **CEO (Visi & Strategi):**
${ceoResponse}

💼 **CFO (Risiko & Keuangan):**
${cfoResponse}

💻 **CTO (Teknologi & Inovasi):**
${ctoResponse}
`;

      // Chairman (Penyimpul) dipanggil setelah ketiganya selesai
      const chairmanPrompt = `Anda adalah "Chairman of the Board". Berikut adalah pendapat dari 3 direktur Anda (CEO, CFO, CTO) mengenai ide/masalah yang diajukan:

${debateLog}

TUGAS ANDA:
1. Rangkum perdebatan ini.
2. Cari titik temu atau kompromi dari ketiga sudut pandang tersebut.
3. Berikan KEPUTUSAN FINAL (GO / NO-GO) beserta langkah konkret yang harus diambil.`;

      const chairmanResponse = await runLLM(chairmanPrompt, "Anda adalah Chairman yang bijaksana dan tegas pembuat keputusan.");

      return {
        output: `## 🏛️ Rapat Dewan Direksi (Board of Directors)\n${debateLog}\n\n---\n## ⚖️ **KEPUTUSAN FINAL (CHAIRMAN)**\n${chairmanResponse}`,
        toolExecution: { name: 'board_of_directors_simulation', args: { personas: ['CEO', 'CFO', 'CTO'] } }
      };
    } catch (err) {
      return { output: `Rapat Direksi gagal: ${err}` };
    }
  }
};
