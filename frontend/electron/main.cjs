const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
// MATIKAN AKSELERASI GPU SEAWAL MUNGKIN UNTUK MENCEGAH CRASH GPU
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

const path = require('path');
const fs = require('fs');
const { exec, execSync } = require('child_process');
const { pathToFileURL } = require('url');
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

// Daftarkan skema protokol kustom sebagai hak istimewa (harus dilakukan sebelum app ready)
protocol.registerSchemesAsPrivileged([
  { scheme: 'mamet', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

const isDev = process.env.NODE_ENV === 'development';

let mainWindow;

// ===== AUTO-UPDATER (Delta OTA Patching) =====
// Hanya aktif di production build, tidak di development
function setupAutoUpdater() {
  if (isDev) return; // Jangan jalankan auto-updater saat development

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
        mainWindow.webContents.send('update-status', {
          status: 'available',
          version: info.version,
          message: `Versi baru ${info.version} tersedia. Mengunduh...`
        });
      }
    });

    autoUpdater.on('update-not-available', () => {
      console.log('[Auto-Updater] Aplikasi sudah versi terbaru.');
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
        });
      }
    });

    autoUpdater.on('error', (err) => {
      console.error('[Auto-Updater] Error:', err.message);
    });

    // Periksa pembaruan 5 detik setelah aplikasi siap
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.error('[Auto-Updater] Gagal memeriksa pembaruan:', err.message);
      });
    }, 5000);

    // Periksa pembaruan setiap 4 jam
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }, 4 * 60 * 60 * 1000);

  } catch (err) {
    console.error('[Auto-Updater] Modul tidak tersedia (kemungkinan mode development):', err.message);
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
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  const startUrl = isDev 
    ? 'http://localhost:5173' 
    : 'mamet://app/index.html';

  mainWindow.loadURL(startUrl);

  // LOG RENDERER CONSOLE TO TERMINAL FOR DEBUGGING
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR'];
    console.log(`[Renderer ${levels[level] || 'LOG'}]: ${message} (at ${sourceId}:${line})`);
  });

  if (isDev) {
    // DevTools dinonaktifkan agar tidak mengganggu. Tekan F12 secara manual jika perlu debug.
    // mainWindow.webContents.openDevTools();
  } else {
    // TEMPORARY: Buka devtools di production untuk debug
    // mainWindow.webContents.openDevTools();
  }
}

// Izinkan pemuatan ES module dari file:// protocol (penting untuk Vite)
app.commandLine.appendSwitch('allow-file-access-from-files');

