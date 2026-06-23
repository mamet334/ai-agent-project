export default {
  name: 'file_analyzer',
  description: 'WORKSPACE EDITOR: Membaca, menganalisis, MEMODIFIKASI, dan MEMBUAT file/folder baru di dalam Workspace lokal user. Sangat cocok untuk mengedit kode proyek, membuat file dokumen, dan merombak struktur folder secara otomatis.',
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
      const analyzerPrompt = `Anda adalah Sub-Agent "WORKSPACE EDITOR". Anda memiliki hak akses penuh untuk membaca, menganalisis, membuat, dan memodifikasi file di dalam folder kerja (Workspace) lokal milik user.
Tugas Anda: ${task}

Berikut adalah isi file-file dari folder kerja (Workspace) saat ini:

${workspaceContent}

INSTRUKSI:
1. Baca dan pahami semua file yang diberikan.
2. Selesaikan tugas yang diminta dengan detail dan akurat.
3. Jika Anda HANYA diminta menganalisis, merangkum, atau menjelaskan, berikan jawaban teks biasa.
4. JIKA Anda diminta MEMBUAT FILE BARU, MEMODIFIKASI FILE, atau MENULIS KODE yang harus disimpan, Anda WAJIB menggunakan format blok XML khusus agar sistem dapat menyimpannya langsung ke komputer user.

FORMAT PENYIMPANAN FILE (Gunakan blok markdown biasa tanpa tag bahasa khusus):
<filename>nama_project_bebas.zip</filename>
<file name="nama_file_atau_path.txt">
Isi dari file tersebut.
Tuliskan semua isi kode atau teks di sini tanpa backticks.
</file>
<file name="folder/subfolder/file_lain.js">
console.log("Mendukung multi-file dan pembuatan folder otomatis");
</file>

PENTING UNTUK PENYIMPANAN FILE:
- JANGAN gunakan blok markdown (\`\`\`) di dalam tag <file>.
- Nama file boleh menyertakan path folder (contoh: "src/komponen/Button.jsx").
- Anda bisa menulis banyak tag <file> sekaligus.
- Selalu cantumkan <filename> di bagian atas.`;

      const analysisResult = await runLLM(analyzerPrompt, 'Anda adalah Sub-Agent WORKSPACE EDITOR. Jawab dengan cerdas dan gunakan format XML jika harus menyimpan file.');

      return {
        output: analysisResult,
        toolExecution: { name: 'workspace_editor', args: { status: 'success', task: task.substring(0, 100) } }
      };
    } catch (err) {
      return { output: `File Analyzer gagal: ${err}` };
    }
  }
};
