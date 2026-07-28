/**
 * StorageManager - Layer 1 Core Service
 * Abstraksi semua media penyimpanan (localStorage, file system, IndexedDB, memory).
 * Digunakan oleh seluruh service dan komponen untuk operasi baca/tulis.
 */
export class StorageManager {
  constructor() {
    // Tentukan backend default berdasarkan environment
    this.backends = new Map();
    this.backends.set('localStorage', this._localStorageBackend());
    this.backends.set('file-system', this._fileSystemBackend());
    this.backends.set('memory', this._memoryBackend());

    // Deteksi environment: Electron atau Browser
    if (typeof window !== 'undefined' && window.electronAPI) {
      this.currentBackend = 'file-system';
    } else {
      this.currentBackend = 'localStorage';
    }
  }

  // =============================================
  // BACKEND MANAGEMENT
  // =============================================

  /**
   * Set backend penyimpanan yang aktif
   * @param {string} type - 'localStorage' | 'file-system' | 'memory'
   */
  setBackend(type) {
    if (this.backends.has(type)) {
      this.currentBackend = type;
      console.log(`[StorageManager] Backend diubah ke: ${type}`);
    } else {
      console.warn(`[StorageManager] Backend tidak dikenal: ${type}`);
    }
  }

  /**
   * Dapatkan backend yang sedang aktif
   * @returns {string}
   */
  getBackend() {
    return this.currentBackend;
  }

  /**
   * Daftar semua backend yang tersedia
   * @returns {string[]}
   */
  listBackends() {
    return Array.from(this.backends.keys());
  }

  // =============================================
  // PUBLIC API
  // =============================================

  async read(filePath) {
    console.log(`[StorageManager:read] 🔍 Memulai read("${filePath}")`);
    console.log(`[StorageManager:read]   window tersedia:`, typeof window !== 'undefined');
    console.log(`[StorageManager:read]   window.electronAPI tersedia:`, typeof window !== 'undefined' && !!window.electronAPI);
    console.log(`[StorageManager:read]   window.electronAPI.readFile adalah function:`, typeof window?.electronAPI?.readFile);
    console.log(`[StorageManager:read]   currentBackend: "${this.currentBackend}"`);
    console.log(`[StorageManager:read]   backends available:`, Array.from(this.backends.keys()));

    // ✅ ELECTRON: Gunakan IPC ke main process terlebih dahulu
    if (typeof window !== 'undefined' && window.electronAPI?.readFile) {
      console.log(`[StorageManager:read] 📡 Mencoba Electron IPC readFile("${filePath}")...`);
      try {
        const content = await window.electronAPI.readFile(filePath);
        console.log(`[StorageManager:read]   Hasil Electron IPC:`, 
          content === null ? 'null' : content === undefined ? 'undefined' : `${content.length} chars`);
        if (content !== null) {
          console.log(`[StorageManager:read] ✅ Read via Electron IPC: ${filePath}`);
          return content;
        } else {
          console.log(`[StorageManager:read] ⚠️ Electron IPC mengembalikan null, lanjut fallback`);
        }
      } catch (e) {
        console.warn(`[StorageManager:read] ❌ Electron IPC read failed: ${e.message}`);
      }
    } else {
      console.log(`[StorageManager:read] ⚠️ Electron IPC tidak tersedia, langsung fallback ke backend`);
    }
    
    // FALLBACK: Gunakan backend yang sedang aktif
    console.log(`[StorageManager:read] 🔄 Fallback ke backend "${this.currentBackend}"`);
    const backend = this.backends.get(this.currentBackend);
    console.log(`[StorageManager:read]   backend object tersedia:`, !!backend);
    console.log(`[StorageManager:read]   backend.read adalah function:`, typeof backend?.read);
    
    const result = await backend.read(filePath);
    console.log(`[StorageManager:read]   Hasil backend.read("${filePath}"):`, 
      result === null ? 'null' : result === undefined ? 'undefined' : `${result.length} chars`);
    return result;
  }

