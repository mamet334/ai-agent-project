/**
 * FileIndexService — Membangun indeks semua file dalam proyek untuk resolusi path cepat.
 * 
 * Peran:
 * - Membangun indeks nama file (basename → path lengkap) saat startup
 * - Menyediakan resolvePath(filename) untuk mencari path lengkap berdasarkan nama file
 * - Dapat di-refresh secara manual
 * 
 * Digunakan oleh Engineer._tryReadFile() untuk menemukan file yang hanya disebutkan namanya.
 */

export class FileIndexService {
  constructor(storageManager) {
    this.storageManager = storageManager;
    this.fileIndex = new Map(); // key: nama file (basename), value: array of path lengkap
    this.isReady = false;
  }

  /**
   * Membangun indeks dari semua file di proyek secara rekursif.
   */
  async buildIndex() {
    try {
      console.log('[FileIndexService] 🔨 Membangun indeks file...');
      const allFiles = await this.storageManager.listRecursive('/');
      
      this.fileIndex.clear();
      for (const filePath of allFiles) {
        const baseName = filePath.split('/').pop(); // ambil nama file saja
        if (!baseName) continue;
        
        if (!this.fileIndex.has(baseName)) {
          this.fileIndex.set(baseName, []);
        }
        this.fileIndex.get(baseName).push(filePath);
      }
      
      this.isReady = true;
      console.log(`[FileIndexService] ✅ Index built: ${allFiles.length} files, ${this.fileIndex.size} unique names.`);
    } catch (e) {
      console.error('[FileIndexService] ❌ Failed to build index:', e);
      this.isReady = false;
    }
  }

  /**
   * Mencari path lengkap berdasarkan nama file.
   * @param {string} filename - Nama file dengan ekstensi (contoh: "ConversationEngine.jsx")
   * @returns {string|null} Path lengkap relatif terhadap root proyek, atau null jika tidak ditemukan
   */
  resolvePath(filename) {
    if (!this.isReady) {
      console.warn('[FileIndexService] ⚠️ Index belum siap, tidak bisa resolve path');
      return null;
    }
    
    const candidates = this.fileIndex.get(filename);
    if (!candidates || candidates.length === 0) {
      console.log(`[FileIndexService] File "${filename}" tidak ditemukan di indeks`);
      return null;
    }
    
    if (candidates.length === 1) {
      console.log(`[FileIndexService] ✅ Resolved "${filename}" → "${candidates[0]}"`);
      return candidates[0];
    }
    
    // Jika ada banyak file dengan nama sama, prioritaskan yang paling umum
    console.warn(`[FileIndexService] ⚠️ Multiple files found for "${filename}":`, candidates);
    
    // Prioritas: frontend/src/components/ > frontend/src/ > frontend/ > lainnya
    const priorityPatterns = [
      '/src/components/',
      '/src/',
      '/frontend/',
    ];
    
    for (const pattern of priorityPatterns) {
      const match = candidates.find(c => c.includes(pattern));
      if (match) {
        console.log(`[FileIndexService] ✅ Prioritized "${filename}" → "${match}"`);
        return match;
      }
    }
    
    // Fallback: return yang pertama
    console.log(`[FileIndexService] ✅ Using first match for "${filename}" → "${candidates[0]}"`);
    return candidates[0];
  }

  /**
   * Mendapatkan semua kandidat path untuk suatu nama file.
   * @param {string} filename
   * @returns {string[]}
   */
  getAllCandidates(filename) {
    return this.fileIndex.get(filename) || [];
  }

  /**
   * Refresh indeks (build ulang).
   */
  async refresh() {
    await this.buildIndex();
  }

  /**
   * Mendapatkan statistik indeks.
   * @returns {{ totalFiles: number, uniqueNames: number, isReady: boolean }}
   */
  getStats() {
    return {
      totalFiles: Array.from(this.fileIndex.values()).reduce((sum, arr) => sum + arr.length, 0),
      uniqueNames: this.fileIndex.size,
      isReady: this.isReady
    };
  }
}