app.whenReady().then(() => {
  // Gunakan protocol.handle untuk Electron terbaru dengan membaca file dari ASAR via fs
  protocol.handle('mamet', async (request) => {
    try {
      // request.url berbentuk "mamet://app/index.html" atau "mamet://app/assets/..."
      // Hapus query parameters atau hash jika ada
      const cleanUrl = request.url.split('?')[0].split('#')[0];
      const urlPath = cleanUrl.replace('mamet://app/', '');
      
      // Kembalikan file index.html jika urlPath kosong
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

// --- IPC HANDLERS UNTUK OTONOMI DESKTOP (PHASE 3) ---

// 1. Surgical File Editing (Membutuhkan Konfirmasi)
ipcMain.handle('edit-file-surgical', async (event, { filePath, content }) => {
  try {
    // === KEAMANAN: Validasi path - cegah path traversal ===
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

    // === KEAMANAN: Blokir ekstensi file berbahaya ===
    const dangerousExts = ['.exe', '.bat', '.cmd', '.com', '.vbs', '.ps1', '.msi', '.dll', '.sys', '.reg'];
    const fileExt = path.extname(normalizedPath).toLowerCase();
    if (dangerousExts.includes(fileExt)) {
      return { success: false, message: `DITOLAK: Membuat/mengubah file dengan ekstensi ${fileExt} tidak diizinkan.` };
    }

    // Keamanan Ketat: Tampilkan pop-up dialog ke user sebelum mengizinkan robot mengedit file
    const response = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Batal', 'Izinkan Eksekusi'],
      defaultId: 0,
      title: 'Peringatan Keamanan (Surgical Edit)',
      message: `Mamet AI meminta izin untuk mengubah file secara langsung:\n\n${normalizedPath}\n\nApakah Anda menyetujui perubahan ini?`
    });

    if (response.response === 1) { // User menekan "Izinkan Eksekusi"
      fs.writeFileSync(normalizedPath, content, 'utf8');
      return { success: true, message: 'File berhasil diperbarui.' };
    } else {
      return { success: false, message: 'Akses ditolak oleh pengguna.' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 2. Terminal Command Execution (Otonomi Penuh)
ipcMain.handle('run-terminal-command', async (event, { command }) => {
  try {
    // === KEAMANAN: Blokir perintah destruktif yang sangat berbahaya ===
    const lowerCmd = command.toLowerCase().replace(/\s+/g, ' ').trim();
    const blockedPatterns = [
      /format\s+[a-z]:/i,                    // format C:
      /del\s+\/[sf]/i,                        // del /s /f (recursive force delete)
      /rmdir\s+\/[sq]/i,                      // rmdir /s /q
      /rd\s+\/[sq]/i,                         // rd /s /q
      /reg\s+(delete|add)/i,                  // Registry manipulation
      /net\s+user/i,                          // User account manipulation
      /schtasks\s+\/create/i,                 // Scheduled task creation
      /powershell.*-encodedcommand/i,         // Encoded PowerShell (obfuscation)
      /powershell.*downloadstring/i,          // Remote download execution
      /powershell.*invoke-webrequest.*\|.*iex/i, // Download & execute
      /certutil.*-urlcache/i,                 // certutil download abuse
      /bitsadmin.*\/transfer/i,               // BITS download abuse
      /shutdown\s+\/[sr]/i,                   // System shutdown/restart
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
        // === KEAMANAN: Timeout 30 detik untuk mencegah hanging process ===
        const childProcess = exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
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

// 3. Folder Selection for Workspace
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) {
    return null;
  } else {
    return result.filePaths[0]; // Returns absolute path
  }
});

// 4. IPC untuk menerima status update dari renderer (untuk logging)
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

// 5. Mendapatkan versi aplikasi saat ini
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// --- DOCKER LOCAL SANDBOX (Eksekusi Kode Terisolasi) ---

// 6. Cek apakah Docker Desktop terinstal & berjalan
ipcMain.handle('check-docker-status', async () => {
  try {
    execSync('docker info', { timeout: 5000, stdio: 'pipe' });
    return { available: true, message: 'Docker Desktop aktif dan siap digunakan.' };
  } catch (error) {
    return { available: false, message: 'Docker tidak terdeteksi. Sandbox akan menggunakan Piston API sebagai fallback.' };
  }
});

// 7. Eksekusi kode di Docker Container yang terisolasi
ipcMain.handle('run-docker-sandbox', async (event, { code, language }) => {
  try {
    // === KEAMANAN: Validasi input dasar ===
    if (!code || typeof code !== 'string' || code.trim().length < 5) {
      return { success: false, output: '', error: 'Kode terlalu pendek atau tidak valid.' };
    }

    if (!['python', 'javascript'].includes(language)) {
      return { success: false, output: '', error: `Bahasa "${language}" tidak didukung. Gunakan python atau javascript.` };
    }

    // === KEAMANAN: Blocklist kode berbahaya ===
    const dangerousPatterns = [
      /import\s+subprocess/i,
      /import\s+socket/i,
      /import\s+http\.server/i,
      /require\s*\(\s*['"]child_process['"]/i,
      /require\s*\(\s*['"]net['"]/i,
      /require\s*\(\s*['"]fs['"]/i,
      /process\.exit/i,
      /os\.system\s*\(/i,
      /exec\s*\(/i,
      /__import__\s*\(/i,
      /eval\s*\(/i,
    ];

    const isCodeDangerous = dangerousPatterns.some(pattern => pattern.test(code));
    if (isCodeDangerous) {
      return { success: false, output: '', error: 'DITOLAK: Kode mengandung pola berbahaya (akses sistem/jaringan) yang diblokir oleh sandbox.' };
    }

    // Cek Docker tersedia
    try {
      execSync('docker info', { timeout: 5000, stdio: 'pipe' });
    } catch (e) {
      return { success: false, output: '', error: 'DOCKER_NOT_AVAILABLE: Docker Desktop tidak terdeteksi atau belum berjalan.' };
    }

    // Tentukan image & perintah berdasarkan bahasa
    const config = language === 'python'
      ? { image: 'python:3.12-slim', cmd: 'python', ext: '.py' }
      : { image: 'node:20-slim', cmd: 'node', ext: '.js' };

    // Tulis kode ke file temporary di workspace
    const tmpDir = path.join(app.getPath('temp'), 'mamet-sandbox');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const tmpFile = path.join(tmpDir, `sandbox_code${config.ext}`);
    fs.writeFileSync(tmpFile, code, 'utf8');

    // === EKSEKUSI DOCKER DENGAN FLAG KEAMANAN KETAT ===
    // --rm              : Hapus kontainer otomatis setelah selesai
    // --network=none    : Blokir semua akses internet
    // --memory=128m     : Batasi RAM 128MB
    // --cpus=0.5        : Batasi CPU 50%
    // --read-only       : Filesystem read-only
    // --tmpfs /tmp      : Hanya /tmp yang writable (max 64MB)
    // --no-new-privileges: Cegah eskalasi privilege
    // -v (bind mount)   : Mount file kode ke /app (read-only)
    const dockerCmd = [
      'docker', 'run',
      '--rm',
      '--network=none',
      '--memory=128m',
      '--cpus=0.5',
      '--read-only',
      '--tmpfs', '/tmp:size=64m',
      '--no-new-privileges',
      '--user', '1000:1000',
      '-v', `"${tmpFile.replace(/\\/g, '/')}:/app/code${config.ext}:ro"`,
      '-w', '/app',
      config.image,
      config.cmd, `/app/code${config.ext}`
    ].join(' ');

    console.log(`[Docker Sandbox] Menjalankan: ${config.image} (${language})`);

    return new Promise((resolve) => {
      const childProcess = exec(dockerCmd, {
        timeout: 30000,  // Kill setelah 30 detik
        maxBuffer: 1024 * 1024, // Max output 1MB
        windowsHide: true
      }, (error, stdout, stderr) => {
        // Bersihkan file temporary
        try { fs.unlinkSync(tmpFile); } catch (e) {}

        if (error) {
          // Cek apakah timeout
          if (error.killed) {
            resolve({
              success: false,
              output: stdout || '',
              error: 'TIMEOUT: Eksekusi kode melebihi batas waktu 30 detik dan telah dihentikan paksa.'
            });
          } else {
            resolve({
              success: false,
              output: stdout || '',
              error: stderr || error.message || 'Eksekusi gagal tanpa pesan error spesifik.'
            });
          }
        } else {
          resolve({
            success: true,
            output: (stdout || '').trim(),
            error: (stderr || '').trim()
          });
        }
      });
    });
  } catch (err) {
    return { success: false, output: '', error: `Docker Sandbox error: ${err.message}` };
  }
});
