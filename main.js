const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const https = require('https');
const http  = require('http');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300, height: 820, minWidth: 960, minHeight: 650,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#0f1117',
    show: false,
    title: 'Challan Sender v2 — UP Traffic Department'
  });
  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── helpers ──────────────────────────────────────────────────────────────────
function httpsRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const mod = options.protocol === 'http:' ? http : https;
    const req = mod.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// ── IPC: open file dialog ─────────────────────────────────────────────────────
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Spreadsheet', extensions: ['xlsx','xlsm','csv'] }]
  });
  if (result.canceled) return null;
  const fp = result.filePaths[0];
  return { name: path.basename(fp), data: fs.readFileSync(fp).toString('base64'), ext: path.extname(fp).toLowerCase() };
});

// ── IPC: save log ─────────────────────────────────────────────────────────────
ipcMain.handle('save-log', async (_, { content }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `challan-log-${Date.now()}.txt`,
    filters: [{ name: 'Text', extensions: ['txt'] }]
  });
  if (result.canceled) return { success: false };
  fs.writeFileSync(result.filePath, content, 'utf8');
  return { success: true };
});

// ── IPC: settings ─────────────────────────────────────────────────────────────
ipcMain.handle('load-settings', async () => {
  const p = path.join(app.getPath('userData'), 'settings_v2.json');
  try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p,'utf8')); } catch(e){}
  return null;
});
ipcMain.handle('save-settings', async (_, s) => {
  fs.writeFileSync(path.join(app.getPath('userData'), 'settings_v2.json'), JSON.stringify(s,null,2),'utf8');
  return { success: true };
});

// ══════════════════════════════════════════════════════════════════════════════
//  REAL SMS SEND  — Fast2SMS
//  API Docs: https://docs.fast2sms.com
// ══════════════════════════════════════════════════════════════════════════════
ipcMain.handle('send-sms', async (_, { apiKey, phone, message, senderId }) => {
  try {
    // Clean number — 10 digits only for Fast2SMS
    let num = String(phone).replace(/\D/g,'');
    if (num.length === 12 && num.startsWith('91')) num = num.slice(2);
    if (num.length === 13 && num.startsWith('091')) num = num.slice(3);
    if (num.length !== 10) return { success: false, error: `Invalid number: ${phone}` };

    const payload = JSON.stringify({
      route: 'q',                   // quick/transactional route
      message: message,
      language: 'unicode',          // supports Hindi (Devanagari)
      flash: 0,
      numbers: num,
      sender_id: senderId || 'UPTRFC'
    });

    const options = {
      hostname: 'www.fast2sms.com',
      path: '/dev/bulkV2',
      method: 'POST',
      headers: {
        'authorization': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const res = await httpsRequest(options, payload);
    if (res.status === 200 && res.body && res.body.return === true) {
      return { success: true, requestId: res.body.request_id };
    }
    return { success: false, error: JSON.stringify(res.body) };
  } catch(err) {
    return { success: false, error: err.message };
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  REAL WHATSAPP SEND  — supports 3 providers
//  1. AiSensy  (https://aisensy.com)
//  2. Gupshup  (https://www.gupshup.io)
//  3. Twilio   (https://twilio.com)
// ══════════════════════════════════════════════════════════════════════════════
ipcMain.handle('send-whatsapp', async (_, { provider, config, phone, message }) => {
  try {
    let num = String(phone).replace(/\D/g,'');
    if (num.length === 10) num = '91' + num;

    // ── AiSensy ──────────────────────────────────────────────────────────────
    if (provider === 'aisensy') {
      const payload = JSON.stringify({
        apiKey: config.apiKey,
        campaignName: config.campaignName || 'challan_notice',
        destination: num,
        userName: config.userName || 'UP Traffic Dept',
        templateParams: [],
        source: 'challan-sender-app',
        media: {},
        buttons: [],
        carouselCards: [],
        location: {},
        paramsFallbackValue: { FirstName: 'User' }
      });
      const options = {
        hostname: 'backend.aisensy.com',
        path: '/campaign/t1/api/v2',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      };
      const res = await httpsRequest(options, payload);
      if (res.status === 200) return { success: true };
      return { success: false, error: JSON.stringify(res.body) };
    }

    // ── Gupshup ──────────────────────────────────────────────────────────────
    if (provider === 'gupshup') {
      const formData = new URLSearchParams({
        channel: 'whatsapp',
        source: config.sourcePhone,    // your Gupshup WhatsApp number
        destination: num,
        message: JSON.stringify({ type: 'text', text: message }),
        'src.name': config.appName
      }).toString();
      const options = {
        hostname: 'api.gupshup.io',
        path: '/sm/api/v1/msg',
        method: 'POST',
        headers: {
          'apikey': config.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(formData)
        }
      };
      const res = await httpsRequest(options, formData);
      if (res.status === 202 || res.status === 200) return { success: true };
      return { success: false, error: JSON.stringify(res.body) };
    }

    // ── Twilio ────────────────────────────────────────────────────────────────
    if (provider === 'twilio') {
      const formData = new URLSearchParams({
        From: `whatsapp:+${config.fromNumber}`,
        To:   `whatsapp:+${num}`,
        Body: message
      }).toString();
      const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
      const options = {
        hostname: 'api.twilio.com',
        path: `/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(formData)
        }
      };
      const res = await httpsRequest(options, formData);
      if (res.status === 201) return { success: true, sid: res.body.sid };
      return { success: false, error: JSON.stringify(res.body) };
    }

    // ── Manual fallback ───────────────────────────────────────────────────────
    const url = `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
    await shell.openExternal(url);
    return { success: true, manual: true };

  } catch(err) {
    return { success: false, error: err.message };
  }
});

// ── IPC: open URL (manual fallback) ──────────────────────────────────────────
ipcMain.handle('open-url', async (_, url) => {
  await shell.openExternal(url);
  return { success: true };
});