  async write(path, content) {
    const backend = this.backends.get(this.currentBackend);
    return backend.write(path, content);
  }

  async delete(path) {
    const backend = this.backends.get(this.currentBackend);
    return backend.delete(path);
  }

  async list(dir) {
    const backend = this.backends.get(this.currentBackend);
    return backend.list(dir);
  }

  async getInfo(path) {
    const backend = this.backends.get(this.currentBackend);
    return backend.getInfo(path);
  }

  async exists(path) {
    const backend = this.backends.get(this.currentBackend);
    return backend.exists(path);
  }

  async clear() {
    const backend = this.backends.get(this.currentBackend);
    return backend.clear();
  }

  /**
   * List semua file secara rekursif dari direktori tertentu.
   * @param {string} dir - Direktori awal (default: '.')
   * @returns {Promise<string[]>} Array path file (bukan folder)
   */
  async listRecursive(dir = '.') {
    console.log(`[StorageManager:listRecursive] 🔍 Memulai listRecursive("${dir}")`);
    console.log(`[StorageManager:listRecursive]   currentBackend: "${this.currentBackend}"`);

    // ✅ ELECTRON: Gunakan IPC listFilesRecursive terlebih dahulu
    if (typeof window !== 'undefined' && window.electronAPI?.listFilesRecursive) {
      console.log(`[StorageManager:listRecursive] 📡 Mencoba Electron IPC listFilesRecursive("${dir}")...`);
      try {
        const files = await window.electronAPI.listFilesRecursive(dir);
        console.log(`[StorageManager:listRecursive] ✅ Electron IPC: ${files.length} files ditemukan`);
        return files;
      } catch (e) {
        console.warn(`[StorageManager:listRecursive] ❌ Electron IPC gagal: ${e.message}, lanjut fallback`);
      }
    } else {
      console.log(`[StorageManager:listRecursive] ⚠️ Electron IPC tidak tersedia, fallback ke backend "${this.currentBackend}"`);
    }

    // FALLBACK: Implementasi manual untuk backend lain (localStorage / memory)
    const results = [];

    async function walk(currentDir) {
      try {
        const entries = await this.list(currentDir);
        for (const entry of entries) {
          const fullPath = currentDir === '/' ? `/${entry}` : `${currentDir}/${entry}`;
          // Coba list sub-entry untuk deteksi folder
          const subEntries = await this.list(fullPath).catch(() => []);
          if (subEntries.length > 0 && subEntries.some(e => e !== entry)) {
            // Ini folder, rekursif
            await walk.call(this, fullPath);
          } else {
            // Ini file
            results.push(fullPath);
          }
        }
      } catch (e) {
        // Skip folder yang tidak bisa diakses
        console.warn(`[StorageManager:listRecursive] ⚠️ Gagal list "${currentDir}": ${e.message}`);
      }
    }

    await walk.call(this, dir);
    return results;
  }

  // =============================================
  // BACKEND: LOCAL STORAGE
  // =============================================

  _localStorageBackend() {
    const PREFIX = 'mamet_fs:';

    return {
      read: async (path) => {
        try {
          return localStorage.getItem(PREFIX + path);
        } catch (e) {
          console.error('[StorageManager:localStorage] Gagal membaca:', path, e);
          return null;
        }
      },

      write: async (path, content) => {
        try {
          localStorage.setItem(PREFIX + path, String(content));
          return true;
        } catch (e) {
          console.error('[StorageManager:localStorage] Gagal menulis:', path, e);
          return false;
        }
      },

      delete: async (path) => {
        try {
          const key = PREFIX + path;
          if (localStorage.getItem(key) === null) return false;
          localStorage.removeItem(key);
          return true;
        } catch (e) {
          console.error('[StorageManager:localStorage] Gagal menghapus:', path, e);
          return false;
        }
      },

      list: async (dir) => {
        try {
          const results = [];
          const searchPrefix = PREFIX + dir;
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(searchPrefix)) {
              results.push(key.substring(PREFIX.length));
            }
          }
          return results;
        } catch (e) {
          console.error('[StorageManager:localStorage] Gagal listing:', dir, e);
          return [];
        }
      },

