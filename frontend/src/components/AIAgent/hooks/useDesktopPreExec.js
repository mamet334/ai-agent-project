/**
 * useDesktopPreExec.js
 *
 * Hook untuk Desktop Pre-Execution:
 * Mendeteksi permintaan lokal dari input user dan mengeksekusi perintah terminal
 * SEBELUM mengirim ke AI — hasilnya di-inject ke pesan agar AI langsung analisis data nyata.
 *
 * Diekstrak dari AIAgent.jsx :: handleSendMessage (baris 203-247).
 *
 * DEBUG POINTS:
 *   - Tambah console.debug di matchedCmd untuk lihat perintah yang terdeteksi
 *   - Cek preResult.output jika terminal tidak mengembalikan data
 *   - Flag preExecHandled mencegah double-eksekusi di Interceptor
 */

/**
 * Daftar pemetaan keyword → perintah terminal Windows.
 * Urutan penting: lebih spesifik dulu.
 */
const KEYWORD_CMD_MAP = [
  {
    test: (input) => input.includes('desktop') && ACTION_WORDS.some(w => input.includes(w)),
    cmd: 'dir %USERPROFILE%\\Desktop'
  },
  {
    test: (input) => (input.includes('dokumen') || input.includes('document')) && ACTION_WORDS.some(w => input.includes(w)),
    cmd: 'dir %USERPROFILE%\\Documents'
  },
  {
    test: (input) => (input.includes('download') || input.includes('unduh')) && ACTION_WORDS.some(w => input.includes(w)),
    cmd: 'dir %USERPROFILE%\\Downloads'
  },
  {
    test: (input) => ['informasi sistem', 'info komputer', 'spesifikasi', 'spek komputer', 'spec komputer', 'tentang pc'].some(kw => input.includes(kw)),
    cmd: 'systeminfo'
  },
  {
    test: (input) => ['ip address', 'alamat ip', 'ip saya', 'koneksi internet', 'jaringan', 'ipconfig'].some(kw => input.includes(kw)),
    cmd: 'ipconfig'
  },
  {
    test: (input) => ['proses berjalan', 'task manager', 'daftar proses', 'aplikasi berjalan', 'tasklist'].some(kw => input.includes(kw)),
    cmd: 'tasklist /FO TABLE | findstr /V "svchost conhost csrss"'
  },
  {
    test: (input) => ['ruang disk', 'kapasitas hardisk', 'storage', 'disk space', 'sisa hardisk', 'sisa memori'].some(kw => input.includes(kw)),
    cmd: 'wmic logicaldisk get size,freespace,caption'
  },
  {
    test: (input) => ['daftar file', 'isi folder', 'lihat folder', 'cek folder', 'tampilkan file', 'tampilkan folder'].some(kw => input.includes(kw)),
    cmd: 'dir'
  }
];

const ACTION_WORDS = ['cek', 'lihat', 'daftar', 'tampilkan', 'buka', 'isi', 'file', 'folder', 'list', 'scan', 'periksa', 'tulis'];

/**
 * Jalankan Pre-Exec: deteksi keyword → eksekusi terminal → inject hasil ke input.
 *
 * @param {string} displayInput - pesan user asli
 * @param {Function} onLog - callback update log UI (prev => [...prev, msg])
 * @returns {Promise<{ injectedInput: string, handled: boolean }>}
 */
export const runDesktopPreExec = async (displayInput, onLog = () => {}) => {
  // Hanya aktif di Electron Desktop
  if (!window.electronAPI) {
    return { injectedInput: displayInput, handled: false };
  }

  const lowerInput = displayInput.toLowerCase();
  const match = KEYWORD_CMD_MAP.find(entry => entry.test(lowerInput));

  if (!match) {
    return { injectedInput: displayInput, handled: false };
  }

  const matchedCmd = match.cmd;
  console.debug(`[DesktopPreExec] Keyword matched → cmd: "${matchedCmd}"`);

  try {
    onLog(`🖥️ Desktop Pre-Exec: Mengeksekusi "${matchedCmd}"...`);
    const preResult = await window.electronAPI.runTerminalCommand(matchedCmd);

    if (preResult?.output) {
      const injectedInput = displayInput +
        `\n\n[HASIL EKSEKUSI TERMINAL LANGSUNG DARI KOMPUTER USER - DATA INI NYATA, BUKAN HALUSINASI]\n` +
        `Perintah yang dijalankan: ${matchedCmd}\n` +
        `Output:\n${preResult.output}\n` +
        `[/HASIL EKSEKUSI TERMINAL]\n\n` +
        `Berdasarkan data NYATA di atas, jawab permintaan user dengan merangkum dan menyajikan hasilnya secara rapi. ` +
        `DILARANG KERAS mengarang data lain. Gunakan HANYA data yang tertera di atas.`;

      onLog(`✅ Desktop Pre-Exec berhasil! Data real injected.`);
      console.debug(`[DesktopPreExec] Injected ${preResult.output.length} chars output.`);

      return { injectedInput, handled: true };
    }

    return { injectedInput: displayInput, handled: false };

  } catch (preErr) {
    console.error('[DesktopPreExec] Error:', preErr);
    onLog(`⚠️ Desktop Pre-Exec gagal: ${preErr.message}`);
    return { injectedInput: displayInput, handled: false };
  }
};
