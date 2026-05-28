export default {
  name: 'coder',
  description: 'Eksekusi kode pemrograman (Node.js/JavaScript atau Python) secara aman di Dockerized Sandbox. Sangat cocok untuk kalkulasi, parsing data, atau algoritma kompleks.',
  execute: async ({ task, accumulatedContext, runLLM }) => {
    try {
      const coderPrompt = `Anda adalah CODER spesialis. Tugas Anda: ${task}
Kembalikan HANYA kode tanpa penjelasan. Anda bebas memilih bahasa: JavaScript (Node.js) ATAU Python.
Bungkus kode di dalam blok \`\`\`javascript atau \`\`\`python.
PENTING: Gunakan perintah cetak (seperti console.log() atau print()) untuk menampilkan hasil akhir pekerjaan Anda, karena lingkungan sandbox ini hanya menangkap stdout/output cetak.`;

      let codeOutput = await runLLM(`Konteks Tugas:\n${accumulatedContext}\nSelesaikan.`, coderPrompt);
      
      // Deteksi bahasa
      let lang = 'javascript';
      let version = '18.15.0';
      if (codeOutput.includes('```python')) {
        lang = 'python';
        version = '3.10.0';
      }

      const match = codeOutput.match(/```(?:javascript|js|python)([\s\S]*?)```/) || [null, codeOutput];
      const cleanCode = (match[1] || codeOutput).trim();

      let executionResult = '';
      try {
        // Mengirim kode ke Piston API (Dockerized Sandbox)
        const pistonRes = await fetch('https://emkc.org/api/v2/piston/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: lang,
            version: version,
            files: [{ content: cleanCode }]
          })
        });

        if (!pistonRes.ok) {
          throw new Error(`Piston API Error: ${pistonRes.status}`);
        }

        const data = await pistonRes.json();
        
        if (data.run && data.run.output) {
          executionResult = data.run.output.trim() || 'Berhasil dijalankan, tapi tidak ada output cetak (stdout).';
        } else if (data.message) {
          executionResult = `Error Eksekusi Piston: ${data.message}`;
        } else {
          executionResult = 'Tidak ada respons dari Sandbox.';
        }
      } catch(e) {
        executionResult = 'Error pengiriman ke Sandbox: ' + e.message;
      }
      
      return {
        output: `Menjalankan Kode (${lang}):\n\`\`\`${lang}\n${cleanCode}\n\`\`\`\n\nOutput Eksekusi Sandbox:\n${executionResult}`,
        toolExecution: { name: 'docker_sandbox_execution', args: { language: lang, code: cleanCode } }
      };
    } catch (err) {
      return { output: `Eksekusi coder gagal: ${err}` };
    }
  }
};
