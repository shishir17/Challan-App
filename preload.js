const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  openWhatsApp: (data) => ipcRenderer.invoke('open-whatsapp', data),
  openSMS: (data) => ipcRenderer.invoke('open-sms', data),
  saveLog: (data) => ipcRenderer.invoke('save-log', data),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s)
});
