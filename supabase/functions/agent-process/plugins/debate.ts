export default {
  name: 'debate',
  description: 'Sub-agent khusus untuk Mode Diskusi. Memicu perdebatan 2 putaran antara "Agent Logika" dan "Agent Bahasa/Kritikus" untuk mencari solusi paling mutakhir dari masalah yang sangat rumit.',
  execute: async ({ task, accumulatedContext, runLLM }) => {
    try {
      let debateLog = '';

      // Putaran 1: Logika menyusun solusi
      const logikaPrompt = `Anda adalah Ahli Logika. Berdasarkan masalah berikut, susun solusi awal yang sangat rasional, langkah demi langkah.\nMasalah: ${task}\nKonteks: ${accumulatedContext}`;
      const logikaRound1 = await runLLM(logikaPrompt, '');
      debateLog += `🗣️ **Ahli Logika (Putaran 1):**\n${logikaRound1}\n\n`;

      // Putaran 2: Bahasa mengkritik
      const bahasaPrompt = `Anda adalah Kritikus Kritis (Ahli Bahasa & Logika Terbalik). Kritik solusi dari Ahli Logika berikut ini. Cari celah, kelemahan, asumsi yang salah, atau ketidakjelasan.\nSolusi Ahli Logika: ${logikaRound1}`;
      const bahasaRound1 = await runLLM(bahasaPrompt, '');
      debateLog += `🕵️ **Kritikus (Putaran 1):**\n${bahasaRound1}\n\n`;

      // Putaran 3: Logika memperbaiki
      const logikaRefinePrompt = `Anda adalah Ahli Logika. Anda baru saja dikritik oleh Kritikus. Perbaiki solusi awal Anda untuk menyempurnakannya berdasarkan kritik berikut.\nKritik: ${bahasaRound1}\nSolusi Lama Anda: ${logikaRound1}`;
      const logikaRound2 = await runLLM(logikaRefinePrompt, '');
      debateLog += `🗣️ **Ahli Logika (Final):**\n${logikaRound2}\n\n`;

      // Putaran 4: Kesimpulan
      return {
        output: `Perdebatan Selesai.\n\n${debateLog}`,
        toolExecution: { name: 'agent_debate_loop', args: { rounds: 2 } }
      };
    } catch (err) {
      return { output: `Debat gagal: ${err}` };
    }
  }
};
