/**
 * useDesktopInterceptor.js
 *
 * Hook untuk Desktop Interceptor (Phase 3 - Iterative Loop):
 * Setelah AI merespons, scan konten respons untuk tag/kode executable,
 * eksekusi secara otomatis, lalu kirim hasil balik ke AI untuk analisis lanjutan.
 *
 * Diekstrak dari AIAgent.jsx :: handleSendMessage (baris 568-676).
 *
 * DEBUG POINTS:
 *   - termMatch: cek regex jika tag <terminal> tidak terdeteksi
 *   - mdTermMatch: cek nonTerminalLangs jika kode yang bukan terminal ikut tereksekusi
 *   - fileMatch: cek path parsing jika file tidak berhasil diedit
 *   - searchMatch: cek PowerShell bridge jika pencarian disk gagal
 *   - Docker Sandbox: aktif jika window.electronAPI.runDockerSandbox tersedia
 *   - Airdrop: aktif jika window.electronAPI.runAirdropStealth tersedia
 */

// Bahasa yang TIDAK dianggap sebagai terminal command
const NON_TERMINAL_LANGS = [
  'json', 'json_chart', 'json_zip', 'xml_zip', 'xml', 'mermaid',
  'python', 'py', 'javascript', 'js', 'jsx', 'tsx', 'typescript', 'ts',
  'html', 'css', 'sql', 'yaml', 'toml', 'markdown', 'md', 'diff', 'plaintext'
];

/**
 * Jalankan semua interceptor pada konten respons AI.
 *
 * @param {string} streamedContent - full teks respons AI
 * @returns {Promise<{ interceptHit: boolean, autoReply: string }>}
 */
