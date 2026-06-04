export default {
  name: 'file_analyzer',
  description: 'Membaca, menganalisis, dan memeriksa file/folder di dalam Workspace lokal user (yang sudah diizinkan). Cocok untuk memeriksa isi file, mencari pola, menganalisis kode, atau merangkum dokumen di folder kerja user.',
  execute: async ({ task, accumulatedContext, runLLM }) => {
    try {
      // Cari konten workspace yang sudah di-inject oleh frontend
      const workspaceMatch = accumulatedContext.match(/\[WORKSPACE FILES CONTENT\]([\s\S]*?)\[\/WORKSPACE FILES CONTENT\]/);
      
      if (!workspaceMatch) {
        return {
          output: `[WORKSPACE TIDAK TERSEDIA]: User belum memilih folder kerja (Workspace) atau browser tidak mendukung File System Access API. Sampaikan ke user: "Silakan klik ikon 📁 Folder di kotak chat bawah untuk memilih folder kerja terlebih dahulu, lalu ulangi permintaan Anda."`,
          toolExecution: { name: 'file_analyzer', args: { status: 'no_workspace' } }
        };
      }

      const workspaceContent = workspaceMatch[1].trim();
      
      if (!workspaceContent || workspaceContent === 'EMPTY') {
        return {
          output: `[WORKSPACE KOSONG]: Folder kerja yang dipilih tidak memiliki file yang bisa dibaca (atau terlalu besar). Sampaikan ke user bahwa folder tersebut kosong atau hanya berisi file biner.`,
          toolExecution: { name: 'file_analyzer', args: { status: 'empty_workspace' } }
        };
      }

      // Gunakan LLM untuk menganalisis konten workspace sesuai tugas
      const analyzerPrompt = `Anda adalah Sub-Agent FILE ANALYZER. Anda adalah ahli dalam membaca dan menganalisis file/kode/dokumen.
Tugas Anda: ${task}

Berikut adalah isi file-file dari folder kerja (Workspace) lokal milik user:

${workspaceContent}

INSTRUKSI:
1. Baca dan pahami semua file yang diberikan.
2. Selesaikan tugas yang diminta dengan detail dan akurat berdasarkan konten file tersebut.
3. Jika diminta menganalisis kode, berikan insight mendalam tentang arsitektur, bug potensial, atau saran perbaikan.
4. Jika diminta merangkum, berikan ringkasan yang terstruktur dan informatif.
5. Selalu sebutkan nama file sumber ketika merujuk ke konten tertentu.`;

      const analysisResult = await runLLM(analyzerPrompt, 'Anda adalah Sub-Agent FILE ANALYZER spesialis. Jawab dengan detail dan akurat.');

      return {
        output: analysisResult,
        toolExecution: { name: 'file_analyzer', args: { status: 'success', task: task.substring(0, 100) } }
      };
    } catch (err) {
      return { output: `File Analyzer gagal: ${err}` };
    }
  }
};
