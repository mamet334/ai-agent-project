const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const isDev = process.env.NODE_ENV === 'development';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Mamet AI - Desktop Edition',
    icon: path.join(__dirname, '../public/vite.svg'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  const startUrl = isDev 
    ? 'http://localhost:5173' 
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();

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
    // Keamanan Ketat: Tampilkan pop-up dialog ke user sebelum mengizinkan robot mengedit file
    const response = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Batal', 'Izinkan Eksekusi'],
      defaultId: 0,
      title: 'Peringatan Keamanan (Surgical Edit)',
      message: `Mamet AI meminta izin untuk mengubah file secara langsung:\n\n${filePath}\n\nApakah Anda menyetujui perubahan ini?`
    });

    if (response.response === 1) { // User menekan "Izinkan Eksekusi"
      fs.writeFileSync(filePath, content, 'utf8');
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
    const response = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Batal', 'Izinkan Terminal'],
      defaultId: 0,
      title: 'Peringatan Keamanan (Terminal)',
      message: `Mamet AI meminta izin untuk menjalankan perintah di Terminal / CMD:\n\n"${command}"\n\nTindakan ini bisa berbahaya. Lanjutkan?`
    });

    if (response.response === 1) {
      return new Promise((resolve) => {
        exec(command, (error, stdout, stderr) => {
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