      getInfo: async (path) => {
        try {
          const content = localStorage.getItem(PREFIX + path);
          if (content === null) return null;
          return {
            path,
            size: content.length,
            type: 'text/plain',
            backend: 'localStorage'
          };
        } catch (e) {
          return null;
        }
      },

      exists: async (path) => {
        return localStorage.getItem(PREFIX + path) !== null;
      },

      clear: async () => {
        try {
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(PREFIX)) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(key => localStorage.removeItem(key));
          return true;
        } catch (e) {
          console.error('[StorageManager:localStorage] Gagal membersihkan:', e);
          return false;
        }
      }
    };
  }

  // =============================================
  // BACKEND: FILE SYSTEM (ELECTRON)
  // =============================================

  _fileSystemBackend() {
    const api = () => {
      if (typeof window !== 'undefined' && window.electronAPI) {
        return window.electronAPI;
      }
      return null;
    };

    return {
      read: async (path) => {
        const electron = api();
        if (!electron) {
          console.warn('[StorageManager:file-system] Electron API tidak tersedia');
          return null;
        }
        try {
          return await electron.readFile(path);
        } catch (e) {
          console.error('[StorageManager:file-system] Gagal membaca:', path, e);
          return null;
        }
      },

      write: async (path, content) => {
        const electron = api();
        if (!electron) {
          console.warn('[StorageManager:file-system] Electron API tidak tersedia');
          return false;
        }
        try {
          return await electron.writeFile(path, content);
        } catch (e) {
          console.error('[StorageManager:file-system] Gagal menulis:', path, e);
          return false;
        }
      },

      delete: async (path) => {
        const electron = api();
        if (!electron) {
          console.warn('[StorageManager:file-system] Electron API tidak tersedia');
          return false;
        }
        try {
          return await electron.deleteFile(path);
        } catch (e) {
          console.error('[StorageManager:file-system] Gagal menghapus:', path, e);
          return false;
        }
      },

      list: async (dir) => {
        const electron = api();
        if (!electron) {
          console.warn('[StorageManager:file-system] Electron API tidak tersedia');
          return [];
        }
        try {
          return await electron.listFiles(dir);
        } catch (e) {
          console.error('[StorageManager:file-system] Gagal listing:', dir, e);
          return [];
        }
      },

      getInfo: async (path) => {
        const electron = api();
        if (!electron) return null;
        try {
          return await electron.getFileInfo(path);
        } catch (e) {
          return null;
        }
      },

      exists: async (path) => {
        const electron = api();
        if (!electron) return false;
        try {
          return await electron.fileExists(path);
        } catch (e) {
          return false;
        }
      },

      clear: async () => {
        console.warn('[StorageManager:file-system] Clear tidak diizinkan untuk file system');
        return false;
      }
    };
  }

  // =============================================
  // BACKEND: MEMORY (FALLBACK)
  // =============================================

  _memoryBackend() {
    const store = new Map();

    return {
      read: async (path) => {
        return store.get(path) || null;
      },

      write: async (path, content) => {
        store.set(path, String(content));
        return true;
      },

      delete: async (path) => {
        return store.delete(path);
      },

      list: async (dir) => {
        const results = [];
        for (const key of store.keys()) {
          if (key.startsWith(dir)) {
            results.push(key);
          }
        }
        return results;
      },

      getInfo: async (path) => {
        const content = store.get(path);
        if (content === undefined) return null;
        return {
          path,
          size: content.length,
          type: 'text/plain',
          backend: 'memory'
        };
      },

      exists: async (path) => {
        return store.has(path);
      },

      clear: async () => {
        store.clear();
        return true;
      }
    };
  }
}