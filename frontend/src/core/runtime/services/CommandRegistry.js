/**
 * CommandRegistry.js — Safe Command Execution Layer (PR#1)
 *
 * Mengganti pendekatan blocklist dengan WHITELIST-FIRST:
 * - Default: tolak semua
 * - Hanya operasi yang terdaftar yang bisa dijalankan
 * - Setiap operasi punya metadata: destructive, requiresWorkspaceBoundary
 *
 * Selaras dengan Prinsip Owner Sovereignty — keputusan akhir tetap di tangan Owner.
 *
 * Integrasi di Kernel Phase 3 dan dipanggil dari AssistantService.runCommand()
 */

// =============================================
// COMMAND REGISTRY — Daftar operasi yang diizinkan
// =============================================

/**
 * @typedef {Object} CommandSpec
 * @property {boolean} destructive - true = hapus/overwrite, butuh dialog tegas
 * @property {boolean} requiresWorkspaceBoundary - false = boleh lebih luas (read-only scan)
 * @property {boolean} [restricted] - true = butuh validasi ekstra (runScript)
 * @property {string}  description - deskripsi human-readable untuk dialog konfirmasi
 */

/** @type {Object.<string, CommandSpec>} */
const REGISTERED_COMMANDS = {
  // File & Folder Operations
  createFolder:  { destructive: false, requiresWorkspaceBoundary: true,  description: 'Buat folder baru' },
  deleteFolder:  { destructive: true,  requiresWorkspaceBoundary: true,  description: 'Hapus folder beserta isinya' },
  listFiles:     { destructive: false, requiresWorkspaceBoundary: false, description: 'Tampilkan daftar file (read-only scan)' },
  readFile:      { destructive: false, requiresWorkspaceBoundary: false, description: 'Baca isi file' },
  writeFile:     { destructive: false, requiresWorkspaceBoundary: true,  description: 'Tulis/buat file baru' },
  moveFile:      { destructive: false, requiresWorkspaceBoundary: true,  description: 'Pindahkan file ke lokasi lain' },
  copyFile:      { destructive: false, requiresWorkspaceBoundary: true,  description: 'Salin file ke lokasi lain' },
  renameFile:    { destructive: false, requiresWorkspaceBoundary: true,  description: 'Ganti nama file' },
  deleteFile:    { destructive: true,  requiresWorkspaceBoundary: true,  description: 'Hapus file secara permanen' },
  zipFolder:     { destructive: false, requiresWorkspaceBoundary: true,  description: 'Kompres folder menjadi zip' },
  unzip:         { destructive: false, requiresWorkspaceBoundary: true,  description: 'Ekstrak file zip' },
  // Script — dibatasi ketat
  runScript:     { destructive: false, requiresWorkspaceBoundary: true,  restricted: true, description: 'Jalankan script (butuh validasi)' }
};

// =============================================
// WORKSPACE BOUNDARY CHECK
// =============================================

/**
 * Periksa apakah targetPath berada di dalam workspacePath.
 * @param {string} targetPath
 * @param {string} workspacePath
 * @returns {boolean}
 */
function isInsideWorkspace(targetPath, workspacePath) {
  if (!targetPath || !workspacePath) return false;
  // Normalize path separators
  const normalize = (p) => p.replace(/\\/g, '/').replace(/\/$/, '');
  const normalTarget = normalize(targetPath);
  const normalWorkspace = normalize(workspacePath);
  return normalTarget.startsWith(normalWorkspace + '/') || normalTarget === normalWorkspace;
}

// =============================================
// COMMAND REGISTRY CLASS
// =============================================