export const runDesktopInterceptors = async (streamedContent) => {
  // Hanya aktif di Electron Desktop
  if (!window.electronAPI) {
    return { interceptHit: false, autoReply: '' };
  }

  let interceptHit = false;
  let autoReply = '';

  // ------------------------------------------------------------------
  // 1. Terminal Autonomy (RADAR SAPU JAGAT)
  //    Prioritas 1: Tag XML <terminal>...</terminal>
  //    Prioritas 2: Blok kode Markdown dengan label non-bahasa (bash, cmd, dll)
  // ------------------------------------------------------------------
  const termMatch = streamedContent.match(/<terminal>([\s\S]*?)<\/terminal>/i);
  const mdTermMatch = streamedContent.match(/```([a-zA-Z_]*)[^\n]*\n([\s\S]*?)```/i);

  let mdCmd = null;
  if (mdTermMatch) {
    const lang = (mdTermMatch[1] || '').toLowerCase();
    if (!NON_TERMINAL_LANGS.includes(lang)) {
      mdCmd = mdTermMatch[2];
    }
  }

  if (termMatch || mdCmd) {
    interceptHit = true;
    let rawCmd = termMatch ? termMatch[1].trim() : mdCmd.trim();

    // Bersihkan prompt symbols ($ >) dan komentar shell (#)
    rawCmd = rawCmd
      .split('\n')
      .map(line => line.replace(/^\$\s*/, '').replace(/^>\s*/, '').trim())
      .filter(l => l && !l.startsWith('#'))
      .join(' && ');

    if (rawCmd) {
      console.debug(`[Interceptor] Terminal cmd: "${rawCmd}"`);
      const res = await window.electronAPI.runTerminalCommand(rawCmd);
      autoReply += `\n[SYSTEM: TERMINAL RESULT for "${rawCmd}"]\n${res.output || 'Sukses (Tidak ada output)'}\n`;
    }
  }

  // ------------------------------------------------------------------
  // 2. Surgical File Editing
  //    Tag: <edit_file path="...">konten</edit_file>
  // ------------------------------------------------------------------
  const fileMatch = streamedContent.match(/<edit_file\s+path=["']([^"']+)["'][^>]*>([\s\S]*?)<\/edit_file>/i);
  if (fileMatch) {
    interceptHit = true;
    const filePath = fileMatch[1].trim();
    const fileContent = fileMatch[2].trim();

    console.debug(`[Interceptor] File edit: "${filePath}"`);
    const res = await window.electronAPI.editFileSurgical(filePath, fileContent);
    autoReply += `\n[SYSTEM: FILE EDIT RESULT for "${filePath}"]\n${
      res.success ? 'Berhasil disimpan' : 'Gagal: ' + (res.error || res.message)
    }\n`;
  }

  // ------------------------------------------------------------------
  // 3. Dynamic Global Search (PowerShell Bridge)
  //    Tag: <search_disk>query</search_disk>
  // ------------------------------------------------------------------
  const searchMatch = streamedContent.match(/<search_disk>([\s\S]*?)<\/search_disk>/i);
  if (searchMatch) {
    interceptHit = true;
    const query = searchMatch[1].trim();
    const cmd = `powershell -Command "Get-ChildItem -Path C:\\,D:\\ -Recurse -Filter '*${query}*' -ErrorAction SilentlyContinue | Select-Object -First 20 FullName"`;

    console.debug(`[Interceptor] Disk search: "${query}"`);
    const res = await window.electronAPI.runTerminalCommand(cmd);
    autoReply += `\n[SYSTEM: GLOBAL SEARCH RESULT for "${query}"]\n${
      res.output || 'Tidak ditemukan file dengan nama tersebut.'
    }\n`;
  }

  // ------------------------------------------------------------------
  // 4. Docker Sandbox (Eksekusi Kode Terisolasi)
  //    Hanya aktif jika Docker tersedia dan belum ada intercept sebelumnya
  // ------------------------------------------------------------------
  if (window.electronAPI.runDockerSandbox && !interceptHit) {
    const codeBlockMatch = streamedContent.match(/```(python|py|javascript|js)\n([\s\S]*?)```/i);
    if (codeBlockMatch) {
      try {
        const dockerStatus = await window.electronAPI.checkDockerStatus();
        if (dockerStatus.available) {
          const codeLang = codeBlockMatch[1].toLowerCase();
          const codeContent = codeBlockMatch[2].trim();
          const language = (codeLang === 'py' || codeLang === 'python') ? 'python' : 'javascript';

          // Hanya eksekusi kode yang cukup panjang dan punya output statement
          const hasOutput = codeContent.includes('print(') || codeContent.includes('console.log');
          const isReasonableSize = codeContent.length > 10 && codeContent.length < 50000;

          if (isReasonableSize && hasOutput) {
            console.debug(`[Interceptor] Docker sandbox: ${language} (${codeContent.length} chars)`);
            const dockerResult = await window.electronAPI.runDockerSandbox(codeContent, language);

            if (dockerResult.success) {
              interceptHit = true;
              autoReply += `\n[SYSTEM: DOCKER SANDBOX EXECUTION (${language.toUpperCase()})]\nStatus: ✅ Berhasil\nOutput:\n${dockerResult.output}\n`;
            } else if (
              dockerResult.error &&
              !dockerResult.error.includes('DOCKER_NOT_AVAILABLE') &&
              !dockerResult.error.includes('DITOLAK')
            ) {
              interceptHit = true;
              autoReply += `\n[SYSTEM: DOCKER SANDBOX EXECUTION (${language.toUpperCase()})]\nStatus: ❌ Gagal\nError:\n${dockerResult.error}\n`;
            }
          }
        }
      } catch (dockerErr) {
        console.warn('[Interceptor] Docker Sandbox error:', dockerErr.message);
      }
    }
  }

  // ------------------------------------------------------------------
  // 5. Web3 Airdrop Stealth Browser
  //    Tag: <run_airdrop task="..." keepOpen="..." url="...">
  // ------------------------------------------------------------------
  if (window.electronAPI.runAirdropStealth) {
    const airdropMatch = streamedContent.match(/<run_airdrop\s+([^>]+)>[\s\S]*?(?:<\/run_airdrop>)?/i);
    if (airdropMatch) {
      interceptHit = true;
      const attrs = airdropMatch[1];

      const taskMatch   = attrs.match(/task=["']([^"']+)["']/i);
      const keepOpenMatch = attrs.match(/keepOpen=["']([^"']+)["']/i);
      const urlMatch    = attrs.match(/url=["']([^"']+)["']/i);

      const taskName   = taskMatch    ? taskMatch[1].trim()               : 'galxe_campaign';
      const keepOpen   = keepOpenMatch ? keepOpenMatch[1].trim() === 'true' : false;
      const targetUrl  = urlMatch     ? urlMatch[1].trim()                : null;

      console.debug(`[Interceptor] Airdrop: task="${taskName}" url="${targetUrl}"`);
      const res = await window.electronAPI.runAirdropStealth(taskName, { keepOpen, url: targetUrl });
      autoReply += `\n[SYSTEM: STEALTH BROWSER (AIRDROP FARMER) RESULT for "${taskName}"]\n${
        res.success ? 'Berhasil: ' + res.message : 'Gagal: ' + res.message
      }\n`;
    }
  }

  return { interceptHit, autoReply };
};
