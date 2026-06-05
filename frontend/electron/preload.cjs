const { contextBridge, ipcRenderer } = require('electron');

// Mengekspos API OS yang sangat dibatasi ke aplikasi React (AIAgent.jsx)
contextBridge.exposeInMainWorld('electronAPI', {
  // Fitur Inti Desktop
  editFileSurgical: (filePath, content) => ipcRenderer.invoke('edit-file-surgical', { filePath, content }),
  runTerminalCommand: (command) => ipcRenderer.invoke('run-terminal-command', { command }),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  pathSeparator: '\\',
  isDesktopMode: true,

  // Auto-Updater API
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, data) => callback(data));
  }
});
