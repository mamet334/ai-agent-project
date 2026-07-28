import { StorageManager } from '../StorageManager.js';

export class FileIndexService {
  constructor(storageManager) {
    this.storageManager = storageManager;
    this.fileIndex = new Map();
    this.isReady = false;
  }

  async buildIndex() {
    try {
      const allFiles = await this.storageManager.listRecursive('/');
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

  resolvePath(filename) {
    if (!this.isReady) return null;
    const candidates = this.fileIndex.get(filename);
    if (!candidates || candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // ✅ PRIORITAS 1: Pilih path yang mengandung "mamet os ecosystem"
    let prioritized = candidates.find(p => p.includes('mamet os ecosystem'));
    if (prioritized) return prioritized;

    // ✅ PRIORITAS 2: Jika tidak ada, pilih yang mengandung "frontend/src/components/workbench"
    prioritized = candidates.find(p => p.includes('frontend/src/components/workbench'));
    if (prioritized) return prioritized;

    // ✅ PRIORITAS 3: Fallback path terpendek
    return candidates.reduce((a, b) => a.length < b.length ? a : b);
  }

  async refresh() {
    await this.buildIndex();
  }
}