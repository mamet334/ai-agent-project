/**
 * workspaceScanner.js
 *
 * Helper functions untuk memindai folder kerja (workspace) secara rekursif.
 * Diekstrak dari AIAgent.jsx untuk keperluan debugging lebih mudah.
 *
 * DEBUG POINTS:
 *   - scanWorkspaceFiles: periksa stats.totalSize jika konten terpotong
 *   - buildWorkspaceTree: periksa maxDepth jika folder tidak muncul
 */

const VALID_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.json',
  '.md', '.txt', '.py', '.sql', '.csv', '.env', '.yaml',
  '.yml', '.toml', '.xml', '.sh', '.bat', '.cfg', '.ini', '.log'
];

const SKIP_DIRS = [
  'node_modules', '.git', 'dist', 'build', '.next', '.cache',
  '__pycache__', '.svelte-kit', 'coverage', '.turbo'
];

const MAX_FILE_SIZE_BYTES = 500 * 1024; // 500KB per file
const MAX_TOTAL_SIZE_BYTES = 3_000_000; // 3MB total (agar muat context window Gemini)

/**
 * Scan workspace files secara rekursif.
 * Berhenti jika total ukuran melebihi MAX_TOTAL_SIZE_BYTES.
 *
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} basePath
 * @param {number} maxDepth
 * @param {{ count: number, totalSize: number, maxSize: number }} stats
 * @returns {Promise<Array<{ path: string, content: string, size: number }>>}
 */
export const scanWorkspaceFiles = async (
  dirHandle,
  basePath = '',
  maxDepth = 5,
  stats = { count: 0, totalSize: 0, maxSize: MAX_TOTAL_SIZE_BYTES }
) => {
  const results = [];

  if (maxDepth <= 0 || stats.totalSize >= stats.maxSize) return results;

  try {
    for await (const [name, handle] of dirHandle.entries()) {
      if (stats.totalSize >= stats.maxSize) break;

      const fullPath = basePath ? `${basePath}/${name}` : name;

      if (handle.kind === 'directory') {
        if (SKIP_DIRS.includes(name)) continue;
        const subResults = await scanWorkspaceFiles(handle, fullPath, maxDepth - 1, stats);
        results.push(...subResults);

      } else if (handle.kind === 'file') {
        const isValid = VALID_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext));
        if (!isValid) continue;

        try {
          const file = await handle.getFile();

          // DEBUG: Log jika file dilewati karena terlalu besar
          if (file.size > MAX_FILE_SIZE_BYTES) {
            console.debug(`[WorkspaceScanner] Skip large file: ${fullPath} (${(file.size / 1024).toFixed(1)}KB)`);
            results.push({
              path: fullPath,
              content: `[FILE TERLALU BESAR: ${(file.size / 1024).toFixed(1)}KB - Dilewati]`,
              size: file.size
            });
            continue;
          }

          const text = await file.text();
          stats.totalSize += text.length;
          stats.count += 1;
          results.push({ path: fullPath, content: text, size: file.size });

        } catch (e) {
          console.warn(`[WorkspaceScanner] Gagal membaca file: ${fullPath}`, e);
          results.push({ path: fullPath, content: `[GAGAL MEMBACA: ${e.message}]`, size: 0 });
        }
      }
    }
  } catch (e) {
    console.warn('[WorkspaceScanner] Folder permission error:', e);
  }

  return results;
};

/**
 * Build workspace tree listing (hanya nama file/folder, tanpa konten).
 *
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} basePath
 * @param {number} maxDepth
 * @returns {Promise<Array<{ type: 'file'|'dir', path: string }>>}
 */
export const buildWorkspaceTree = async (dirHandle, basePath = '', maxDepth = 4) => {
  const items = [];

  if (maxDepth <= 0) return items;

  try {
    for await (const [name, handle] of dirHandle.entries()) {
      const fullPath = basePath ? `${basePath}/${name}` : name;

      if (handle.kind === 'directory') {
        if (SKIP_DIRS.includes(name)) continue;
        items.push({ type: 'dir', path: fullPath });
        const subItems = await buildWorkspaceTree(handle, fullPath, maxDepth - 1);
        items.push(...subItems);
      } else {
        items.push({ type: 'file', path: fullPath });
      }
    }
  } catch (e) {
    console.error('[WorkspaceScanner] Workspace tree error:', e);
  }

  return items;
};
