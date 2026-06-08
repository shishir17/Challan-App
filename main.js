const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0f1117',
    show: false,
    title: 'Challan Sender — UP Traffic Department'
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── IPC Handlers ──────────────────────────────────────────────────────────────

// Open file dialog
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Spreadsheet Files', extensions: ['xlsx', 'xlsm', 'csv'] }
    ]
  });
  if (result.canceled) return null;
  const filePath = result.filePaths[0];
  const data = fs.readFileSync(filePath);
  return {
    name: path.basename(filePath),
    data: data.toString('base64'),
    ext: path.extname(filePath).toLowerCase()
  };
});

// Open WhatsApp link
ipcMain.handle('open-whatsapp', async (event, { phone, message }) => {
  try {
    // Clean phone number - remove spaces, dashes, +
    let clean = String(phone).replace(/\D/g, '');
    // Add country code if missing (India = 91)
    if (clean.length === 10) clean = '91' + clean;
    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/${clean}?text=${encoded}`;
    await shell.openExternal(url);
    return { success: true, url };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Open SMS link
ipcMain.handle('open-sms', async (event, { phone, message }) => {
  try {
    let clean = String(phone).replace(/\D/g, '');
    if (clean.length === 10) clean = '+91' + clean;
    else clean = '+' + clean;
    const encoded = encodeURIComponent(message);
    // sms: URI works on Windows/Mac/Linux to open default SMS app
    const url = `sms:${clean}?body=${encoded}`;
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Save log to file
ipcMain.handle('save-log', async (event, { content }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `challan-log-${Date.now()}.txt`,
    filters: [{ name: 'Text File', extensions: ['txt'] }]
  });
  if (result.canceled) return { success: false };
  fs.writeFileSync(result.filePath, content, 'utf8');
  return { success: true, path: result.filePath };
});

// Load settings from disk
ipcMain.handle('load-settings', async () => {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch (e) {}
  return null;
});

// Save settings to disk
ipcMain.handle('save-settings', async (event, settings) => {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  return { success: true };
});
