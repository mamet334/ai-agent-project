const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
// MATIKAN AKSELERASI GPU SEAWAL MUNGKIN UNTUK MENCEGAH CRASH GPU
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

const path = require('path');
const fs = require('fs');
const { exec, execSync } = require('child_process');
const os = require('os');

process.on('uncaughtException', (err) => {
  try {
    fs.writeFileSync(path.join(os.tmpdir(), 'mamet-ai-crash-error.log'), `Uncaught Exception:\n${err.stack}\n`);
  } catch (e) {}
});

process.on('unhandledRejection', (reason, promise) => {
  try {
    fs.writeFileSync(path.join(os.tmpdir(), 'mamet-ai-crash-promise.log'), `Unhandled Rejection at: ${promise}\nReason: ${reason}\n`);
  } catch (e) {}
});

// Daftarkan skema protokol kusto
protocol.registerSchemesAsPrivileged([
  { scheme: 'mamet', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

const isDev = process.env.NODE_ENV === 'development';
let mainWindow;

// ===== AUTO-UPDATER (Delta OTA Patching) =====
function setupAutoUpdater() {
  if (isDev) return;

  try {
    const { autoUpdater } = require('electron-updater');

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      console.log('[Auto-Updater] Memeriksa pembaruan...');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('[Auto-Updater] Pembaruan tersedia:', info.version);
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          buttons: ['OK', 'Nanti Saja'],
          defaultId: 0,
          title: 'Update Tersedia',
          message: `Versi ${info.version} tersedia.\n\nMamet AI akan mengunduhnya di latar belakang.`
        }).catch(() => {});
        mainWindow.webContents.send('update-status', {
          status: 'available',
          version: info.version,
          message: `Versi baru ${info.version} tersedia. Mengunduh...`
        });
      }
    });

    autoUpdater.on('update-not-available', () => {
      console.log('[Auto-Updater] Aplikasi sudah versi terbaru.');
      if (mainWindow) {
        mainWindow.webContents.send('update-status', {
          status: 'not-available',
          message: 'Aplikasi Anda sudah di versi terbaru.'
        });
      }
    });

    autoUpdater.on('download-progress', (progress) => {
      const percent = Math.round(progress.percent);
      console.log(`[Auto-Updater] Mengunduh: ${percent}%`);
      if (mainWindow) {
        mainWindow.webContents.send('update-status', {
          status: 'downloading',
          percent: percent,
          message: `Mengunduh pembaruan... ${percent}%`
        });
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[Auto-Updater] Pembaruan selesai diunduh:', info.version);
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          buttons: ['Restart Sekarang', 'Nanti Saja'],
          defaultId: 0,
          title: 'Pembaruan Mamet AI',
          message: `Versi ${info.version} telah berhasil diunduh.\n\nAplikasi akan dimulai ulang untuk menerapkan pembaruan.`
        }).then((result) => {
          if (result.response === 0) {
            autoUpdater.quitAndInstall(false, true);
          }
        }).catch(() => {});
      }
    });

    autoUpdater.on('error', (err) => {
      console.error('[Auto-Updater] Error:', err.message);
    });

    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.error('[Auto-Updater] Gagal memeriksa pembaruan:', err.message);
      });
    }, 5000);

    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }, 4 * 60 * 60 * 1000);

  } catch (err) {
    console.error('[Auto-Updater] Modul tidak tersedia:', err.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Mamet AI - Desktop Edition',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: false,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadURL('mamet://app/index.html').catch(err => {
      const logMsg = `[FATAL] loadURL mamet:// gagal: ${err.message}\n`;
      console.error(logMsg);
      fs.appendFileSync(path.join(os.tmpdir(), 'mamet-renderer.log'), logMsg);
    });
  }

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR'];
    const logLine = `[Renderer ${levels[level] || 'LOG'}]: ${message} (at ${sourceId}:${line})\n`;
    console.log(logLine);
    fs.appendFileSync(path.join(os.tmpdir(), 'mamet-renderer.log'), logLine);
  });
}

