// @ts-nocheck
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
    const listener = (event, data) => callback(data);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },

  // Docker Sandbox API (Eksekusi kode terisolasi)
  checkDockerStatus: () => ipcRenderer.invoke('check-docker-status'),
  runDockerSandbox: (code, language) => ipcRenderer.invoke('run-docker-sandbox', { code, language }),

  // Airdrop Stealth API
  runAirdropStealth: (taskName, params) => ipcRenderer.invoke('run-airdrop-stealth', { taskName, params })
});
