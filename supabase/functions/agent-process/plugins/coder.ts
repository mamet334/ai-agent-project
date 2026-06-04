/**
 * === MAMET SUB-AGENT: CODE EXECUTOR PRO ===
 * Kemampuan:
 * 1. Eksekusi kode Python & JavaScript di Dockerized Sandbox (Piston API)
 * 2. Mendukung library populer: pandas, numpy, csv, json, math, statistics, collections, itertools, re
 * 3. Self-Repair: Jika kode gagal, AI otomatis memperbaiki dan mencoba lagi (maks 2 kali)
 * 4. Data Injection: Bisa memproses data CSV/tabel yang dikirim user langsung di dalam chat
 * 5. Multi-Language: Python (utama untuk data), JavaScript (untuk logika web/JSON)
 * 6. Output terformat: Tabel, grafik teks, dan hasil kalkulasi yang rapi
 */

// === HELPER: Eksekusi kode via Piston Sandbox ===
async function executePiston(code: string, lang: string, version: string): Promise<{ success: boolean; output: string; error: string }> {
  try {
    const pistonRes = await fetch('https://emkc.org/api/v2/piston/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: lang,
        version: version,
        files: [{ content: code }],
        compile_timeout: 10000,
        run_timeout: 15000,
        compile_memory_limit: -1,
        run_memory_limit: -1
      })
    });

    if (!pistonRes.ok) {
      return { success: false, output: '', error: `Piston API Error: HTTP ${pistonRes.status}` };
    }

    const data = await pistonRes.json();

    if (data.run) {
      const stdout = (data.run.stdout || data.run.output || '').trim();
      const stderr = (data.run.stderr || '').trim();

      if (data.run.code !== 0 || (stderr && !stdout)) {
        return { success: false, output: stdout, error: stderr || 'Kode menghasilkan error tanpa pesan spesifik.' };
      }

      return { success: true, output: stdout || 'Berhasil dijalankan (tidak ada output cetak).', error: '' };
    }

    if (data.message) {
      return { success: false, output: '', error: `Piston: ${data.message}` };
    }

    return { success: false, output: '', error: 'Tidak ada respons dari Sandbox.' };
  } catch (e) {
    return { success: false, output: '', error: `Network error ke Piston: ${e}` };
  }
}

// === HELPER: Ekstrak kode dari respons LLM ===
function extractCode(llmOutput: string): { code: string; lang: string; version: string } {
  // Deteksi bahasa
  let lang = 'python';
  let version = '3.10.0';

  if (llmOutput.includes('```javascript') || llmOutput.includes('```js')) {
    lang = 'javascript';
    version = '18.15.0';
  }

  // Ekstrak kode dari blok markdown
  const patterns = [
    /```(?:python|py)([\s\S]*?)```/,
    /```(?:javascript|js)([\s\S]*?)```/,
    /```([\s\S]*?)```/
  ];

  for (const pattern of patterns) {
    const match = llmOutput.match(pattern);
    if (match && match[1] && match[1].trim().length > 10) {
      return { code: match[1].trim(), lang, version };
    }
  }

  // Jika tidak ada blok kode, gunakan seluruh output sebagai kode
  return { code: llmOutput.trim(), lang, version };
}

// === HELPER: Deteksi apakah user mengirimkan data mentah (CSV/tabel) ===
function extractInlineData(task: string, context: string): string | null {
  const combined = task + '\n' + context;

  // Deteksi pola data CSV (minimal 2 baris dengan koma atau tab)
  const lines = combined.split('\n');
  let csvLikeLines = 0;
  for (const line of lines) {
    if ((line.includes(',') && line.split(',').length >= 2) || (line.includes('\t') && line.split('\t').length >= 2)) {
      csvLikeLines++;
    }
  }

  if (csvLikeLines >= 3) {
    // Ekstrak baris-baris data saja
    const dataLines = lines.filter(l => 
      (l.includes(',') && l.split(',').length >= 2) || 
      (l.includes('\t') && l.split('\t').length >= 2) ||
      (l.includes('|') && l.split('|').length >= 3)
    );
    if (dataLines.length >= 3) {
      return dataLines.join('\n');
    }
  }

  return null;
}