app.commandLine.appendSwitch('allow-file-access-from-files');

app.whenReady().then(() => {
  protocol.handle('mamet', async (request) => {
    try {
      const cleanUrl = request.url.split('?')[0].split('#')[0];
      const urlPath = cleanUrl.replace('mamet://app/', '');
      const relativePath = urlPath === '' || urlPath === 'index.html' ? 'index.html' : urlPath;
      const filePath = path.normalize(path.join(__dirname, '../dist', relativePath));

      if (!fs.existsSync(filePath)) {
        return new Response('File Not Found', { status: 404 });
      }

      const data = fs.readFileSync(filePath);
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.json': 'application/json',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.otf': 'font/otf'
      };
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = mimeTypes[ext] || 'application/octet-stream';

      return new Response(data, {
        headers: { 'Content-Type': mimeType }
      });
    } catch (err) {
      return new Response(`Protocol Error: ${err.message}`, { status: 500 });
    }
  });

  createWindow();
  setupAutoUpdater();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// ========== IPC HANDLERS ==========

const { runAirdropTask } = require('./airdropEngine.cjs');

// ✅ Tentukan root proyek secara absolut (folder induk dari 'frontend/electron/')
// Karena main.cjs berada di frontend/electron/, maka __dirname = .../frontend/electron
// PROJECT_ROOT = .../mamet os ecosystem/
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// 0. Airdrop Stealth Engine
ipcMain.handle('run-airdrop-stealth', async (event, { taskName, params }) => {
  try {
    const response = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Batal', 'Jalankan Airdrop'],
      defaultId: 1,
      title: 'Konfirmasi Airdrop Farmer',
      message: `Mamet AI meminta izin untuk membuka Stealth Browser untuk task: ${taskName}\n\nLanjutkan?`
    });

    if (response.response === 1) {
      return await runAirdropTask(taskName, params);
    } else {
      return { success: false, message: 'Dibatalkan oleh pengguna.' };
    }
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// 1. Surgical File Editing
ipcMain.handle('edit-file-surgical', async (event, { filePath, content }) => {
  try {
    const normalizedPath = path.resolve(filePath);
    const dangerousPaths = [
      process.env.SYSTEMROOT || 'C:\\Windows',
      process.env.PROGRAMFILES || 'C:\\Program Files',
      process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
    ];
    const isDangerousPath = dangerousPaths.some(dp => normalizedPath.toLowerCase().startsWith(dp.toLowerCase()));
    if (isDangerousPath) {
      return { success: false, message: `DITOLAK: Menulis ke direktori sistem (${normalizedPath}) dilarang.` };
    }

    const dangerousExts = ['.exe', '.bat', '.cmd', '.com', '.vbs', '.ps1', '.msi', '.dll', '.sys', '.reg'];
    const fileExt = path.extname(normalizedPath).toLowerCase();
    if (dangerousExts.includes(fileExt)) {
      return { success: false, message: `DITOLAK: Membuat/mengubah file dengan ekstensi ${fileExt} tidak diizinkan.` };
    }

    const response = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Batal', 'Izinkan Eksekusi'],
      defaultId: 0,
      title: 'Peringatan Keamanan (Surgical Edit)',
      message: `Mamet AI meminta izin untuk mengubah file secara langsung:\n\n${normalizedPath}\n\nApakah Anda menyetujui perubahan ini?`
    });

    if (response.response === 1) {
      fs.writeFileSync(normalizedPath, content, 'utf8');
      return { success: true, message: 'File berhasil diperbarui.' };
    } else {
      return { success: false, message: 'Akses ditolak oleh pengguna.' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 2. Terminal Command Execution
ipcMain.handle('run-terminal-command', async (event, { command }) => {
  try {
    const lowerCmd = command.toLowerCase().replace(/\s+/g, ' ').trim();
    const blockedPatterns = [
      /format\s+[a-z]:/i, /del\s+\/[sf]/i, /rmdir\s+\/[sq]/i, /rd\s+\/[sq]/i,
      /reg\s+(delete|add)/i, /net\s+user/i, /schtasks\s+\/create/i,
      /powershell.*-encodedcommand/i, /powershell.*downloadstring/i,
      /powershell.*invoke-webrequest.*\|.*iex/i, /certutil.*-urlcache/i,
      /bitsadmin.*\/transfer/i, /shutdown\s+\/[sr]/i,
    ];
    const isBlocked = blockedPatterns.some(pattern => pattern.test(lowerCmd));
    if (isBlocked) {
      return { success: false, output: `DITOLAK OLEH KEAMANAN: Perintah "${command}" terdeteksi sebagai operasi berbahaya dan telah diblokir.` };
    }

    const response = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Batal', 'Izinkan Terminal'],
      defaultId: 0,
      title: 'Peringatan Keamanan (Terminal)',
      message: `Mamet AI meminta izin untuk menjalankan perintah di Terminal / CMD:\n\n"${command}"\n\nTindakan ini bisa berbahaya. Lanjutkan?`
    });

    if (response.response === 1) {
      return new Promise((resolve) => {
        exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
          if (error) {
            resolve({ success: false, output: stderr || error.message });
          } else {
            resolve({ success: true, output: stdout });
          }
        });
      });
    } else {
      return { success: false, output: 'Akses eksekusi terminal ditolak oleh pengguna.' };
    }
  } catch (error) {
    return { success: false, output: error.message };
  }
});

// 3. Folder Selection
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

// 4. Check for updates manually
ipcMain.handle('check-for-updates', async () => {
  if (isDev) return { status: 'dev-mode', message: 'Auto-updater dinonaktifkan dalam mode development.' };
  try {
    const { autoUpdater } = require('electron-updater');
    const result = await autoUpdater.checkForUpdatesAndNotify();
    return { status: 'checked', version: result?.updateInfo?.version || 'unknown' };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
});

// 5. Dapatkan versi aplikasi saat ini
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// 6. Docker status check
ipcMain.handle('check-docker-status', async () => {
  try {
    execSync('docker info', { timeout: 5000, stdio: 'pipe' });
    return { available: true, message: 'Docker Desktop aktif dan siap digunakan.' };
  } catch (error) {
    return { available: false, message: 'Docker tidak terdeteksi. Sandbox akan menggunakan Piston API sebagai fallback.' };
  }
});

// 7. Run code in Docker sandbox
ipcMain.handle('run-docker-sandbox', async (event, { code, language }) => {
  try {
    if (!code || typeof code !== 'string' || code.trim().length < 5) {
      return { success: false, output: '', error: 'Kode terlalu pendek atau tidak valid.' };
    }
    if (!['python', 'javascript'].includes(language)) {
      return { success: false, output: '', error: `Bahasa "${language}" tidak didukung. Gunakan python atau javascript.` };
    }

    const dangerousPatterns = [
      /import\s+subprocess/i, /import\s+socket/i, /import\s+http\.server/i,
      /require\s*\(\s*['"]child_process['"]/i, /require\s*\(\s*['"]net['"]/i,
      /require\s*\(\s*['"]fs['"]/i, /process\.exit/i, /os\.system\s*\(/i,
      /exec\s*\(/i, /__import__\s*\(/i, /eval\s*\(/i,
    ];
    const isCodeDangerous = dangerousPatterns.some(pattern => pattern.test(code));
    if (isCodeDangerous) {
      return { success: false, output: '', error: 'DITOLAK: Kode mengandung pola berbahaya (akses sistem/jaringan) yang diblokir oleh sandbox.' };
    }

    try {
      execSync('docker info', { timeout: 5000, stdio: 'pipe' });
    } catch (e) {
      return { success: false, output: '', error: 'DOCKER_NOT_AVAILABLE: Docker Desktop tidak terdeteksi atau belum berjalan.' };
    }

    const config = language === 'python'
      ? { image: 'python:3.12-slim', cmd: 'python', ext: '.py' }
      : { image: 'node:20-slim', cmd: 'node', ext: '.js' };

    const tmpDir = path.join(app.getPath('temp'), 'mamet-sandbox');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, `sandbox_code${config.ext}`);
    fs.writeFileSync(tmpFile, code, 'utf8');

    const dockerCmd = [
      'docker', 'run', '--rm', '--network=none', '--memory=128m', '--cpus=0.5',
      '--read-only', '--tmpfs', '/tmp:size=64m', '--no-new-privileges',
      '--user', '1000:1000', '-v', `"${tmpFile.replace(/\\/g, '/')}:/app/code${config.ext}:ro"`,
      '-w', '/app', config.image, config.cmd, `/app/code${config.ext}`
    ].join(' ');

    return new Promise((resolve) => {
      exec(dockerCmd, { timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
        try { fs.unlinkSync(tmpFile); } catch (e) {}
        if (error) {
          resolve({
            success: false,
            output: stdout || '',
            error: error.killed ? 'TIMEOUT: Eksekusi kode melebihi batas waktu 30 detik.' : (stderr || error.message)
          });
        } else {
          resolve({ success: true, output: (stdout || '').trim(), error: (stderr || '').trim() });
        }
      });
    });
  } catch (err) {
    return { success: false, output: '', error: `Docker Sandbox error: ${err.message}` };
  }
});

// =============================================
// 8. FILE SYSTEM HANDLERS (StorageManager Backend)
// =============================================
// ✅ Semua handler menggunakan PROJECT_ROOT untuk resolusi path relatif

ipcMain.handle('fs:readFile', async (event, filePath) => {
  try {
    const isAbsolute = path.isAbsolute(filePath);
    const normalizedPath = isAbsolute 
      ? path.resolve(filePath) 
      : path.resolve(PROJECT_ROOT, filePath);
    
    console.log(`[FS] readFile: "${filePath}" → normalized: "${normalizedPath}"`);
    
    if (!fs.existsSync(normalizedPath)) {
      console.warn(`[FS] File tidak ditemukan: ${normalizedPath}`);
      return null;
    }
    return fs.readFileSync(normalizedPath, 'utf-8');
  } catch (error) {
    console.error('[FS] Gagal membaca file:', filePath, error);
    return null;
  }
});

ipcMain.handle('fs:writeFile', async (event, { filePath, content }) => {
  try {
    const isAbsolute = path.isAbsolute(filePath);
    const normalizedPath = isAbsolute 
      ? path.resolve(filePath) 
      : path.resolve(PROJECT_ROOT, filePath);
    
    console.log(`[FS] writeFile: "${filePath}" → normalized: "${normalizedPath}"`);
    
    const dir = path.dirname(normalizedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(normalizedPath, String(content), 'utf-8');
    return true;
  } catch (error) {
    console.error('[FS] Gagal menulis file:', filePath, error);
    return false;
  }
});

ipcMain.handle('fs:deleteFile', async (event, filePath) => {
  try {
    const isAbsolute = path.isAbsolute(filePath);
    const normalizedPath = isAbsolute 
      ? path.resolve(filePath) 
      : path.resolve(PROJECT_ROOT, filePath);
    
    if (!fs.existsSync(normalizedPath)) {
      return false;
    }
    fs.unlinkSync(normalizedPath);
    return true;
  } catch (error) {
    console.error('[FS] Gagal menghapus file:', filePath, error);
    return false;
  }
});

ipcMain.handle('fs:listFiles', async (event, dirPath) => {
  try {
    const isAbsolute = path.isAbsolute(dirPath);
    const normalizedPath = isAbsolute 
      ? path.resolve(dirPath) 
      : path.resolve(PROJECT_ROOT, dirPath);
    
    if (!fs.existsSync(normalizedPath) || !fs.statSync(normalizedPath).isDirectory()) {
      return [];
    }
    const entries = fs.readdirSync(normalizedPath, { withFileTypes: true });
    return entries.map(entry => {
      const fullPath = path.join(normalizedPath, entry.name);
      let size = 0;
      try {
        if (entry.isFile()) {
          size = fs.statSync(fullPath).size;
        }
      } catch (e) { /* abaikan */ }
      return {
        name: entry.name,
        path: path.join(dirPath, entry.name).replace(/\\/g, '/'),
        type: entry.isDirectory() ? 'dir' : 'file',
        size
      };
    });
  } catch (error) {
    console.error('[FS] Gagal listing direktori:', dirPath, error);
    return [];
  }
});

ipcMain.handle('fs:getFileInfo', async (event, filePath) => {
  try {
    const isAbsolute = path.isAbsolute(filePath);
    const normalizedPath = isAbsolute 
      ? path.resolve(filePath) 
      : path.resolve(PROJECT_ROOT, filePath);
    
    if (!fs.existsSync(normalizedPath)) {
      return null;
    }
    const stat = fs.statSync(normalizedPath);
    const ext = path.extname(normalizedPath).toLowerCase();
    const mimeTypes = {
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.js': 'text/javascript',
      '.jsx': 'text/javascript',
      '.ts': 'text/typescript',
      '.json': 'application/json',
      '.html': 'text/html',
      '.css': 'text/css',
    };
    return {
      path: filePath,
      size: stat.size,
      type: mimeTypes[ext] || 'application/octet-stream',
      createdAt: stat.birthtimeMs,
      modifiedAt: stat.mtimeMs,
      backend: 'file-system'
    };
  } catch (error) {
    console.error('[FS] Gagal mendapatkan info file:', filePath, error);
    return null;
  }
});

ipcMain.handle('fs:fileExists', async (event, filePath) => {
  try {
    const isAbsolute = path.isAbsolute(filePath);
    const normalizedPath = isAbsolute 
      ? path.resolve(filePath) 
      : path.resolve(PROJECT_ROOT, filePath);
    
    return fs.existsSync(normalizedPath);
  } catch (error) {
    return false;
  }
});

// =============================================
// 9. RECURSIVE FILE LISTING (untuk FileIndexService)
// =============================================

ipcMain.handle('fs:listFilesRecursive', async (event, dirPath) => {
  try {
    const isAbsolute = path.isAbsolute(dirPath);
    const normalizedPath = isAbsolute 
      ? path.resolve(dirPath) 
      : path.resolve(PROJECT_ROOT, dirPath);
    
    console.log(`[FS] listFilesRecursive: "${dirPath}" → normalized: "${normalizedPath}"`);
    
    if (!fs.existsSync(normalizedPath) || !fs.statSync(normalizedPath).isDirectory()) {
      console.warn(`[FS] Direktori tidak ditemukan atau bukan folder: ${normalizedPath}`);
      return [];
    }

    const results = [];

    function walkDir(currentPath, relativePath) {
      let entries;
      try {
        entries = fs.readdirSync(currentPath, { withFileTypes: true });
      } catch (e) {
        console.warn(`[FS] Gagal membaca direktori: ${currentPath}`, e.message);
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativeEntry = path.join(relativePath, entry.name).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          walkDir(fullPath, relativeEntry);
        } else if (entry.isFile()) {
          results.push(relativeEntry);
        }
      }
    }

    walkDir(normalizedPath, '');
    
    console.log(`[FS] listFilesRecursive selesai: ${results.length} files ditemukan`);
    return results;
  } catch (error) {
    console.error('[FS] Gagal listFilesRecursive:', dirPath, error);
    return [];
  }
});