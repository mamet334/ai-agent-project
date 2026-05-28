export default {
  name: 'coder',
  description: 'Eksekusi kode JS (code_executor) untuk perhitungan atau logika.',
  execute: async ({ task, accumulatedContext, runLLM }) => {
    try {
      const coderPrompt = `Anda adalah CODER. Tugas: ${task}\nKembalikan HANYA kode JavaScript murni tanpa penjelasan. Agar tidak terjadi error syntax, gunakan 'console.log()' untuk mencetak hasil akhir, dan JANGAN gunakan return statement di luar function.`;
      let codeOutput = await runLLM(`Konteks:\n${accumulatedContext}\nSelesaikan.`, coderPrompt);
      const match = codeOutput.match(/```(?:javascript|js)([\s\S]*?)```/) || [null, codeOutput];
      const cleanCode = (match[1] || codeOutput).trim();

      let executionResult = '';
      try {
        const logs: string[] = [];
        const fakeConsole = {
          log: (...args: any[]) => logs.push(args.join(' ')),
          error: (...args: any[]) => logs.push('ERROR: ' + args.join(' '))
        };
        
        const fn = new Function('console', `
          try {
            ${cleanCode}
          } catch(e) {
            console.error(e.message);
          }
        `);
        
        fn(fakeConsole);
        executionResult = logs.length > 0 ? logs.join('\\n') : 'Tidak ada output. Pastikan menggunakan console.log()';
      } catch(e) {
        executionResult = 'Error eksekusi syntax: ' + e;
      }
      
      return {
        output: `Menjalankan Kode:\n\`\`\`javascript\n${cleanCode}\n\`\`\`\n\nOutput:\n${executionResult}`,
        toolExecution: { name: 'execute_javascript', args: { code: cleanCode } }
      };
    } catch (err) {
      return { output: `Eksekusi coder gagal: ${err}` };
    }
  }
};
