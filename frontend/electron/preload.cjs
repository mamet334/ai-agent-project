const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // =============================================
  // FOLDER & FILE DIALOGS
  // =============================================
  
  // Adapter untuk handler 'select-folder' di main.cjs
  // Handler mengembalikan string/null, FolderSelector mengharapkan { canceled, filePaths }
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

  // Listener untuk pesan dari main process
  onUpdateStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('update-status', handler);
    // Return fungsi unsubscribe
    return () => ipcRenderer.removeListener('update-status', handler);
  },
});