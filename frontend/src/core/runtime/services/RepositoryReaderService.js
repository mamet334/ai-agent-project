/**
 * RepositoryReaderService — Kemampuan Engineer Membaca Repository
 *
 * Seperti Antigravity yang dapat membaca file di repository,
 * service ini memberikan Engineer kemampuan yang sama.
 *
 * Dua Backend:
 * 1. Electron (desktop): via window.electronAPI.readFile / listFilesRecursive
 * 2. GitHub API (web/Vercel): via fetch ke api.github.com
 *    - Repo public: tidak perlu token
 *    - Repo private: perlu GitHub PAT dari VaultService
 *
 * Diregistrasi di Kernel.js (Phase 5) sebelum Engineer.
 */

const GITHUB_OWNER = 'mamet334';
const GITHUB_REPO = 'mamet-ecosystem';
const GITHUB_BRANCH = 'main';
const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}`;
const GITHUB_API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

export class RepositoryReaderService {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.isElectron = typeof window !== 'undefined' && !!window.electronAPI;
    this.repoTree = null; // Cache tree dari GitHub
    this.treeBuiltAt = null;
  }

  async initialize() {
    console.log(`[RepositoryReaderService] Initializing — backend: ${this.isElectron ? 'Electron' : 'GitHub API'}`);
    // Pre-fetch tree untuk kemampuan search (non-blocking, best-effort)
    this._prefetchTree().catch(() => {});
  }

  // =============================================
  // PUBLIC API
  // =============================================

  /**
   * Membaca isi file dari repository.
   * @param {string} path - Path relatif dari root repo (e.g., "frontend/src/core/runtime/Kernel.js")
   * @returns {Promise<{content: string, path: string, size: number, backend: string} | null>}
   */
  async readFile(path) {
    console.log(`[RepositoryReaderService] readFile: ${path}`);

    // Bersihkan path (hapus leading slash, normalize separator)
    const cleanPath = path.replace(/^\//, '').replace(/\\/g, '/');

    if (this.isElectron) {
      return this._readFileElectron(cleanPath);
    }
    return this._readFileGitHub(cleanPath);
  }

  /**
   * Mendaftar isi direktori dari repository.
   * @param {string} dirPath - Path direktori (e.g., "frontend/src/core")
   * @returns {Promise<Array<{name: string, path: string, type: 'file'|'dir', size?: number}>>}
   */
  async listDirectory(dirPath = '') {
    console.log(`[RepositoryReaderService] listDirectory: ${dirPath || '(root)'}`);
    const cleanPath = dirPath.replace(/^\//, '').replace(/\\/g, '/');

    if (this.isElectron) {
      return this._listDirectoryElectron(cleanPath);
    }
    return this._listDirectoryGitHub(cleanPath);
  }

  /**
   * Mencari file berdasarkan nama atau pola.
   * @param {string} query - Nama file atau kata kunci
   * @returns {Promise<string[]>} Array path file yang cocok
   */
  async searchFiles(query) {
    console.log(`[RepositoryReaderService] searchFiles: ${query}`);
    const tree = await this._getTree();
    if (!tree) return [];

    const q = query.toLowerCase();
    return tree
      .filter(item => item.type === 'blob' && item.path.toLowerCase().includes(q))
      .map(item => item.path)
      .slice(0, 50); // Maksimal 50 hasil
  }

  /**
   * Membaca beberapa file sekaligus.
   * @param {string[]} paths - Array path file
   * @returns {Promise<Object>} Map dari path → content
   */
  async readMultipleFiles(paths) {
    const results = {};
    // Baca secara paralel tapi batasi 5 request sekaligus
    const chunks = [];
    for (let i = 0; i < paths.length; i += 5) {
      chunks.push(paths.slice(i, i + 5));
    }
    for (const chunk of chunks) {
      const reads = await Promise.allSettled(chunk.map(p => this.readFile(p)));
      reads.forEach((r, idx) => {
        if (r.status === 'fulfilled' && r.value) {
          results[chunk[idx]] = r.value.content;
        }
      });
    }
    return results;
  }

  /**
   * Mendapatkan full tree repository (untuk search).
   * Di-cache selama 10 menit.
   */
  async getRepoTree() {
    return this._getTree();
  }

  // =============================================
  // GITHUB API BACKEND
  // =============================================

  async _readFileGitHub(path) {
    try {
      const headers = this._getGitHubHeaders();
      // Gunakan raw content (lebih efisien daripada API)
      const url = `${GITHUB_RAW_BASE}/${path}`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`[RepositoryReaderService] File tidak ditemukan di GitHub: ${path}`);
          return null;
        }
        throw new Error(`GitHub raw fetch gagal: HTTP ${response.status}`);
      }

      const content = await response.text();
      return {
        content,
        path,
        size: content.length,
        backend: 'github-raw',
        url
      };
    } catch (e) {
      console.error(`[RepositoryReaderService] GitHub read error for ${path}:`, e.message);
      return null;
    }
  }

  async _listDirectoryGitHub(dirPath) {
    try {
      const headers = this._getGitHubHeaders();
      const url = `${GITHUB_API_BASE}/contents/${dirPath}?ref=${GITHUB_BRANCH}`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        console.warn(`[RepositoryReaderService] GitHub contents fetch gagal: HTTP ${response.status}`);
        return [];
      }

      const data = await response.json();
      if (!Array.isArray(data)) return [];

      return data.map(item => ({
        name: item.name,
        path: item.path,
        type: item.type === 'dir' ? 'dir' : 'file',
        size: item.size || 0
      }));
    } catch (e) {
      console.error(`[RepositoryReaderService] GitHub list error for ${dirPath}:`, e.message);
      return [];
    }
  }

  async _getTree() {
    // Cache selama 10 menit
    const TEN_MINUTES = 10 * 60 * 1000;
    if (this.repoTree && this.treeBuiltAt && (Date.now() - this.treeBuiltAt < TEN_MINUTES)) {
      return this.repoTree;
    }

    try {
      const headers = this._getGitHubHeaders();
      const url = `${GITHUB_API_BASE}/git/trees/${GITHUB_BRANCH}?recursive=1`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        console.warn(`[RepositoryReaderService] GitHub tree fetch gagal: HTTP ${response.status}`);
        return null;
      }

      const data = await response.json();
      this.repoTree = data.tree || [];
      this.treeBuiltAt = Date.now();
      console.log(`[RepositoryReaderService] ✅ GitHub tree loaded: ${this.repoTree.length} items`);
      return this.repoTree;
    } catch (e) {
      console.error('[RepositoryReaderService] GitHub tree error:', e.message);
      return null;
    }
  }

  async _prefetchTree() {
    if (!this.isElectron) {
      await this._getTree();
    }
  }

  _getGitHubHeaders() {
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    // Coba ambil GitHub PAT dari VaultService (opsional, untuk private repo)
    try {
      if (this.serviceManager.has('VaultService')) {
        const vault = this.serviceManager.get('VaultService');
        const token = vault.get?.('github_token') || vault.getSecret?.('github_token');
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }
    } catch (e) {
      // Tidak ada token, lanjut tanpa auth (repo public)
    }
    return headers;
  }

  // =============================================
  // ELECTRON BACKEND
  // =============================================

  async _readFileElectron(path) {
    try {
      const content = await window.electronAPI.readFile(path);
      if (content === null || content === undefined) return null;
      return {
        content,
        path,
        size: content.length,
        backend: 'electron'
      };
    } catch (e) {
      console.error(`[RepositoryReaderService] Electron read error for ${path}:`, e.message);
      return null;
    }
  }

  async _listDirectoryElectron(dirPath) {
    try {
      const entries = await window.electronAPI.listFiles(dirPath || '.');
      if (!Array.isArray(entries)) return [];
      return entries.map(name => ({
        name,
        path: dirPath ? `${dirPath}/${name}` : name,
        type: 'unknown', // Electron API tidak selalu memberikan tipe
        size: 0
      }));
    } catch (e) {
      console.error(`[RepositoryReaderService] Electron list error for ${dirPath}:`, e.message);
      return [];
    }
  }
}