export class CommandRegistry {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this._workspacePath = null; // Diset dari luar via setWorkspace()
    this._initialized = false;
  }

  async initialize() {
    this._initialized = true;
    console.log('[CommandRegistry] Initialized — Whitelist-first mode active');
  }

  /**
   * Set workspace path yang aktif.
   * Dipanggil dari UI saat user memilih folder workspace.
   * @param {string} path
   */
  setWorkspace(path) {
    this._workspacePath = path;
    console.log(`[CommandRegistry] Workspace set to: ${path}`);
  }

  getWorkspace() {
    return this._workspacePath;
  }

  /**
   * Validasi apakah commandName terdaftar di whitelist.
   * @param {string} commandName
   * @returns {{ valid: boolean, spec: CommandSpec|null, reason: string }}
   */
  validate(commandName) {
    const spec = REGISTERED_COMMANDS[commandName];
    if (!spec) {
      return {
        valid: false,
        spec: null,
        reason: `Command "${commandName}" tidak terdaftar di CommandRegistry. Hanya command yang terdaftar yang diizinkan.`
      };
    }
    return { valid: true, spec, reason: '' };
  }

  /**
   * Periksa boundary dan kembalikan status akses.
   * @param {string} commandName
   * @param {string} targetPath
   * @returns {{ inWorkspace: boolean, needsPermission: boolean }}
   */
  checkBoundary(commandName, targetPath) {
    const spec = REGISTERED_COMMANDS[commandName];
    if (!spec) return { inWorkspace: false, needsPermission: true };

    // Command read-only (listFiles, readFile) boleh di luar workspace tanpa dialog
    if (!spec.requiresWorkspaceBoundary) {
      return { inWorkspace: true, needsPermission: false };
    }

    const inWorkspace = this._workspacePath
      ? isInsideWorkspace(targetPath, this._workspacePath)
      : false;

    return {
      inWorkspace,
      // Di luar workspace → butuh "izinkan sekali"
      needsPermission: !inWorkspace
    };
  }

  /**
   * Entry point utama: execute command dengan validasi whitelist + boundary check.
   *
   * Flow:
   * 1. Validasi commandName ada di whitelist
   * 2. Cek boundary (in/out workspace)
   * 3. Kembalikan { needsConfirmation, isDestructive, inWorkspace } ke caller
   *    → Caller (AssistantService / ConversationEngine) menampilkan dialog yang sesuai
   *    → Setelah user konfirmasi, caller memanggil executeConfirmed()
   *
   * @param {string} commandName
   * @param {Object} args - argument command (path, content, dll)
   * @returns {{ canProceed: boolean, needsConfirmation: boolean, isDestructive: boolean, inWorkspace: boolean, reason: string }}
   */
  prepareExecution(commandName, args = {}) {
    // 1. Whitelist check
    const { valid, spec, reason } = this.validate(commandName);
    if (!valid) {
      return { canProceed: false, needsConfirmation: false, isDestructive: false, inWorkspace: false, reason };
    }

    // 2. Boundary check
    const targetPath = args.path || args.targetPath || args.filePath || '';
    const { inWorkspace, needsPermission } = this.checkBoundary(commandName, targetPath);

    // 3. Tentukan level dialog
    const isDestructive = spec.destructive;
    const needsConfirmation = isDestructive || needsPermission;

    return {
      canProceed: true,
      needsConfirmation,
      isDestructive,
      inWorkspace,
      spec,
      reason: needsConfirmation
        ? (isDestructive
          ? `⚠️ OPERASI DESTRUKTIF: "${spec.description}" di "${targetPath}". Tindakan ini tidak dapat dibatalkan.`
          : `Operasi di luar workspace: "${spec.description}" di "${targetPath}". Izin hanya berlaku untuk request ini saja.`)
        : ''
    };
  }

  /**
   * Eksekusi command setelah konfirmasi user.
   * Saat ini mendelegasikan ke window.electronAPI.
   * Akan diperkaya dengan implementasi per-command yang lebih aman.
   *
   * @param {string} commandName
   * @param {Object} args
   * @returns {Promise<{ success: boolean, output: string, error?: string }>}
   */
  async executeConfirmed(commandName, args = {}) {
    if (!window.electronAPI) {
      return { success: false, output: '', error: 'Electron API tidak tersedia.' };
    }

    console.log(`[CommandRegistry] Executing: ${commandName}`, args);

    try {
      switch (commandName) {
        case 'listFiles': {
          const result = await window.electronAPI.runTerminalCommand(
            `powershell -Command "Get-ChildItem -Path '${args.path}' | Select-Object Name, Length, LastWriteTime, PSIsContainer | ConvertTo-Json"`
          );
          return { success: result?.success ?? true, output: result?.output || '' };
        }

        case 'readFile': {
          const result = await window.electronAPI.runTerminalCommand(
            `powershell -Command "Get-Content -Path '${args.path}' -Raw"`
          );
          return { success: result?.success ?? true, output: result?.output || '' };
        }

        case 'createFolder': {
          const result = await window.electronAPI.runTerminalCommand(
            `powershell -Command "New-Item -ItemType Directory -Path '${args.path}' -Force"`
          );
          return { success: result?.success ?? true, output: result?.output || 'Folder berhasil dibuat.' };
        }

        case 'deleteFolder': {
          const result = await window.electronAPI.runTerminalCommand(
            `powershell -Command "Remove-Item -Recurse -Force -Path '${args.path}'"`
          );
          return { success: result?.success ?? true, output: result?.output || 'Folder berhasil dihapus.' };
        }

        case 'writeFile': {
          const result = await window.electronAPI.editFileSurgical(args.path, args.content || '');
          return { success: result?.success ?? false, output: result?.success ? 'File berhasil ditulis.' : (result?.error || 'Gagal menulis file.') };
        }

        case 'deleteFile': {
          const result = await window.electronAPI.runTerminalCommand(
            `powershell -Command "Remove-Item -Force -Path '${args.path}'"`
          );
          return { success: result?.success ?? true, output: result?.output || 'File berhasil dihapus.' };
        }

        case 'moveFile': {
          const result = await window.electronAPI.runTerminalCommand(
            `powershell -Command "Move-Item -Path '${args.sourcePath}' -Destination '${args.targetPath}' -Force"`
          );
          return { success: result?.success ?? true, output: result?.output || 'File berhasil dipindahkan.' };
        }

        case 'copyFile': {
          const result = await window.electronAPI.runTerminalCommand(
            `powershell -Command "Copy-Item -Path '${args.sourcePath}' -Destination '${args.targetPath}' -Force"`
          );
          return { success: result?.success ?? true, output: result?.output || 'File berhasil disalin.' };
        }

        case 'renameFile': {
          const result = await window.electronAPI.runTerminalCommand(
            `powershell -Command "Rename-Item -Path '${args.path}' -NewName '${args.newName}'"`
          );
          return { success: result?.success ?? true, output: result?.output || 'File berhasil diubah namanya.' };
        }

        case 'zipFolder': {
          const result = await window.electronAPI.runTerminalCommand(
            `powershell -Command "Compress-Archive -Path '${args.path}' -DestinationPath '${args.targetPath}' -Force"`
          );
          return { success: result?.success ?? true, output: result?.output || 'Folder berhasil dikompres.' };
        }

        case 'unzip': {
          const result = await window.electronAPI.runTerminalCommand(
            `powershell -Command "Expand-Archive -Path '${args.path}' -DestinationPath '${args.targetPath}' -Force"`
          );
          return { success: result?.success ?? true, output: result?.output || 'File berhasil diekstrak.' };
        }

        case 'runScript': {
          // runScript — hanya untuk script yang sudah divalidasi
          if (!args.scriptPath) {
            return { success: false, output: '', error: 'scriptPath tidak disediakan.' };
          }
          const ext = args.scriptPath.split('.').pop()?.toLowerCase();
          if (!['ps1', 'sh', 'bat'].includes(ext)) {
            return { success: false, output: '', error: `Ekstensi script "${ext}" tidak diizinkan.` };
          }
          const result = await window.electronAPI.runTerminalCommand(
            `powershell -ExecutionPolicy Bypass -File "${args.scriptPath}"`
          );
          return { success: result?.success ?? true, output: result?.output || '' };
        }

        default:
          return { success: false, output: '', error: `Command "${commandName}" tidak punya implementasi eksekusi.` };
      }
    } catch (err) {
      return { success: false, output: '', error: err?.message || String(err) };
    }
  }

  /**
   * Daftar semua command yang terdaftar (untuk UI/debug).
   * @returns {Array<{ name: string, spec: CommandSpec }>}
   */
  list() {
    return Object.entries(REGISTERED_COMMANDS).map(([name, spec]) => ({ name, spec }));
  }
}
