const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // =============================================
  // STORAGE MANAGER — FILE SYSTEM BACKEND
  // =============================================

  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', { filePath, content }),
  deleteFile: (filePath) => ipcRenderer.invoke('fs:deleteFile', filePath),
  listFiles: (dirPath) => ipcRenderer.invoke('fs:listFiles', dirPath),
  listFilesRecursive: (dirPath) => ipcRenderer.invoke('fs:listFilesRecursive', dirPath),
  getFileInfo: (filePath) => ipcRenderer.invoke('fs:getFileInfo', filePath),
  fileExists: (filePath) => ipcRenderer.invoke('fs:fileExists', filePath),

  // =============================================
  // FOLDER & FILE DIALOGS
  // =============================================

  openFolderDialog: async () => {
    try {
      const result = await ipcRenderer.invoke('select-folder');
      if (result === null || result === undefined) {
        return { canceled: true, filePaths: [] };
      }
      return { canceled: false, filePaths: [result] };
    } catch (err) {
      console.error('[Preload] openFolderDialog error:', err);
      return { canceled: true, filePaths: [] };
    }
  },

  // =============================================
  // TERMINAL COMMAND
  // =============================================

  runTerminalCommand: (command) => ipcRenderer.invoke('run-terminal-command', { command }),

  // =============================================
  // SURGICAL FILE EDITING
  // =============================================

  editFileSurgical: (filePath, content) => ipcRenderer.invoke('edit-file-surgical', { filePath, content }),

  // =============================================
  // DOCKER SANDBOX
  // =============================================

  checkDockerStatus: () => ipcRenderer.invoke('check-docker-status'),
  runDockerSandbox: (code, language) => ipcRenderer.invoke('run-docker-sandbox', { code, language }),

  // =============================================
  // AIRDROP STEALTH ENGINE
  // =============================================

  runAirdropTask: (taskName, params) => ipcRenderer.invoke('run-airdrop-stealth', { taskName, params }),

  // =============================================
  // AUTO-UPDATER
  // =============================================

  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  onUpdateStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },
});