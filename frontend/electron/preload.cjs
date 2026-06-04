const { contextBridge, ipcRenderer } = require('electron');

// Mengekspos API OS yang sangat dibatasi ke aplikasi React (AIAgent.jsx)
contextBridge.exposeInMainWorld('electronAPI', {
  editFileSurgical: (filePath, content) => ipcRenderer.invoke('edit-file-surgical', { filePath, content }),
  runTerminalCommand: (command) => ipcRenderer.invoke('run-terminal-command', { command }),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  pathSeparator: require('path').sep,
  isDesktopMode: true
});
