const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog : ()  => ipcRenderer.invoke('open-file-dialog'),
  saveLog        : (d) => ipcRenderer.invoke('save-log', d),
  loadSettings   : ()  => ipcRenderer.invoke('load-settings'),
  saveSettings   : (s) => ipcRenderer.invoke('save-settings', s),
  sendSMS        : (d) => ipcRenderer.invoke('send-sms', d),
  sendWhatsApp   : (d) => ipcRenderer.invoke('send-whatsapp', d),
  openURL        : (u) => ipcRenderer.invoke('open-url', u),
});
