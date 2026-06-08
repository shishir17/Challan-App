// ══════════════════════════════════════════════════════════════════════════════
//  Challan Sender — renderer.js
//  UP Traffic Department · Bulk WhatsApp & SMS Messenger
// ══════════════════════════════════════════════════════════════════════════════

// ─── DEFAULTS ────────────────────────────────────────────────────────────────
const DEFAULT_HINDI = `*वाहन चालान सूचना*

प्रिय उपयोगकर्ता,

न्यायालय मुख्य न्यायिक मजिस्ट्रेट परिवहन विभाग के वाहन पोर्टल पर आपके मोबाईल नम्बर पर पंजीकृत वाहन पर चालान जारी किया गया है जिसकी सूचना निम्नवत है :

🔸 *चालान राशि*: ₹{amount}
🔸 *वाहन संख्या*: {vehicle_number}
🔸 *चालान संख्या*: {challan_number}

कृपया निर्धारित राशि का शीघ्र भुगतान करें अन्यथा अतिरिक्त जुर्माना लग सकता है।

भुगतान के लिए नीचे दिए लिंक पर क्लिक करें:
https://vcourts.gov.in

नोट:
1. परिवहन आयुक्त कार्यालय द्वारा संचालित चैटबॉट सिर्फ 8005441222 पर उपलब्ध है जो Blue Tick Verified है। अन्य सभी नम्बर से प्राप्त मैसेज अनाधिकृत हैं।
2. परिवहन विभाग के E-Challan का भुगतान केवल parivahan.gov.in पर ही करें।
3. परिवहन विभाग चालान के भुगतान के लिये किसी भी प्रकार का QR Code अथवा Account Number का प्रायोग नही करता है।

नोट: यदि आपने पहले ही भुगतान कर दिया है तो कृपया इस संदेश को नज़रअंदाज़ करें।`;

const DEFAULT_ENGLISH = `*Traffic Challan Notice*

Dear User,

A traffic challan has been issued against a vehicle registered on your mobile number. Details are as follows:

🔸 *Challan Amount*: Rs.{amount}
🔸 *Vehicle Number*: {vehicle_number}
🔸 *Challan No*: {challan_number}
🔸 *Violator Name*: {violator_name}

Please pay the fine promptly to avoid additional penalties.

Pay here: https://vcourts.gov.in

Note: If you have already paid, please ignore this message.
— UP Traffic Department`;

