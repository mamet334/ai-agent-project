// StorageManager.js - Evolusi dari fs.js
// Runtime Contract: Storage abstraksi multi-backend untuk Mamet OS
export class StorageManager {
  constructor() {
    // Prefix untuk mencegah bentrok dengan data aplikasi lain di localStorage
    this.prefix = 'mamet_fs:';
    this.backend = 'localStorage'; // default backend
    this.metadata = new Map(); // cache metadata file
  }

  // Backend Management
  setBackend(type) {
    const availableBackends = this.listBackends();
    if (!availableBackends.includes(type)) {
      throw new Error(`Backend '${type}' not available. Available: ${availableBackends.join(', ')}`);
    }
    this.backend = type;
    console.log(`[StorageManager] Backend switched to: ${type}`);
  }

  getBackend() {
    return this.backend;
  }

  listBackends() {
    return ['localStorage', 'indexedDB', 'memory', 'cloud'];
  }

  // Core Storage Operations (interface yang sudah ada)
  async read(path) {
    try {
      const data = localStorage.getItem(this.prefix + path);
      return data !== null ? data : null;
    } catch (error) {
      console.error(`[StorageManager] Failed to read ${path}:`, error);
      return null;
    }
  }

  async write(path, content) {
    try {
      localStorage.setItem(this.prefix + path, content);
      this.metadata.set(path, {
        size: content.length,
        created_at: Date.now(),
        type: this._detectType(content)
      });
      return true;
    } catch (error) {
      console.error(`[StorageManager] Failed to write ${path}:`, error);
      return false;
    }
  }

  async delete(path) {
    try {
      const key = this.prefix + path;
      if (localStorage.getItem(key) === null) {
        return false;
      }
      localStorage.removeItem(key);
      this.metadata.delete(path);
      return true;
    } catch (error) {
      console.error(`[StorageManager] Failed to delete ${path}:`, error);
      return false;
    }
  }

  async list(dir) {
    try {
      const results = [];
      const searchPrefix = this.prefix + dir;
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(searchPrefix)) {
          results.push(key.substring(this.prefix.length));
        }
      }
      
      return results;
    } catch (error) {
      console.error(`[StorageManager] Failed to list directory ${dir}:`, error);
      return [];
    }
  }

  // New Methods
  async getInfo(path) {
    const meta = this.metadata.get(path);
    if (meta) return meta;
    
    // Fallback: calculate from actual data
    const data = await this.read(path);
    if (data === null) return null;
    
    const info = {
      size: data.length,
      created_at: Date.now(),
      type: this._detectType(data)
    };
    this.metadata.set(path, info);
    return info;
  }

  async exists(path) {
    const data = await this.read(path);
    return data !== null;
  }

  async clear() {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key);
        }
      });
      this.metadata.clear();
      console.log('[StorageManager] All data cleared from backend');
      return true;
    } catch (error) {
      console.error('[StorageManager] Failed to clear storage:', error);
      return false;
    }
  }

  // Helper: detect content type
  _detectType(content) {
    if (typeof content !== 'string') return 'unknown';
    if (content.startsWith('{') || content.startsWith('[')) return 'json';
    if (content.startsWith('<')) return 'html';
    if (content.startsWith('#')) return 'markdown';
    return 'text';
  }
}