export default {
  name: 'coder',
  description: 'Eksekusi kode pemrograman (Python atau JavaScript) secara aman di Dockerized Sandbox. Mampu memproses data CSV/tabel, melakukan kalkulasi matematika/statistik, parsing JSON, manipulasi string, dan algoritma kompleks. Dilengkapi Self-Repair: otomatis memperbaiki kode jika gagal.',
  execute: async ({ task, accumulatedContext, runLLM }) => {
    try {
      // Deteksi apakah ada data inline (CSV/tabel) yang dikirim user
      const inlineData = extractInlineData(task, accumulatedContext);

      // Bangun prompt yang lebih kaya
      let dataInjectionNote = '';
      if (inlineData) {
        dataInjectionNote = `\n\nDATA YANG DIBERIKAN USER (sudah diekstrak otomatis, masukkan sebagai string dalam kode Anda):\n\`\`\`\n${inlineData.substring(0, 5000)}\n\`\`\`\nGunakan io.StringIO atau split('\\n') untuk memparsing data ini di dalam kode.`;
      }

      const coderPrompt = `Anda adalah EKSEKUTOR KODE spesialis. Tugas Anda: ${task}

ATURAN KETAT:
1. Kembalikan HANYA blok kode, TANPA penjelasan di luar blok kode.
2. Gunakan Python sebagai bahasa UTAMA untuk semua tugas data/kalkulasi.
3. Gunakan JavaScript hanya jika diminta secara eksplisit atau tugas berkaitan dengan JSON/Web.
4. Bungkus kode di dalam blok \`\`\`python atau \`\`\`javascript.
5. WAJIB gunakan print() atau console.log() untuk menampilkan SEMUA hasil akhir.
6. Anda BOLEH menggunakan library bawaan Python: csv, json, math, statistics, collections, itertools, re, datetime, io, functools, operator, textwrap, string.
7. JANGAN gunakan library external (pandas, numpy, openpyxl, dll) karena sandbox tidak menyediakannya. Gunakan library bawaan saja.
8. Untuk memproses data tabel/CSV, gunakan modul csv dari Python (csv.reader + io.StringIO).
9. Untuk kalkulasi statistik, gunakan modul statistics (mean, median, stdev, dll).
10. Format output menggunakan print() dengan rapi dan terstruktur agar mudah dibaca oleh user.${dataInjectionNote}`;

      // === FASE 1: Generate kode ===
      let llmOutput = await runLLM(`Konteks Tugas:\n${accumulatedContext}\n\nSelesaikan.`, coderPrompt);
      let { code, lang, version } = extractCode(llmOutput);

      if (!code || code.length < 10) {
        return { output: '⚠️ AI tidak menghasilkan kode yang valid. Coba ulangi perintah Anda dengan lebih spesifik.' };
      }

      // === FASE 2: Eksekusi pertama ===
      let result = await executePiston(code, lang, version);

      // === FASE 3: Self-Repair (jika gagal, coba perbaiki otomatis maks 2x) ===
      let attempts = 0;
      const maxRepairs = 2;

      while (!result.success && attempts < maxRepairs) {
        attempts++;
        console.log(`Coder Self-Repair: Percobaan perbaikan ke-${attempts}...`);

        const repairPrompt = `Anda adalah DEBUGGER spesialis. Kode berikut GAGAL dieksekusi di sandbox.

KODE YANG GAGAL (${lang}):
\`\`\`${lang}
${code}
\`\`\`

ERROR MESSAGE:
${result.error}

TUGAS AWAL: ${task}

INSTRUKSI:
1. Analisis error di atas.
2. Perbaiki kode tersebut agar bisa berjalan dengan sempurna.
3. Kembalikan HANYA kode yang sudah diperbaiki dalam blok \`\`\`${lang}.
4. JANGAN gunakan library external (pandas, numpy, dll). Gunakan HANYA library bawaan Python/JavaScript.
5. Pastikan ada print()/console.log() untuk menampilkan hasil.`;

        const repairedOutput = await runLLM(repairPrompt, 'Anda adalah debugger kode yang sangat teliti.');
        const repaired = extractCode(repairedOutput);

        if (repaired.code && repaired.code.length > 10) {
          code = repaired.code;
          lang = repaired.lang;
          version = repaired.version;
          result = await executePiston(code, lang, version);
        } else {
          break; // LLM tidak menghasilkan perbaikan yang valid
        }
      }

      // === FASE 4: Format output akhir ===
      const statusEmoji = result.success ? '✅' : '❌';
      const repairNote = attempts > 0 
        ? `\n\n🔧 *Self-Repair: Kode diperbaiki otomatis ${attempts}x ${result.success ? '→ Berhasil!' : '→ Tetap gagal.'}*` 
        : '';

      let finalOutput = `${statusEmoji} **Eksekusi Kode (${lang.toUpperCase()})**${repairNote}\n\n`;
      finalOutput += `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;

      if (result.success) {
        finalOutput += `📊 **Hasil Output:**\n\`\`\`\n${result.output.substring(0, 10000)}\n\`\`\``;
      } else {
        finalOutput += `⚠️ **Error:**\n\`\`\`\n${result.error.substring(0, 3000)}\n\`\`\``;
        finalOutput += `\n\n**Tips:**\n1. Pastikan perintah Anda cukup jelas untuk dikonversi ke kode.\n2. Coba ulangi dengan instruksi yang lebih spesifik.\n3. Jika membutuhkan library khusus (pandas, numpy), hasilnya mungkin perlu disesuaikan menggunakan library bawaan Python.`;
      }

      // Jika berhasil, gunakan LLM untuk merangkum/menjelaskan hasil
      if (result.success && result.output.length > 50) {
        try {
          const explanation = await runLLM(
            `Berikut adalah output hasil eksekusi kode untuk tugas: "${task}"\n\nOutput:\n${result.output.substring(0, 5000)}\n\nTolong jelaskan hasilnya secara ringkas dalam bahasa Indonesia yang mudah dipahami. Jika hasilnya berupa data/angka, buatlah kesimpulan yang berguna.`,
            'Anda adalah asisten data analyst yang menjelaskan hasil komputasi dengan bahasa sederhana.'
          );
          finalOutput += `\n\n---\n📝 **Penjelasan Hasil:**\n${explanation}`;
        } catch (_e) {
          // Jika LLM gagal merangkum, tampilkan output mentah saja
        }
      }

      return {
        output: finalOutput,
        toolExecution: { 
          name: 'code_executor_pro', 
          args: { 
            language: lang, 
            code_length: code.length, 
            success: result.success, 
            self_repairs: attempts 
          } 
        }
      };
    } catch (err) {
      return { output: `❌ Eksekusi coder gagal total: ${err}` };
    }
  }
};
