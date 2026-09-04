/**
 * ModuleDiscoveryService.js — Module Discovery Fase 1 (PR#7)
 *
 * Scan folder /modules/ saat boot, baca dan validasi module.json,
 * lalu daftarkan modul yang valid ke ToolRegistryService.
 *
 * Fase 1 (ini): modul lokal saja — Owner yang taruh di /modules/.
 * Fase 2 (ditunda): modul terunduh dengan sandboxing + approval (belum dikerjakan).
 *
 * Prinsip: Modul bermasalah ditolak dengan pesan jelas, boot TIDAK gagal total
 * (selaras DEGRADED mode Kernel yang sudah ada).
 *
 * Schema module.json yang valid:
 * {
 *   "name": "my-tool",         // string, required, unik
 *   "version": "1.0.0",        // string, required
 *   "type": "tool|capability|service",  // required
 *   "description": "...",      // string, required
 *   "entry": "index.js",       // string, required
 *   "capabilities": ["read_file"],  // array, optional
 *   "dependencies": []         // array, optional
 * }
 */

const MODULES_BASE_PATH = 'modules';
const MANIFEST_FILENAME = 'module.json';

const REQUIRED_MANIFEST_FIELDS = ['name', 'version', 'type', 'description', 'entry'];
const VALID_MODULE_TYPES = ['tool', 'capability', 'service'];

export class ModuleDiscoveryService {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this._initialized = false;
    this._discoveredModules = new Map(); // name → { manifest, path }
    this._rejectedModules = [];          // { path, reason }
  }

  async initialize() {
    this._initialized = true;
    console.log('[ModuleDiscoveryService] Initialized — scanning modules/');
    await this._scanAndRegister();
  }

  // =============================================
  // SCAN & REGISTER
  // =============================================

  /**
   * Scan folder modules/, validasi manifest, daftarkan ke ToolRegistryService.
   * Error pada satu modul tidak menghentikan proses modul lain.
   */
  async _scanAndRegister() {
    // Hanya aktif di Electron dengan API filesystem lokal aman
    if (!window.electronAPI || typeof window.electronAPI.listFiles !== 'function' || typeof window.electronAPI.readFile !== 'function') {
      console.log('[ModuleDiscoveryService] Electron fs API tidak tersedia — module discovery dilewati.');
      return;
    }

    let moduleEntries = [];
    try {
      // Gunakan safe fs:listFiles alih-alih runTerminalCommand (mencegah popup modal terminal saat boot)
      const entries = await window.electronAPI.listFiles(MODULES_BASE_PATH);
      if (!Array.isArray(entries) || entries.length === 0) {
        console.log('[ModuleDiscoveryService] Folder modules/ tidak ditemukan atau kosong.');
        return;
      }
      moduleEntries = entries.filter(e => e.type === 'dir').map(e => e.name);
    } catch (err) {
      console.warn('[ModuleDiscoveryService] Gagal scan modules/:', err.message);
      return;
    }

    const toolRegistry = this.serviceManager.get('ToolRegistryService');

    for (const folderName of moduleEntries) {
      const modulePath = `${MODULES_BASE_PATH}/${folderName}`;
      const manifestPath = `${modulePath}/${MANIFEST_FILENAME}`;

      try {
        // Baca module.json menggunakan API fs aman (tanpa terminal prompt)
        const manifestRaw = await window.electronAPI.readFile(manifestPath);
        if (!manifestRaw) {
          this._reject(manifestPath, `module.json tidak ditemukan di ${modulePath}`);
          continue;
        }

        let manifest;
        try {
          manifest = JSON.parse(manifestRaw);
        } catch (parseErr) {
          this._reject(manifestPath, `module.json tidak valid JSON: ${parseErr.message}`);
          continue;
        }

        // Validasi manifest
        const validationError = this._validateManifest(manifest);
        if (validationError) {
          this._reject(manifestPath, validationError);
          continue;
        }

        // Cek konflik nama
        if (this._discoveredModules.has(manifest.name)) {
          this._reject(manifestPath, `Konflik nama: modul "${manifest.name}" sudah terdaftar dari path lain.`);
          continue;
        }

        // Registrasi ke ToolRegistryService (jika tersedia)
        if (toolRegistry && typeof toolRegistry.registerTool === 'function') {
          try {
            toolRegistry.registerTool({
              name: manifest.name,
              description: manifest.description,
              version: manifest.version,
              type: manifest.type,
              capabilities: manifest.capabilities || [],
              entryPath: `${modulePath}/${manifest.entry}`,
              source: 'module_discovery'
            });
          } catch (regErr) {
            this._reject(manifestPath, `Gagal daftarkan ke ToolRegistry: ${regErr.message}`);
            continue;
          }
        }

        this._discoveredModules.set(manifest.name, { manifest, path: modulePath });
        console.log(`[ModuleDiscoveryService] ✅ Modul terdaftar: ${manifest.name} v${manifest.version} (${manifest.type})`);

      } catch (err) {
        this._reject(modulePath, `Error tak terduga: ${err.message}`);
      }
    }

    // Summary
    console.log(`[ModuleDiscoveryService] Scan selesai: ${this._discoveredModules.size} modul aktif, ${this._rejectedModules.length} ditolak.`);
    if (this._rejectedModules.length > 0) {
      console.warn('[ModuleDiscoveryService] Modul yang ditolak:', this._rejectedModules);
    }
  }

  // =============================================
  // VALIDASI MANIFEST
  // =============================================

  /**
   * Validasi struktur module.json.
   * @param {Object} manifest
   * @returns {string|null} - pesan error, atau null jika valid
   */
  _validateManifest(manifest) {
    for (const field of REQUIRED_MANIFEST_FIELDS) {
      if (!manifest[field]) {
        return `Field wajib "${field}" tidak ada atau kosong di module.json`;
      }
    }

    if (typeof manifest.name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(manifest.name)) {
      return `"name" harus string alfanumerik (boleh - dan _), bukan: ${manifest.name}`;
    }

    if (!VALID_MODULE_TYPES.includes(manifest.type)) {
      return `"type" harus salah satu dari ${VALID_MODULE_TYPES.join('/')}. Ditemukan: ${manifest.type}`;
    }

    if (manifest.dependencies && !Array.isArray(manifest.dependencies)) {
      return `"dependencies" harus array`;
    }

    if (manifest.capabilities && !Array.isArray(manifest.capabilities)) {
      return `"capabilities" harus array`;
    }

    return null; // Valid
  }

  // =============================================
  // HELPERS
  // =============================================

  _reject(path, reason) {
    console.warn(`[ModuleDiscoveryService] ❌ Modul ditolak (${path}): ${reason}`);
    this._rejectedModules.push({ path, reason });
  }

  /** Daftar semua modul yang berhasil terdaftar. */
  getDiscoveredModules() {
    return Array.from(this._discoveredModules.values());
  }

  /** Daftar semua modul yang ditolak beserta alasannya. */
  getRejectedModules() {
    return [...this._rejectedModules];
  }
}
