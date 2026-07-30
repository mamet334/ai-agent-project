import { StorageManager } from '../StorageManager.js';

export class FileIndexService {
  constructor(storageManager) {
    this.storageManager = storageManager;
    this.fileIndex = new Map();
    this.isReady = false;
  }

  async buildIndex() {
    try {
      const allFiles = await this.storageManager.listRecursive('.');
      this.fileIndex.clear();
      for (const filePath of allFiles) {
        const baseName = filePath.split('/').pop();
        if (!this.fileIndex.has(baseName)) {
          this.fileIndex.set(baseName, []);
        }
        this.fileIndex.get(baseName).push(filePath);
      }
      this.isReady = true;
      console.log(`[FileIndexService] ✅ Index built: ${allFiles.length} files, ${this.fileIndex.size} unique names.`);
    } catch (e) {
      console.error('[FileIndexService] Failed to build index:', e);
      this.isReady = false;
    }
  }

  /**
   * Mencari path lengkap berdasarkan nama file dengan prioritas ketat.
   * Menghindari folder sampah (node_modules, .git) dan folder backup lama.
   */
  resolvePath(filename) {
    const candidates = this.fileIndex.get(filename) || [];
    
    if (candidates.length === 0) {
      console.warn(`[FileIndexService] ❌ File not found in index: ${filename}`);
      return null;
    }
    
    if (candidates.length === 1) return candidates[0];

    // 🛡️ BLACKLIST: Folder yang TIDAK BOLEH dipilih
    const BLACKLIST = [
      'node_modules', '.git', 'dist', 'release', '.vite', 
      'ai-agent-project', 'backup', '.cache', 'mamet_fs'
    ];
    
    // Filter path yang mengandung folder blacklist
    const filtered = candidates.filter(p => {
      const normalized = p.replace(/\\/g, '/');
      return !BLACKLIST.some(b => 
        normalized.includes(`/${b}/`) || 
        normalized.startsWith(`${b}/`) ||
        normalized.includes(`/${b}`)
      );
    });

    if (filtered.length === 0) {
      console.warn(`[FileIndexService] ⚠️ All candidates blacklisted for ${filename}, falling back to first.`);
      return candidates[0]; 
    }

    // 🎯 PRIORITAS 1: Root folder aktif (Mamet OS Ecosystem)
    const activeRoot = filtered.find(p => 
      p.includes('mamet os ecosystem') || 
      p.includes('mamet_os_ecosystem') ||
      p.includes('mamet-os-ecosystem')
    );
    if (activeRoot) {
      console.log(`[FileIndexService] ✅ Resolved via Active Root: ${activeRoot}`);
      return activeRoot;
    }

    // 🎯 PRIORITAS 2: Workbench components (tempat ConversationEngine.jsx berada)
    const workbench = filtered.find(p => p.includes('frontend/src/components/workbench'));
    if (workbench) {
      console.log(`[FileIndexService] ✅ Resolved via Workbench: ${workbench}`);
      return workbench;
    }

    // 🎯 PRIORITAS 3: Frontend src secara umum
    const frontendSrc = filtered.find(p => p.includes('frontend/src'));
    if (frontendSrc) return frontendSrc;

    // 🎯 PRIORITAS 4: Path terpendek (fallback paling aman)
    const shortest = filtered.sort((a, b) => a.length - b.length)[0];
    console.log(`[FileIndexService] ✅ Resolved via Shortest Path: ${shortest}`);
    return shortest;
  }

  async refresh() {
    await this.buildIndex();
  }

  /**
   * Mengembalikan daftar semua file yang di-index
   * @returns {string[]}
   */
  getAllFiles() {
    if (!this.isReady) return [];
    const allFiles = [];
    for (const paths of this.fileIndex.values()) {
      allFiles.push(...paths);
    }
    return allFiles;
  }
}