// ─── STATE ───────────────────────────────────────────────────────────────────
let state = {
  tab: 'send',
  rows: [],
  fileName: '',
  channels: { whatsapp: true, sms: false },
  sending: false,
  stopFlag: false,
  progress: 0,
  currentIdx: -1,
  rowStatus: {},       // index → 'pending'|'sent'|'failed'|'skipped'
  logs: [],
  previewIdx: 0,
  settings: {
    lang: 'hindi',
    delay: 2000,
    hindiTemplate: DEFAULT_HINDI,
    englishTemplate: DEFAULT_ENGLISH,
    countryCode: '91',
    autoOpen: true,
  }
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getContact(row) {
  const raw = String(row['Violator Contact'] || row['Violator Owner Contact'] || '').trim();
  return raw.replace(/\D/g, '');
}

function getTemplate() {
  return state.settings.lang === 'hindi'
    ? state.settings.hindiTemplate
    : state.settings.englishTemplate;
}

function applyTemplate(row) {
  return getTemplate()
    .replace(/\{amount\}/g, row['Amount (Rs.)'] || row['Amount'] || '')
    .replace(/\{vehicle_number\}/g, row['Vehicle Number'] || '')
    .replace(/\{challan_number\}/g, row['Challan Number'] || '')
    .replace(/\{violator_name\}/g, row['Violator Name'] || '');
}

function ts() {
  return new Date().toLocaleTimeString('en-IN', { hour12: false });
}

function addLog(msg, type = 'info') {
  state.logs.unshift({ id: Date.now() + Math.random(), time: ts(), msg, type });
  if (state.logs.length > 500) state.logs.length = 500;
  if (state.tab === 'logs') renderLogs();
  else updateLogBadge();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function stats() {
  const sent = Object.values(state.rowStatus).filter(s => s === 'sent').length;
  const failed = Object.values(state.rowStatus).filter(s => s === 'failed').length;
  const skipped = Object.values(state.rowStatus).filter(s => s === 'skipped').length;
  const done = sent + failed + skipped;
  return { total: state.rows.length, sent, failed, skipped, done };
}

// ─── PARSE FILE ──────────────────────────────────────────────────────────────
function parseExcelBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const wb = XLSX.read(bytes, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

function parseCSVBase64(base64) {
  const text = atob(base64);
  const wb = XLSX.read(text, { type: 'string' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

// ─── SEND LOGIC ──────────────────────────────────────────────────────────────
async function startSending() {
  if (!state.rows.length) return alert('Please load a file first.');
  if (!state.channels.whatsapp && !state.channels.sms) return alert('Select at least one channel.');

  state.sending = true;
  state.stopFlag = false;
  state.rowStatus = {};
  state.progress = 0;
  render();

  const total = state.rows.length;
  addLog(`🚀 Starting — ${total} records, channels: ${[state.channels.whatsapp && 'WhatsApp', state.channels.sms && 'SMS'].filter(Boolean).join(' + ')}`, 'info');

  for (let i = 0; i < total; i++) {
    if (state.stopFlag) {
      addLog(`⛔ Stopped at record ${i + 1}/${total}`, 'warn');
      break;
    }

    state.currentIdx = i;
    const row = state.rows[i];
    const contact = getContact(row);
    const vehicle = row['Vehicle Number'] || '?';
    const amount = row['Amount (Rs.)'] || '0';
    const message = applyTemplate(row);

    if (!contact || contact.length < 8) {
      state.rowStatus[i] = 'skipped';
      addLog(`[${i+1}/${total}] ⚠️ SKIP — ${vehicle} — No valid contact`, 'warn');
    } else {
      let success = false;

      if (state.channels.whatsapp && state.settings.autoOpen) {
        const res = await window.electronAPI.openWhatsApp({ phone: contact, message });
        if (res.success) {
          addLog(`[${i+1}/${total}] 💬 WhatsApp → +${state.settings.countryCode}${contact} | ${vehicle} | ₹${amount}`, 'success');
          success = true;
        } else {
          addLog(`[${i+1}/${total}] ❌ WhatsApp FAILED → ${contact} | ${res.error}`, 'error');
        }
      }

      if (state.channels.sms && state.settings.autoOpen) {
        const res = await window.electronAPI.openSMS({ phone: contact, message });
        if (res.success) {
          addLog(`[${i+1}/${total}] 📱 SMS → +${state.settings.countryCode}${contact} | ${vehicle}`, 'success');
          success = true;
        } else {
          addLog(`[${i+1}/${total}] ❌ SMS FAILED → ${contact} | ${res.error}`, 'error');
        }
      }

      state.rowStatus[i] = success ? 'sent' : 'failed';
    }

    state.progress = Math.round(((i + 1) / total) * 100);
    updateSendBar();
    updateTableRow(i);

    if (i < total - 1 && !state.stopFlag) {
      await sleep(state.settings.delay);
    }
  }

  state.sending = false;
  state.currentIdx = -1;
  const s = stats();
  addLog(`🏁 Done — ${s.sent} sent · ${s.failed} failed · ${s.skipped} skipped`, 'info');
  render();
}

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0f1117;
  --surface: #161b27;
  --card: #1e2435;
  --border: #2a3050;
  --accent: #4f8ef7;
  --accent2: #25d366;
  --text: #dde6f5;
  --muted: #5a6a8a;
  --success: #22c55e;
  --danger: #ef4444;
  --warn: #f59e0b;
  --sms: #4f8ef7;
  --wa: #25d366;
  --radius: 10px;
}

body { font-family: 'Segoe UI', 'Noto Sans Devanagari', sans-serif; background: var(--bg); color: var(--text); height: 100vh; overflow: hidden; }

/* scrollbar */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: var(--surface); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

/* layout */
#app { display: flex; flex-direction: column; height: 100vh; }
#topbar { display: flex; align-items: center; gap: 14px; padding: 10px 20px; background: var(--surface); border-bottom: 1px solid var(--border); flex-shrink: 0; -webkit-app-region: drag; }
#topbar button, #topbar input, #topbar select { -webkit-app-region: no-drag; }
.logo { font-size: 16px; font-weight: 700; color: var(--accent); letter-spacing: -0.3px; white-space: nowrap; }
.logo em { color: var(--text); font-style: normal; opacity: .55; }
.subtitle { font-size: 11px; color: var(--muted); margin-left: 4px; }
.tabs { display: flex; gap: 3px; background: var(--bg); padding: 3px; border-radius: 8px; margin-left: auto; }
.tab { padding: 6px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-weight: 600; font-family: inherit; transition: all .15s; position: relative; }
.tab.active { background: var(--accent); color: #fff; }
.tab:not(.active) { background: transparent; color: var(--muted); }
.tab:not(.active):hover { color: var(--text); background: var(--card); }
.log-badge { position: absolute; top: 2px; right: 4px; width: 7px; height: 7px; border-radius: 50%; background: var(--danger); display: none; }
.log-badge.show { display: block; }

/* panels */
#main { flex: 1; overflow: hidden; }
.panel { display: none; height: 100%; overflow-y: auto; padding: 18px 20px; flex-direction: column; gap: 14px; }
.panel.active { display: flex; }

/* cards */
.card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
.card-title { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); margin-bottom: 12px; }

/* stats grid */
.stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.stat-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; text-align: center; }
.stat-num { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; }
.stat-label { font-size: 10px; color: var(--muted); margin-top: 3px; text-transform: uppercase; letter-spacing: 1px; }

/* upload zone */
.upload-zone { border: 2px dashed var(--border); border-radius: var(--radius); padding: 32px 20px; text-align: center; cursor: pointer; transition: all .2s; }
.upload-zone:hover { border-color: var(--accent); background: rgba(79,142,247,.06); }
.upload-icon { font-size: 32px; margin-bottom: 8px; }
.upload-title { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
.upload-sub { font-size: 11px; color: var(--muted); }
.file-loaded { display: flex; align-items: center; gap: 10px; background: var(--surface); border-radius: 8px; padding: 10px 14px; }
.file-name { font-size: 13px; font-weight: 600; flex: 1; }
.file-meta { font-size: 11px; color: var(--muted); }

/* channels */
.channel-row { display: flex; gap: 10px; }
.ch-card { flex: 1; border: 2px solid var(--border); border-radius: var(--radius); padding: 14px; cursor: pointer; transition: all .18s; user-select: none; }
.ch-card:hover { border-color: var(--muted); }
.ch-card.active.wa { border-color: var(--wa); background: rgba(37,211,102,.07); }
.ch-card.active.sms { border-color: var(--sms); background: rgba(79,142,247,.07); }
.ch-icon { font-size: 20px; margin-bottom: 6px; }
.ch-name { font-weight: 700; font-size: 14px; }
.ch-desc { font-size: 11px; color: var(--muted); margin-top: 3px; }
.ch-check { float: right; width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 10px; transition: all .18s; }
.ch-card.active.wa .ch-check { background: var(--wa); border-color: var(--wa); color: #fff; }
.ch-card.active.sms .ch-check { background: var(--sms); border-color: var(--sms); color: #fff; }

/* preview */
.preview-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.preview-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 9px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.chip-blue { background: rgba(79,142,247,.15); color: var(--accent); }
.chip-green { background: rgba(34,197,94,.15); color: var(--success); }
.chip-yellow { background: rgba(245,158,11,.15); color: var(--warn); }
.preview-text { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-size: 12px; line-height: 1.8; white-space: pre-wrap; color: #93c5fd; max-height: 160px; overflow-y: auto; font-family: 'Consolas','Noto Sans Devanagari',monospace; }

/* send bar */
.send-section { display: flex; flex-direction: column; gap: 12px; }
.progress-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
.progress-label-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; }
.prog-bar { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
.prog-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--wa)); border-radius: 3px; transition: width .4s ease; }
.btn-row { display: flex; gap: 10px; align-items: center; }
.btn { display: inline-flex; align-items: center; gap: 7px; padding: 8px 18px; border-radius: 8px; border: none; cursor: pointer; font-size: 12px; font-weight: 700; font-family: inherit; transition: all .15s; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { filter: brightness(1.12); }
.btn-primary:disabled { opacity: .35; cursor: not-allowed; }
.btn-danger { background: var(--danger); color: #fff; }
.btn-danger:hover { filter: brightness(1.1); }
.btn-ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
.btn-ghost:hover { color: var(--text); border-color: var(--muted); }
.btn-sm { padding: 4px 10px; font-size: 11px; }

/* table */
.tbl-wrap { overflow: auto; border-radius: 8px; border: 1px solid var(--border); max-height: 360px; }
table { width: 100%; border-collapse: collapse; font-size: 11px; }
th { background: var(--surface); padding: 7px 10px; text-align: left; font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); white-space: nowrap; position: sticky; top: 0; border-bottom: 1px solid var(--border); }
td { padding: 7px 10px; border-bottom: 1px solid rgba(42,48,80,.5); white-space: nowrap; font-family: 'Consolas', monospace; }
tr:hover td { background: rgba(255,255,255,.025); cursor: pointer; }
tr.highlight td { background: rgba(79,142,247,.08) !important; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 5px; vertical-align: middle; }
.status-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; vertical-align: middle; }

/* settings */
.form-group { margin-bottom: 14px; }
label { font-size: 11px; font-weight: 600; color: var(--muted); display: block; margin-bottom: 5px; letter-spacing: .4px; }
.inp { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 7px; padding: 9px 12px; color: var(--text); font-size: 13px; font-family: inherit; outline: none; transition: border-color .15s; }
.inp:focus { border-color: var(--accent); }
textarea.inp { resize: vertical; min-height: 80px; font-family: 'Consolas','Noto Sans Devanagari',monospace; font-size: 12px; line-height: 1.7; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.var-hint { font-size: 10px; color: var(--muted); margin-top: 5px; }
.var-hint code { color: var(--accent); background: rgba(79,142,247,.1); padding: 1px 5px; border-radius: 3px; font-size: 10px; }

/* logs */
.log-filters { display: flex; gap: 6px; margin-bottom: 10px; align-items: center; }
.log-filter { padding: 3px 10px; border-radius: 20px; border: 1px solid var(--border); background: transparent; color: var(--muted); font-size: 11px; cursor: pointer; font-family: inherit; font-weight: 600; transition: all .15s; }
.log-filter.active { border-color: var(--accent); color: var(--accent); background: rgba(79,142,247,.1); }
.log-list { display: flex; flex-direction: column; max-height: 480px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; }
.log-entry { display: flex; gap: 10px; padding: 7px 12px; border-bottom: 1px solid rgba(42,48,80,.4); font-size: 11px; }
.log-time { color: var(--muted); flex-shrink: 0; font-family: 'Consolas', monospace; font-size: 10px; padding-top: 1px; }
.log-msg { flex: 1; line-height: 1.5; }
.log-msg.success { color: var(--success); }
.log-msg.error { color: var(--danger); }
.log-msg.warn { color: var(--warn); }
.log-msg.info { color: #93c5fd; }

/* misc */
.empty { text-align: center; padding: 40px; color: var(--muted); }
.empty-icon { font-size: 40px; margin-bottom: 10px; }
.badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
.badge-blue { background: rgba(79,142,247,.15); color: var(--accent); }
.badge-green { background: rgba(34,197,94,.15); color: var(--success); }
.switch-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(42,48,80,.4); }
.switch-label { font-size: 13px; font-weight: 600; }
.switch-desc { font-size: 11px; color: var(--muted); margin-top: 2px; }
.toggle { position: relative; width: 40px; height: 22px; flex-shrink: 0; }
.toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
.toggle-slider { position: absolute; inset: 0; background: var(--border); border-radius: 11px; cursor: pointer; transition: .25s; }
.toggle-slider::before { content: ''; position: absolute; width: 16px; height: 16px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: .25s; }
.toggle input:checked + .toggle-slider { background: var(--accent); }
.toggle input:checked + .toggle-slider::before { transform: translateX(18px); }
`;

// ─── RENDER ROOT ─────────────────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <style>${CSS}</style>
    <div id="topbar">
      <div class="logo">🚦 Challan<em>Sender</em></div>
      <div class="subtitle">UP Traffic Department · Bulk Messaging</div>
      <div class="tabs">
        <button class="tab ${state.tab==='send'?'active':''}" onclick="switchTab('send')">📤 Send</button>
        <button class="tab ${state.tab==='settings'?'active':''}" onclick="switchTab('settings')">⚙️ Settings</button>
        <button class="tab ${state.tab==='logs'?'active':''}" onclick="switchTab('logs')">
          📋 Logs <span id="logBadge" class="log-badge ${state.tab!=='logs'&&state.logs.length?'show':''}"></span>
        </button>
      </div>
    </div>
    <div id="main">
      ${renderSendPanel()}
      ${renderSettingsPanel()}
      ${renderLogsPanel()}
    </div>
  `;
  bindEvents();
}

// ─── SEND PANEL ──────────────────────────────────────────────────────────────
function renderSendPanel() {
  const s = stats();
  const hasRows = state.rows.length > 0;

  return `
  <div class="panel ${state.tab==='send'?'active':''}" id="panelSend">
    ${hasRows ? `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-num" style="color:var(--accent)">${s.total}</div><div class="stat-label">Total</div></div>
      <div class="stat-card"><div class="stat-num" style="color:var(--success)">${s.sent}</div><div class="stat-label">Sent</div></div>
      <div class="stat-card"><div class="stat-num" style="color:var(--danger)">${s.failed}</div><div class="stat-label">Failed</div></div>
      <div class="stat-card"><div class="stat-num" style="color:var(--warn)">${s.total - s.done}</div><div class="stat-label">Remaining</div></div>
    </div>` : ''}

    <!-- FILE UPLOAD -->
    <div class="card">
      <div class="card-title">📁 Data File</div>
      ${!hasRows ? `
        <div class="upload-zone" id="uploadZone" onclick="browseFile()">
          <div class="upload-icon">📊</div>
          <div class="upload-title">Click to browse or drag & drop your file</div>
          <div class="upload-sub">Supports .xlsx · .xlsm · .csv &nbsp;|&nbsp; Must have "Violator Contact" column</div>
        </div>
      ` : `
        <div class="file-loaded">
          <span style="font-size:24px">📋</span>
          <div style="flex:1">
            <div class="file-name">${state.fileName}</div>
            <div class="file-meta">${state.rows.length} records loaded · ${Object.keys(state.rowStatus).length} processed</div>
          </div>
          <span class="badge badge-green">✓ Ready</span>
          <button class="btn btn-ghost btn-sm" onclick="clearFile()">Change File</button>
        </div>
      `}
    </div>

    <!-- CHANNELS -->
    <div class="card">
      <div class="card-title">📡 Send Via (Select One or Both)</div>
      <div class="channel-row">
        <div class="ch-card wa ${state.channels.whatsapp?'active':''}" onclick="toggleChannel('whatsapp')">
          <div class="ch-check">${state.channels.whatsapp?'✓':''}</div>
          <div class="ch-icon">💬</div>
          <div class="ch-name" style="color:${state.channels.whatsapp?'var(--wa)':'var(--text)'}">WhatsApp</div>
          <div class="ch-desc">Opens WhatsApp with pre-filled message for each contact</div>
        </div>
        <div class="ch-card sms ${state.channels.sms?'active':''}" onclick="toggleChannel('sms')">
          <div class="ch-check">${state.channels.sms?'✓':''}</div>
          <div class="ch-icon">📱</div>
          <div class="ch-name" style="color:${state.channels.sms?'var(--sms)':'var(--text)'}">SMS / Mobile</div>
          <div class="ch-desc">Opens default SMS app with pre-filled message for each contact</div>
        </div>
      </div>
    </div>

    ${hasRows ? `
    <!-- PREVIEW -->
    <div class="card">
      <div class="preview-bar">
        <div class="card-title" style="margin:0">👁 Message Preview</div>
        <div style="display:flex;gap:6px;align-items:center">
          <span style="font-size:11px;color:var(--muted)">Record #${state.previewIdx+1} of ${state.rows.length}</span>
          <button class="btn btn-ghost btn-sm" onclick="prevPreview()">‹ Prev</button>
          <button class="btn btn-ghost btn-sm" onclick="nextPreview()">Next ›</button>
        </div>
      </div>
      ${renderPreviewChips()}
      <div class="preview-text">${escHtml(applyTemplate(state.rows[state.previewIdx]||{}))}</div>
    </div>

    <!-- SEND CONTROLS -->
    <div class="card send-section">
      <div class="card-title">🚀 Send Controls</div>
      <div class="progress-wrap">
        <div class="progress-label-row">
          <span style="color:var(--muted)">Progress</span>
          <span style="font-family:'Consolas',monospace;font-size:12px">${state.progress}% &nbsp;·&nbsp; ${stats().sent} sent &nbsp;·&nbsp; ${stats().failed} failed &nbsp;·&nbsp; ${stats().skipped} skipped</span>
        </div>
        <div class="prog-bar"><div id="progFill" class="prog-fill" style="width:${state.progress}%"></div></div>
      </div>
      <div class="btn-row">
        ${state.sending
          ? `<button class="btn btn-danger" onclick="stopSend()">⏹ Stop Sending</button>`
          : `<button class="btn btn-primary" onclick="startSend()" ${!hasRows?'disabled':''}>▶ Start Sending (${state.rows.length} records)</button>`
        }
        <button class="btn btn-ghost" onclick="resetStatus()">🔄 Reset Status</button>
        <span style="margin-left:auto;font-size:11px;color:var(--muted)">Delay: ${state.settings.delay}ms between messages</span>
      </div>
    </div>

    <!-- TABLE -->
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div class="card-title" style="margin:0">📋 All Records (${state.rows.length})</div>
        <span style="font-size:11px;color:var(--muted)">Click a row to preview its message</span>
      </div>
      <div class="tbl-wrap" id="tblWrap">
        <table id="dataTable">
          <thead>
            <tr>
              <th>#</th><th>Status</th><th>Vehicle No.</th>
              <th>Violator Name</th><th>Contact</th><th>Amount</th><th>RTO</th>
            </tr>
          </thead>
          <tbody id="tblBody">
            ${state.rows.slice(0,500).map((row,i) => renderTableRow(row,i)).join('')}
          </tbody>
        </table>
        ${state.rows.length>500?`<div style="padding:8px 12px;font-size:11px;color:var(--muted);text-align:center">Showing first 500 of ${state.rows.length} records</div>`:''}
      </div>
    </div>
    ` : ''}
  </div>`;
}

function renderTableRow(row, i) {
  const st = state.rowStatus[i] || 'pending';
  const color = st==='sent'?'var(--success)':st==='failed'?'var(--danger)':st==='skipped'?'var(--muted)':'var(--warn)';
  const hl = i === state.previewIdx ? 'highlight' : '';
  return `<tr class="${hl}" onclick="previewRow(${i})" id="tr-${i}">
    <td style="color:var(--muted)">${i+1}</td>
    <td><span class="status-dot" style="background:${color}"></span><span class="status-label" style="color:${color}">${st}</span></td>
    <td style="color:var(--accent)">${escHtml(row['Vehicle Number']||'')}</td>
    <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis">${escHtml(row['Violator Name']||'')}</td>
    <td>${getContact(row)||'<span style="color:var(--danger)">—</span>'}</td>
    <td style="color:var(--success)">₹${row['Amount (Rs.)']||0}</td>
    <td style="color:var(--muted);font-size:10px">${escHtml(row['RTO/Office']||'')}</td>
  </tr>`;
}

function renderPreviewChips() {
  const row = state.rows[state.previewIdx]||{};
  const contact = getContact(row);
  return `<div class="preview-chips">
    <span class="chip chip-blue">📞 ${contact||'No contact'}</span>
    <span class="chip chip-yellow">🚗 ${escHtml(row['Vehicle Number']||'N/A')}</span>
    <span class="chip chip-green">₹ ${row['Amount (Rs.)']||'0'}</span>
    <span class="chip chip-blue">${state.settings.lang==='hindi'?'हिंदी':'English'}</span>
  </div>`;
}

// ─── SETTINGS PANEL ──────────────────────────────────────────────────────────
function renderSettingsPanel() {
  const s = state.settings;
  return `
  <div class="panel ${state.tab==='settings'?'active':''}" id="panelSettings">
    <div class="card">
      <div class="card-title">🌐 General Settings</div>
      <div class="form-row">
        <div class="form-group">
          <label>Message Language</label>
          <select class="inp" id="setLang" onchange="setSetting('lang',this.value)">
            <option value="hindi" ${s.lang==='hindi'?'selected':''}>हिंदी (Hindi)</option>
            <option value="english" ${s.lang==='english'?'selected':''}>English</option>
          </select>
        </div>
        <div class="form-group">
          <label>Delay Between Messages (milliseconds)</label>
          <input class="inp" type="number" min="500" max="30000" value="${s.delay}" onchange="setSetting('delay',parseInt(this.value)||2000)" />
          <div class="var-hint">Recommended: 1500–3000ms to avoid being blocked</div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Country Code</label>
          <input class="inp" value="${s.countryCode}" maxlength="4" onchange="setSetting('countryCode',this.value)" />
          <div class="var-hint">India = 91 &nbsp;|&nbsp; Used when number has no country code</div>
        </div>
      </div>
      <div class="switch-row">
        <div>
          <div class="switch-label">Auto Open App</div>
          <div class="switch-desc">Automatically open WhatsApp / SMS app for each record</div>
        </div>
        <label class="toggle">
          <input type="checkbox" ${s.autoOpen?'checked':''} onchange="setSetting('autoOpen',this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📝 Hindi Message Template (हिंदी संदेश)</div>
      <div class="var-hint" style="margin-bottom:8px">
        Variables: <code>{amount}</code> <code>{vehicle_number}</code> <code>{challan_number}</code> <code>{violator_name}</code>
      </div>
      <textarea class="inp" rows="14" id="hindiTpl" onchange="setSetting('hindiTemplate',this.value)">${escHtml(s.hindiTemplate)}</textarea>
    </div>

    <div class="card">
      <div class="card-title">📝 English Message Template</div>
      <div class="var-hint" style="margin-bottom:8px">
        Variables: <code>{amount}</code> <code>{vehicle_number}</code> <code>{challan_number}</code> <code>{violator_name}</code>
      </div>
      <textarea class="inp" rows="10" id="englishTpl" onchange="setSetting('englishTemplate',this.value)">${escHtml(s.englishTemplate)}</textarea>
    </div>

    <div class="card">
      <div class="card-title">🔄 Actions</div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" onclick="saveSettingsToDisk()">💾 Save Settings</button>
        <button class="btn btn-ghost" onclick="resetTemplates()">↩ Reset Templates</button>
      </div>
    </div>
  </div>`;
}

// ─── LOGS PANEL ──────────────────────────────────────────────────────────────
function renderLogsPanel() {
  return `
  <div class="panel ${state.tab==='logs'?'active':''}" id="panelLogs">
    <div class="stat-grid">
      ${[
        {l:'Total',v:state.logs.length,c:'var(--accent)'},
        {l:'Success',v:state.logs.filter(x=>x.type==='success').length,c:'var(--success)'},
        {l:'Errors',v:state.logs.filter(x=>x.type==='error').length,c:'var(--danger)'},
        {l:'Warnings',v:state.logs.filter(x=>x.type==='warn').length,c:'var(--warn)'},
      ].map(s=>`<div class="stat-card"><div class="stat-num" style="color:${s.c};font-size:22px">${s.v}</div><div class="stat-label">${s.l}</div></div>`).join('')}
    </div>
    <div class="card" style="flex:1">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="card-title" style="margin:0">📋 Activity Log</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="exportLog()">⬇ Export .txt</button>
          <button class="btn btn-ghost btn-sm" onclick="clearLogs()">🗑 Clear</button>
        </div>
      </div>
      ${state.logs.length===0
        ? `<div class="empty"><div class="empty-icon">📭</div><div>No activity yet. Start sending messages to see logs here.</div></div>`
        : `<div class="log-list">${state.logs.map(l=>`
            <div class="log-entry">
              <span class="log-time">${l.time}</span>
              <span class="log-msg ${l.type}">${escHtml(l.msg)}</span>
            </div>`).join('')}
          </div>`
      }
    </div>
  </div>`;
}

// ─── PARTIAL UPDATES (avoid full re-render during send) ──────────────────────
function updateSendBar() {
  const fill = document.getElementById('progFill');
  if (fill) fill.style.width = state.progress + '%';
  const prow = document.querySelector('.progress-label-row span:last-child');
  if (prow) {
    const s = stats();
    prow.textContent = `${state.progress}% · ${s.sent} sent · ${s.failed} failed · ${s.skipped} skipped`;
  }
  // Update stat cards
  const nums = document.querySelectorAll('.stat-num');
  const s = stats();
  if (nums[0]) nums[0].textContent = s.total;
  if (nums[1]) nums[1].textContent = s.sent;
  if (nums[2]) nums[2].textContent = s.failed;
  if (nums[3]) nums[3].textContent = s.total - s.done;
}

function updateTableRow(i) {
  const tr = document.getElementById(`tr-${i}`);
  if (!tr) return;
  const st = state.rowStatus[i] || 'pending';
  const color = st==='sent'?'var(--success)':st==='failed'?'var(--danger)':st==='skipped'?'var(--muted)':'var(--warn)';
  const td = tr.querySelector('td:nth-child(2)');
  if (td) td.innerHTML = `<span class="status-dot" style="background:${color}"></span><span class="status-label" style="color:${color}">${st}</span>`;
}

function renderLogs() {
  const panel = document.getElementById('panelLogs');
  if (!panel) return;
  const list = panel.querySelector('.log-list');
  if (list) {
    list.innerHTML = state.logs.map(l=>`
      <div class="log-entry">
        <span class="log-time">${l.time}</span>
        <span class="log-msg ${l.type}">${escHtml(l.msg)}</span>
      </div>`).join('');
  } else {
    // First log — need to render the list
    const card = panel.querySelector('.card');
    if (card) {
      const empty = card.querySelector('.empty');
      if (empty) empty.outerHTML = `<div class="log-list">${state.logs.map(l=>`
        <div class="log-entry">
          <span class="log-time">${l.time}</span>
          <span class="log-msg ${l.type}">${escHtml(l.msg)}</span>
        </div>`).join('')}</div>`;
    }
  }
  // Update stat cards in logs panel
  const nums = document.querySelectorAll('#panelLogs .stat-num');
  if (nums[0]) nums[0].textContent = state.logs.length;
  if (nums[1]) nums[1].textContent = state.logs.filter(x=>x.type==='success').length;
  if (nums[2]) nums[2].textContent = state.logs.filter(x=>x.type==='error').length;
  if (nums[3]) nums[3].textContent = state.logs.filter(x=>x.type==='warn').length;
}

function updateLogBadge() {
  const b = document.getElementById('logBadge');
  if (b && state.tab !== 'logs') b.classList.add('show');
}

// ─── GLOBAL ACTIONS (called from HTML) ───────────────────────────────────────
window.switchTab = (tab) => {
  state.tab = tab;
  if (tab === 'logs') {
    const b = document.getElementById('logBadge');
    if (b) b.classList.remove('show');
  }
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const panel = document.getElementById('panel' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (panel) panel.classList.add('active');
  document.querySelectorAll('.tab').forEach(t => {
    if (t.textContent.toLowerCase().includes(tab.slice(0,3))) t.classList.add('active');
  });
};

window.browseFile = async () => {
  const result = await window.electronAPI.openFileDialog();
  if (!result) return;
  try {
    let rows;
    if (result.ext === '.csv') {
      rows = parseCSVBase64(result.data);
    } else {
      rows = parseExcelBase64(result.data);
    }
    const filtered = rows.filter(r => r['Violator Contact'] || r['Violator Owner Contact']);
    state.rows = filtered;
    state.fileName = result.name;
    state.rowStatus = {};
    state.progress = 0;
    state.previewIdx = 0;
    addLog(`✅ Loaded "${result.name}" — ${filtered.length} records with contact info (${rows.length - filtered.length} without contact skipped)`, 'success');
    render();
  } catch (err) {
    addLog(`❌ Failed to parse file: ${err.message}`, 'error');
  }
};

window.clearFile = () => {
  state.rows = [];
  state.fileName = '';
  state.rowStatus = {};
  state.progress = 0;
  render();
};

window.toggleChannel = (ch) => {
  state.channels[ch] = !state.channels[ch];
  document.querySelectorAll('.ch-card').forEach(el => {
    const isWa = el.classList.contains('wa');
    const active = isWa ? state.channels.whatsapp : state.channels.sms;
    el.classList.toggle('active', active);
    const check = el.querySelector('.ch-check');
    if (check) check.textContent = active ? '✓' : '';
    const name = el.querySelector('.ch-name');
    if (name) name.style.color = active ? (isWa ? 'var(--wa)' : 'var(--sms)') : 'var(--text)';
  });
};

window.previewRow = (i) => {
  const prev = document.getElementById(`tr-${state.previewIdx}`);
  if (prev) prev.classList.remove('highlight');
  state.previewIdx = i;
  const next = document.getElementById(`tr-${i}`);
  if (next) { next.classList.add('highlight'); next.scrollIntoView({ block: 'nearest' }); }
  const chips = document.querySelector('.preview-chips');
  if (chips) chips.outerHTML = renderPreviewChips();
  const txt = document.querySelector('.preview-text');
  if (txt) txt.textContent = applyTemplate(state.rows[i] || {});
  const bar = document.querySelector('.preview-bar span');
  if (bar) bar.textContent = `Record #${i+1} of ${state.rows.length}`;
};

window.prevPreview = () => { if (state.previewIdx > 0) window.previewRow(state.previewIdx - 1); };
window.nextPreview = () => { if (state.previewIdx < state.rows.length - 1) window.previewRow(state.previewIdx + 1); };

window.startSend = () => startSending();
window.stopSend = () => { state.stopFlag = true; addLog('⛔ Stop requested...', 'warn'); };
window.resetStatus = () => {
  state.rowStatus = {};
  state.progress = 0;
  render();
  addLog('🔄 Status reset.', 'info');
};

window.setSetting = (key, val) => {
  state.settings[key] = val;
  // Live update preview
  if (['lang','hindiTemplate','englishTemplate'].includes(key)) {
    const txt = document.querySelector('.preview-text');
    if (txt) txt.textContent = applyTemplate(state.rows[state.previewIdx] || {});
    const chips = document.querySelector('.preview-chips');
    if (chips) chips.outerHTML = renderPreviewChips();
  }
};

window.saveSettingsToDisk = async () => {
  await window.electronAPI.saveSettings(state.settings);
  addLog('💾 Settings saved to disk.', 'success');
  alert('Settings saved!');
};

window.resetTemplates = () => {
  state.settings.hindiTemplate = DEFAULT_HINDI;
  state.settings.englishTemplate = DEFAULT_ENGLISH;
  render();
  addLog('↩ Templates reset to defaults.', 'info');
};

window.exportLog = async () => {
  const content = state.logs.map(l => `[${l.time}] [${l.type.toUpperCase()}] ${l.msg}`).join('\n');
  await window.electronAPI.saveLog({ content });
  addLog('📄 Log exported.', 'success');
};

window.clearLogs = () => {
  state.logs = [];
  renderLogs();
};

// ─── DRAG & DROP on upload zone ──────────────────────────────────────────────
function bindEvents() {
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx','xlsm','csv'].includes(ext)) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const base64 = btoa(String.fromCharCode(...new Uint8Array(ev.target.result)));
        let rows = ext==='csv' ? parseCSVBase64(base64) : parseExcelBase64(base64);
        const filtered = rows.filter(r => r['Violator Contact'] || r['Violator Owner Contact']);
        state.rows = filtered;
        state.fileName = file.name;
        state.rowStatus = {};
        state.progress = 0;
        state.previewIdx = 0;
        addLog(`✅ Loaded "${file.name}" — ${filtered.length} records with contact info`, 'success');
        render();
      } catch (err) {
        addLog(`❌ Parse error: ${err.message}`, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ─── BOOT ────────────────────────────────────────────────────────────────────
async function boot() {
  // Load saved settings
  const saved = await window.electronAPI.loadSettings();
  if (saved) {
    state.settings = { ...state.settings, ...saved };
    addLog('⚙️ Settings loaded from disk.', 'info');
  }
  render();
}

boot();
