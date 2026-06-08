// ══════════════════════════════════════════════════════════════════════════════
//  Challan Sender v2 — renderer.js
//  Real Auto SMS (Fast2SMS) + Real Auto WhatsApp (AiSensy / Gupshup / Twilio)
// ══════════════════════════════════════════════════════════════════════════════

const DEFAULT_HINDI = `*वाहन चालान सूचना*

प्रिय उपयोगकर्ता,

न्यायालय मुख्य न्यायिक मजिस्ट्रेट परिवहन विभाग के वाहन पोर्टल पर आपके मोबाईल नम्बर पर पंजीकृत वाहन पर चालान जारी किया गया है जिसकी सूचना निम्नवत है :

🔸 *चालान राशि*: ₹{amount}
🔸 *वाहन संख्या*: {vehicle_number}
🔸 *चालान संख्या*: {challan_number}

कृपया निर्धारित राशि का शीघ्र भुगतान करें अन्यथा अतिरिक्त जुर्माना लग सकता है।

भुगतान के लिए: https://vcourts.gov.in

नोट:
1. चैटबॉट सिर्फ 8005441222 पर उपलब्ध है (Blue Tick Verified)।
2. E-Challan भुगतान केवल parivahan.gov.in पर करें।
3. विभाग QR Code या Account Number नही मांगता।

यदि आपने पहले ही भुगतान कर दिया है तो इस संदेश को नज़रअंदाज़ करें।`;

const DEFAULT_ENGLISH = `*Traffic Challan Notice*

Dear User,

A challan has been issued on your registered vehicle. Details:

🔸 *Amount*: Rs.{amount}
🔸 *Vehicle*: {vehicle_number}
🔸 *Challan No*: {challan_number}

Pay at: https://vcourts.gov.in

Note: If already paid, ignore this message.
— UP Traffic Department`;

// ── STATE ─────────────────────────────────────────────────────────────────────
let S = {
  tab: 'send',
  rows: [], fileName: '',
  channels: { sms: false, whatsapp: false },
  sending: false, stopFlag: false,
  progress: 0, rowStatus: {},
  logs: [], previewIdx: 0,
  settings: {
    lang: 'hindi',
    delay: 2000,
    hindiTemplate: DEFAULT_HINDI,
    englishTemplate: DEFAULT_ENGLISH,
    countryCode: '91',
    // SMS — Fast2SMS
    smsEnabled: false,
    smsApiKey: '',
    smsSenderId: 'UPTRFC',
    // WhatsApp provider
    waEnabled: false,
    waProvider: 'aisensy',   // aisensy | gupshup | twilio | manual
    // AiSensy
    aisensyApiKey: '',
    aisensyCampaign: 'challan_notice',
    aisensyUser: 'UP Traffic Dept',
    // Gupshup
    gupshupApiKey: '',
    gupshupSourcePhone: '',
    gupshupAppName: '',
    // Twilio
    twilioSid: '',
    twilioToken: '',
    twilioFrom: '',
  }
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const ts  = () => new Date().toLocaleTimeString('en-IN',{hour12:false});
const sleep = ms => new Promise(r=>setTimeout(r,ms));

function getContact(row) {
  return String(row['Violator Contact']||row['Violator Owner Contact']||'').replace(/\D/g,'');
}
function applyTpl(row) {
  return (S.settings.lang==='hindi' ? S.settings.hindiTemplate : S.settings.englishTemplate)
    .replace(/\{amount\}/g,        row['Amount (Rs.)']||row['Amount']||'')
    .replace(/\{vehicle_number\}/g, row['Vehicle Number']||'')
    .replace(/\{challan_number\}/g, row['Challan Number']||'')
    .replace(/\{violator_name\}/g,  row['Violator Name']||'');
}
function addLog(msg,type='info') {
  S.logs.unshift({id:Date.now()+Math.random(), time:ts(), msg, type});
  if (S.logs.length>500) S.logs.length=500;
  if (S.tab==='logs') refreshLogs();
  else { const b=document.getElementById('logDot'); if(b) b.style.display='block'; }
}
function st() {
  const sent    = Object.values(S.rowStatus).filter(x=>x==='sent').length;
  const failed  = Object.values(S.rowStatus).filter(x=>x==='failed').length;
  const skipped = Object.values(S.rowStatus).filter(x=>x==='skipped').length;
  return { total:S.rows.length, sent, failed, skipped, done: sent+failed+skipped };
}

// ── FILE PARSE ────────────────────────────────────────────────────────────────
function parseB64(base64, isCsv) {
  const bin = atob(base64);
  const buf = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) buf[i]=bin.charCodeAt(i);
  const wb = isCsv
    ? XLSX.read(atob(base64),{type:'string'})
    : XLSX.read(buf,{type:'array'});
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws,{defval:''});
}

// ══════════════════════════════════════════════════════════════════════════════
//  SEND ENGINE
// ══════════════════════════════════════════════════════════════════════════════
async function startSending() {
  if (!S.rows.length)                       return alert('Load a data file first.');
  if (!S.channels.sms && !S.channels.whatsapp) return alert('Enable at least one channel.');
  if (S.channels.sms && !S.settings.smsApiKey.trim())
    return alert('SMS is enabled but Fast2SMS API Key is missing.\nGo to Settings → SMS tab.');
  if (S.channels.whatsapp && S.settings.waProvider !== 'manual') {
    if (S.settings.waProvider==='aisensy' && !S.settings.aisensyApiKey.trim())
      return alert('WhatsApp (AiSensy) API Key missing.\nGo to Settings → WhatsApp tab.');
    if (S.settings.waProvider==='gupshup' && !S.settings.gupshupApiKey.trim())
      return alert('WhatsApp (Gupshup) API Key missing.\nGo to Settings → WhatsApp tab.');
    if (S.settings.waProvider==='twilio' && !S.settings.twilioSid.trim())
      return alert('WhatsApp (Twilio) credentials missing.\nGo to Settings → WhatsApp tab.');
  }

  S.sending=true; S.stopFlag=false; S.rowStatus={}; S.progress=0;
  const ch = [S.channels.sms&&'SMS', S.channels.whatsapp&&'WhatsApp'].filter(Boolean).join(' + ');
  addLog(`🚀 Starting — ${S.rows.length} records via ${ch}`,'info');
  render();

  for (let i=0; i<S.rows.length; i++) {
    if (S.stopFlag) { addLog(`⛔ Stopped at ${i+1}/${S.rows.length}`,'warn'); break; }

    const row     = S.rows[i];
    const contact = getContact(row);
    const vehicle = row['Vehicle Number']||'?';
    const amount  = row['Amount (Rs.)']||'0';
    const message = applyTpl(row);
    const n       = i+1, total=S.rows.length;

    if (!contact || contact.length < 8) {
      S.rowStatus[i]='skipped';
      addLog(`[${n}/${total}] ⚠️  SKIP — ${vehicle} — no valid contact`,'warn');
    } else {
      let anySuccess = false;

      // ── SMS via Fast2SMS ──────────────────────────────────────────────────
      if (S.channels.sms) {
        const res = await window.electronAPI.sendSMS({
          apiKey:   S.settings.smsApiKey,
          phone:    contact,
          message:  message,
          senderId: S.settings.smsSenderId
        });
        if (res.success) {
          addLog(`[${n}/${total}] 📱 SMS SENT → +91${contact} | ${vehicle} | ₹${amount}`,'success');
          anySuccess=true;
        } else {
          addLog(`[${n}/${total}] ❌ SMS FAIL → ${contact} | ${res.error}`,'error');
        }
      }

      // ── WhatsApp ──────────────────────────────────────────────────────────
      if (S.channels.whatsapp) {
        const waConfig = S.settings.waProvider==='aisensy'
          ? { apiKey: S.settings.aisensyApiKey, campaignName: S.settings.aisensyCampaign, userName: S.settings.aisensyUser }
          : S.settings.waProvider==='gupshup'
          ? { apiKey: S.settings.gupshupApiKey, sourcePhone: S.settings.gupshupSourcePhone, appName: S.settings.gupshupAppName }
          : S.settings.waProvider==='twilio'
          ? { accountSid: S.settings.twilioSid, authToken: S.settings.twilioToken, fromNumber: S.settings.twilioFrom }
          : {};

        const res = await window.electronAPI.sendWhatsApp({
          provider: S.settings.waProvider,
          config:   waConfig,
          phone:    contact,
          message:  message
        });
        if (res.success) {
          const tag = res.manual ? '💬 WA (manual)' : '💬 WA SENT';
          addLog(`[${n}/${total}] ${tag} → +91${contact} | ${vehicle} | ₹${amount}`,'success');
          anySuccess=true;
        } else {
          addLog(`[${n}/${total}] ❌ WA FAIL → ${contact} | ${res.error}`,'error');
        }
      }

      S.rowStatus[i] = anySuccess ? 'sent' : 'failed';
    }

    S.progress = Math.round(((i+1)/S.rows.length)*100);
    patchProgress();
    patchRow(i);
    if (i < S.rows.length-1 && !S.stopFlag) await sleep(S.settings.delay);
  }

  S.sending=false;
  const s=st();
  addLog(`🏁 Batch done — ✅ ${s.sent} sent · ❌ ${s.failed} failed · ⚠️  ${s.skipped} skipped`,'info');
  render();
}

// ── PARTIAL DOM PATCHES (fast, no full re-render) ─────────────────────────────
function patchProgress() {
  const fill = document.getElementById('progFill');
  if (fill) fill.style.width = S.progress+'%';
  const lbl = document.getElementById('progLbl');
  const s=st();
  if (lbl) lbl.textContent = `${S.progress}%  ·  ✅ ${s.sent}  ❌ ${s.failed}  ⚠ ${s.skipped}`;
  ['stTotal','stSent','stFail','stRem'].forEach((id,idx)=>{
    const el=document.getElementById(id);
    if(el) el.textContent=[s.total,s.sent,s.failed,s.total-s.done][idx];
  });
}
function patchRow(i) {
  const tr=document.getElementById(`tr${i}`); if(!tr) return;
  const st2=S.rowStatus[i]||'pending';
  const col=st2==='sent'?'#22c55e':st2==='failed'?'#ef4444':st2==='skipped'?'#64748b':'#f59e0b';
  const td=tr.querySelector('.stCell');
  if(td) td.innerHTML=`<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${col};margin-right:5px;vertical-align:middle"></span><span style="color:${col};font-size:9px;text-transform:uppercase;letter-spacing:.8px;vertical-align:middle">${st2}</span>`;
}
function refreshLogs() {
  const el=document.getElementById('logList'); if(!el) return;
  el.innerHTML = S.logs.length===0
    ? `<div style="text-align:center;padding:40px;color:#5a6a8a"><div style="font-size:36px;margin-bottom:10px">📭</div>No activity yet.</div>`
    : S.logs.map(l=>`<div style="display:flex;gap:10px;padding:7px 12px;border-bottom:1px solid rgba(42,48,80,.4);font-size:11px">
        <span style="color:#5a6a8a;flex-shrink:0;font-family:monospace;padding-top:1px;font-size:10px">${l.time}</span>
        <span style="flex:1;line-height:1.5;color:${l.type==='success'?'#22c55e':l.type==='error'?'#ef4444':l.type==='warn'?'#f59e0b':'#93c5fd'}">${esc(l.msg)}</span>
      </div>`).join('');
  ['lsTotal','lsSent','lsErr','lsWarn'].forEach((id,idx)=>{
    const el2=document.getElementById(id); if(!el2) return;
    el2.textContent=[S.logs.length,S.logs.filter(x=>x.type==='success').length,S.logs.filter(x=>x.type==='error').length,S.logs.filter(x=>x.type==='warn').length][idx];
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  CSS
// ══════════════════════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0f1117;--sur:#161b27;--card:#1c2235;--bor:#252d42;--acc:#4f8ef7;--wa:#25d366;--sms:#a78bfa;--ok:#22c55e;--err:#ef4444;--warn:#f59e0b;--txt:#dde6f5;--mut:#5a6a8a;--r:10px}
body{font-family:'Segoe UI','Noto Sans Devanagari',sans-serif;background:var(--bg);color:var(--txt);height:100vh;overflow:hidden;font-size:13px}
::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:var(--sur)}::-webkit-scrollbar-thumb{background:var(--bor);border-radius:3px}
#app{display:flex;flex-direction:column;height:100vh}
/* topbar */
#tb{display:flex;align-items:center;gap:12px;padding:9px 18px;background:var(--sur);border-bottom:1px solid var(--bor);flex-shrink:0}
.logo{font-size:15px;font-weight:700;color:var(--acc);white-space:nowrap}.logo em{color:var(--txt);font-style:normal;opacity:.5}
.sub{font-size:10px;color:var(--mut)}
.tabs{display:flex;gap:3px;background:var(--bg);padding:3px;border-radius:8px;margin-left:auto}
.tab{padding:6px 15px;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;transition:all .15s;position:relative}
.tab.on{background:var(--acc);color:#fff}.tab:not(.on){background:transparent;color:var(--mut)}.tab:not(.on):hover{color:var(--txt);background:var(--card)}
#logDot{position:absolute;top:3px;right:5px;width:7px;height:7px;border-radius:50%;background:var(--err);display:none}
/* layout */
#main{flex:1;overflow:hidden}
.pan{display:none;height:100%;overflow-y:auto;padding:16px 20px;flex-direction:column;gap:14px}.pan.on{display:flex}
/* card */
.card{background:var(--card);border:1px solid var(--bor);border-radius:var(--r);padding:15px}
.ctitle{font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:var(--mut);margin-bottom:11px}
/* stat grid */
.sg{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.sc{background:var(--card);border:1px solid var(--bor);border-radius:var(--r);padding:11px;text-align:center}
.sn{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}.sl{font-size:10px;color:var(--mut);margin-top:3px;text-transform:uppercase;letter-spacing:.8px}
/* upload */
.uz{border:2px dashed var(--bor);border-radius:var(--r);padding:28px;text-align:center;cursor:pointer;transition:all .2s}
.uz:hover{border-color:var(--acc);background:rgba(79,142,247,.05)}
.uz .ui{font-size:30px;margin-bottom:7px}.uz .ut{font-weight:600;font-size:14px;margin-bottom:4px}.uz .us{font-size:11px;color:var(--mut)}
.fl{display:flex;align-items:center;gap:10px;background:var(--sur);border-radius:8px;padding:9px 13px}
/* channels */
.chr{display:flex;gap:10px}
.chc{flex:1;border:2px solid var(--bor);border-radius:var(--r);padding:13px;cursor:pointer;transition:all .18s;user-select:none;position:relative}
.chc:hover{border-color:var(--mut)}
.chc.on-wa{border-color:var(--wa);background:rgba(37,211,102,.06)}
.chc.on-sms{border-color:var(--sms);background:rgba(167,139,250,.06)}
.chk{position:absolute;top:11px;right:11px;width:18px;height:18px;border-radius:50%;border:2px solid var(--bor);display:flex;align-items:center;justify-content:center;font-size:10px;transition:all .18s}
.chc.on-wa .chk{background:var(--wa);border-color:var(--wa);color:#fff}
.chc.on-sms .chk{background:var(--sms);border-color:var(--sms);color:#fff}
.chi{font-size:20px;margin-bottom:5px}.chn{font-weight:700;font-size:14px}.chd{font-size:11px;color:var(--mut);margin-top:3px}
/* preview */
.pvt{background:var(--sur);border:1px solid var(--bor);border-radius:8px;padding:11px;font-size:12px;line-height:1.8;white-space:pre-wrap;color:#93c5fd;max-height:155px;overflow-y:auto;font-family:'Consolas','Noto Sans Devanagari',monospace}
.chip{display:inline-flex;align-items:center;gap:3px;padding:2px 9px;border-radius:4px;font-size:11px;font-weight:600}
/* progress */
.pb{height:6px;background:var(--bor);border-radius:3px;overflow:hidden;margin-top:7px}
.pf{height:100%;background:linear-gradient(90deg,var(--acc),var(--wa));border-radius:3px;transition:width .4s}
/* buttons */
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 17px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit;transition:all .15s}
.bp{background:var(--acc);color:#fff}.bp:hover{filter:brightness(1.1)}.bp:disabled{opacity:.35;cursor:not-allowed}
.bd{background:var(--err);color:#fff}.bd:hover{filter:brightness(1.1)}
.bg{background:transparent;color:var(--mut);border:1px solid var(--bor)}.bg:hover{color:var(--txt);border-color:var(--mut)}
.bsm{padding:4px 10px;font-size:11px}
.brow{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
/* table */
.tw{overflow:auto;border-radius:8px;border:1px solid var(--bor);max-height:320px}
table{width:100%;border-collapse:collapse;font-size:11px}
th{background:var(--sur);padding:6px 10px;text-align:left;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mut);white-space:nowrap;position:sticky;top:0;border-bottom:1px solid var(--bor)}
td{padding:6px 10px;border-bottom:1px solid rgba(37,45,66,.5);white-space:nowrap;font-family:'Consolas',monospace}
tr:hover td{background:rgba(255,255,255,.02);cursor:pointer}
tr.hl td{background:rgba(79,142,247,.07)!important}
/* settings */
.fg{margin-bottom:13px}
label{font-size:11px;font-weight:600;color:var(--mut);display:block;margin-bottom:5px;letter-spacing:.4px}
.inp{width:100%;background:var(--sur);border:1px solid var(--bor);border-radius:7px;padding:8px 12px;color:var(--txt);font-size:12px;font-family:inherit;outline:none;transition:border-color .15s}
.inp:focus{border-color:var(--acc)}
textarea.inp{resize:vertical;min-height:75px;font-family:'Consolas','Noto Sans Devanagari',monospace;font-size:11px;line-height:1.7}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.hint{font-size:10px;color:var(--mut);margin-top:4px}
.hint code{color:var(--acc);background:rgba(79,142,247,.1);padding:1px 5px;border-radius:3px}
/* tabs inside settings */
.stabs{display:flex;gap:2px;margin-bottom:14px;border-bottom:1px solid var(--bor);padding-bottom:0}
.stab{padding:7px 16px;border:none;background:transparent;color:var(--mut);cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .15s}
.stab.on{color:var(--acc);border-bottom-color:var(--acc)}
.stab:hover:not(.on){color:var(--txt)}
/* alert box */
.abox{display:flex;gap:10px;padding:12px 14px;border-radius:8px;font-size:12px;margin-bottom:12px;align-items:flex-start}
.abox-blue{background:rgba(79,142,247,.1);border:1px solid rgba(79,142,247,.25);color:#93c5fd}
.abox-green{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);color:#86efac}
.abox-yellow{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25);color:#fcd34d}
/* badge */
.badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700}
`;

// ══════════════════════════════════════════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════════════════════════════════════════
function render() {
  document.getElementById('app').innerHTML = `
    <style>${CSS}</style>
    <div id="tb">
      <div class="logo">🚦 Challan<em>Sender</em> <span style="font-size:10px;color:var(--mut);font-weight:400">v2</span></div>
      <div class="sub">UP Traffic Department · Auto SMS + WhatsApp</div>
      <div class="tabs">
        <button class="tab ${S.tab==='send'?'on':''}"     onclick="goTab('send')">📤 Send</button>
        <button class="tab ${S.tab==='settings'?'on':''}" onclick="goTab('settings')">⚙️ Settings</button>
        <button class="tab ${S.tab==='logs'?'on':''}"     onclick="goTab('logs')">
          📋 Logs <span id="logDot" style="${S.tab!=='logs'&&S.logs.length?'display:block':'display:none'}"></span>
        </button>
      </div>
    </div>
    <div id="main">
      ${panSend()}
      ${panSettings()}
      ${panLogs()}
    </div>`;
  bindDrag();
}

// ── SEND PANEL ────────────────────────────────────────────────────────────────
function panSend() {
  const s=st(), has=S.rows.length>0;
  const prow = S.rows[S.previewIdx]||{};
  return `<div class="pan ${S.tab==='send'?'on':''}" id="panSend">
    ${has?`<div class="sg">
      <div class="sc"><div class="sn" id="stTotal" style="color:var(--acc)">${s.total}</div><div class="sl">Total</div></div>
      <div class="sc"><div class="sn" id="stSent"  style="color:var(--ok)">${s.sent}</div><div class="sl">Sent</div></div>
      <div class="sc"><div class="sn" id="stFail"  style="color:var(--err)">${s.failed}</div><div class="sl">Failed</div></div>
      <div class="sc"><div class="sn" id="stRem"   style="color:var(--warn)">${s.total-s.done}</div><div class="sl">Remaining</div></div>
    </div>`:''}

    <div class="card">
      <div class="ctitle">📁 Data File</div>
      ${!has
        ? `<div class="uz" onclick="loadFile()">
             <div class="ui">📊</div>
             <div class="ut">Click to browse or drag & drop your Excel / CSV file</div>
             <div class="us">Supports .xlsx · .xlsm · .csv &nbsp;|&nbsp; Needs "Violator Contact" column</div>
           </div>`
        : `<div class="fl">
             <span style="font-size:22px">📋</span>
             <div style="flex:1">
               <div style="font-weight:600">${esc(S.fileName)}</div>
               <div style="font-size:11px;color:var(--mut)">${S.rows.length} records · ${Object.keys(S.rowStatus).length} processed</div>
             </div>
             <span class="badge" style="background:rgba(34,197,94,.15);color:var(--ok)">✓ Ready</span>
             <button class="btn bg bsm" onclick="clearFile()">Change File</button>
           </div>`
      }
    </div>

    <div class="card">
      <div class="ctitle">📡 Send Channel — Select One or Both</div>
      <div class="chr">
        <div class="chc ${S.channels.whatsapp?'on-wa':''}" onclick="togCh('whatsapp')">
          <div class="chk">${S.channels.whatsapp?'✓':''}</div>
          <div class="chi">💬</div>
          <div class="chn" style="color:${S.channels.whatsapp?'var(--wa)':'var(--txt)'}">WhatsApp</div>
          <div class="chd">Auto-send via AiSensy / Gupshup / Twilio API</div>
          ${!S.settings.waEnabled?`<div style="margin-top:6px;font-size:10px;color:var(--warn)">⚠ Configure API in Settings first</div>`:''}
        </div>
        <div class="chc ${S.channels.sms?'on-sms':''}" onclick="togCh('sms')">
          <div class="chk">${S.channels.sms?'✓':''}</div>
          <div class="chi">📱</div>
          <div class="chn" style="color:${S.channels.sms?'var(--sms)':'var(--txt)'}">SMS (Fast2SMS)</div>
          <div class="chd">Auto-send via Fast2SMS bulk API — supports Hindi</div>
          ${!S.settings.smsEnabled?`<div style="margin-top:6px;font-size:10px;color:var(--warn)">⚠ Configure API Key in Settings first</div>`:''}
        </div>
      </div>
    </div>

    ${has?`
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div class="ctitle" style="margin:0">👁 Message Preview — Record #${S.previewIdx+1} of ${S.rows.length}</div>
        <div style="display:flex;gap:6px">
          <button class="btn bg bsm" onclick="movePrev()">‹</button>
          <button class="btn bg bsm" onclick="moveNext()">›</button>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        <span class="chip" style="background:rgba(79,142,247,.15);color:var(--acc)">📞 ${getContact(prow)||'No contact'}</span>
        <span class="chip" style="background:rgba(245,158,11,.15);color:var(--warn)">🚗 ${esc(prow['Vehicle Number']||'N/A')}</span>
        <span class="chip" style="background:rgba(34,197,94,.15);color:var(--ok)">₹ ${prow['Amount (Rs.)']||'0'}</span>
        <span class="chip" style="background:rgba(79,142,247,.12);color:var(--acc)">${S.settings.lang==='hindi'?'हिंदी':'English'}</span>
      </div>
      <div class="pvt" id="pvtBox">${esc(applyTpl(prow))}</div>
    </div>

    <div class="card">
      <div class="ctitle">🚀 Send Controls</div>
      <div style="background:var(--sur);border:1px solid var(--bor);border-radius:8px;padding:12px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:11px">
          <span style="color:var(--mut)">Progress</span>
          <span id="progLbl" style="font-family:monospace">${S.progress}%  ·  ✅ ${s.sent}  ❌ ${s.failed}  ⚠ ${s.skipped}</span>
        </div>
        <div class="pb"><div id="progFill" class="pf" style="width:${S.progress}%"></div></div>
      </div>
      <div class="brow">
        ${S.sending
          ? `<button class="btn bd" onclick="doStop()">⏹ Stop</button>`
          : `<button class="btn bp" onclick="doStart()" ${!has?'disabled':''}>▶ Start Sending (${S.rows.length} records)</button>`
        }
        <button class="btn bg" onclick="doReset()">🔄 Reset</button>
        <span style="margin-left:auto;font-size:11px;color:var(--mut)">Delay: ${S.settings.delay}ms</span>
      </div>
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div class="ctitle" style="margin:0">📋 Records (${S.rows.length})</div>
        <span style="font-size:11px;color:var(--mut)">Click row to preview</span>
      </div>
      <div class="tw">
        <table><thead><tr>
          <th>#</th><th>Status</th><th>Vehicle</th><th>Name</th><th>Contact</th><th>Amount</th><th>RTO</th>
        </tr></thead>
        <tbody>${S.rows.slice(0,500).map((r,i)=>{
          const st2=S.rowStatus[i]||'pending';
          const col=st2==='sent'?'#22c55e':st2==='failed'?'#ef4444':st2==='skipped'?'#64748b':'#f59e0b';
          return `<tr id="tr${i}" class="${i===S.previewIdx?'hl':''}" onclick="pickRow(${i})">
            <td style="color:var(--mut)">${i+1}</td>
            <td class="stCell"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${col};margin-right:5px;vertical-align:middle"></span><span style="color:${col};font-size:9px;text-transform:uppercase;letter-spacing:.8px;vertical-align:middle">${st2}</span></td>
            <td style="color:var(--acc)">${esc(r['Vehicle Number']||'')}</td>
            <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis">${esc(r['Violator Name']||'')}</td>
            <td>${getContact(r)||'<span style="color:var(--err)">—</span>'}</td>
            <td style="color:var(--ok)">₹${r['Amount (Rs.)']||0}</td>
            <td style="color:var(--mut);font-size:10px">${esc(r['RTO/Office']||'')}</td>
          </tr>`;}).join('')}
        </tbody></table>
        ${S.rows.length>500?`<div style="padding:8px;text-align:center;font-size:11px;color:var(--mut)">Showing first 500 of ${S.rows.length}</div>`:''}
      </div>
    </div>`:''}
  </div>`;
}

// ── SETTINGS PANEL ────────────────────────────────────────────────────────────
let settingsTab = 'sms';
function panSettings() {
  const s=S.settings;
  return `<div class="pan ${S.tab==='settings'?'on':''}" id="panSettings">
    <div class="card">
      <div class="stabs">
        <button class="stab ${settingsTab==='sms'?'on':''}"       onclick="setStab('sms')">📱 SMS (Fast2SMS)</button>
        <button class="stab ${settingsTab==='whatsapp'?'on':''}"   onclick="setStab('whatsapp')">💬 WhatsApp</button>
        <button class="stab ${settingsTab==='templates'?'on':''}"  onclick="setStab('templates')">📝 Templates</button>
        <button class="stab ${settingsTab==='general'?'on':''}"    onclick="setStab('general')">⚙️ General</button>
      </div>

      ${settingsTab==='sms'?`
        <div class="abox abox-blue">
          <span>ℹ️</span>
          <div><b>Fast2SMS</b> — Best SMS service for India. Supports Hindi (Unicode). Cost: ₹0.15–0.25 per SMS.<br>
          Register at <b>fast2sms.com</b> → Dashboard → Dev API → copy your API Key below.</div>
        </div>
        <div class="fr">
          <div class="fg">
            <label>Fast2SMS API Key *</label>
            <input class="inp" type="password" placeholder="Your Fast2SMS API key" value="${esc(s.smsApiKey)}" oninput="setSt('smsApiKey',this.value)" />
            <div class="hint">Get from: fast2sms.com → Dashboard → Dev API</div>
          </div>
          <div class="fg">
            <label>Sender ID</label>
            <input class="inp" placeholder="UPTRFC" maxlength="6" value="${esc(s.smsSenderId)}" oninput="setSt('smsSenderId',this.value)" />
            <div class="hint">6-char sender name shown on receiver's phone</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0">
          <label style="margin:0;font-size:13px;font-weight:600;color:var(--txt)">Enable SMS Channel</label>
          <label class="toggle" style="position:relative;width:40px;height:22px;flex-shrink:0">
            <input type="checkbox" ${s.smsEnabled?'checked':''} onchange="setSt('smsEnabled',this.checked)" style="opacity:0;width:0;height:0;position:absolute">
            <span style="position:absolute;inset:0;background:${s.smsEnabled?'var(--acc)':'var(--bor)'};border-radius:11px;cursor:pointer;transition:.25s">
              <span style="position:absolute;width:16px;height:16px;left:${s.smsEnabled?'21px':'3px'};bottom:3px;background:#fff;border-radius:50%;transition:.25s"></span>
            </span>
          </label>
        </div>
        <div class="abox abox-green" style="margin-top:4px">
          <span>✅</span>
          <div>Once you enter the API key and enable SMS, the app will call Fast2SMS automatically for every record. No clicking needed.</div>
        </div>
      `:''}

      ${settingsTab==='whatsapp'?`
        <div class="abox abox-blue">
          <span>ℹ️</span>
          <div>Choose your WhatsApp provider. All three support India. <b>AiSensy</b> is easiest for beginners — sign up at <b>aisensy.com</b>.</div>
        </div>
        <div class="fg">
          <label>WhatsApp Provider</label>
          <select class="inp" onchange="setSt('waProvider',this.value)">
            <option value="aisensy" ${s.waProvider==='aisensy'?'selected':''}>AiSensy (Recommended for India)</option>
            <option value="gupshup" ${s.waProvider==='gupshup'?'selected':''}>Gupshup</option>
            <option value="twilio"  ${s.waProvider==='twilio'?'selected':''}>Twilio</option>
            <option value="manual"  ${s.waProvider==='manual'?'selected':''}>Manual (Open WhatsApp Web — no auto send)</option>
          </select>
        </div>

        ${s.waProvider==='aisensy'?`
          <div class="abox abox-yellow"><span>📋</span><div>Register at <b>aisensy.com</b> → Go to API section → copy API Key. Also create a Campaign with your message template.</div></div>
          <div class="fr">
            <div class="fg"><label>AiSensy API Key *</label><input class="inp" type="password" placeholder="Your AiSensy API Key" value="${esc(s.aisensyApiKey)}" oninput="setSt('aisensyApiKey',this.value)"/></div>
            <div class="fg"><label>Campaign Name *</label><input class="inp" placeholder="challan_notice" value="${esc(s.aisensyCampaign)}" oninput="setSt('aisensyCampaign',this.value)"/><div class="hint">Must match the campaign you created in AiSensy</div></div>
          </div>
          <div class="fg"><label>Sender Name (shown in WA)</label><input class="inp" placeholder="UP Traffic Dept" value="${esc(s.aisensyUser)}" oninput="setSt('aisensyUser',this.value)"/></div>
        `:''}
        ${s.waProvider==='gupshup'?`
          <div class="abox abox-yellow"><span>📋</span><div>Register at <b>gupshup.io</b> → Create a WhatsApp app → Get API Key and source phone number.</div></div>
          <div class="fr">
            <div class="fg"><label>Gupshup API Key *</label><input class="inp" type="password" value="${esc(s.gupshupApiKey)}" oninput="setSt('gupshupApiKey',this.value)"/></div>
            <div class="fg"><label>Source Phone (your WA number)</label><input class="inp" placeholder="919876543210" value="${esc(s.gupshupSourcePhone)}" oninput="setSt('gupshupSourcePhone',this.value)"/></div>
          </div>
          <div class="fg"><label>App Name</label><input class="inp" placeholder="Your Gupshup app name" value="${esc(s.gupshupAppName)}" oninput="setSt('gupshupAppName',this.value)"/></div>
        `:''}
        ${s.waProvider==='twilio'?`
          <div class="abox abox-yellow"><span>📋</span><div>Register at <b>twilio.com</b> → Get Account SID + Auth Token → Enable WhatsApp Sandbox or a paid number.</div></div>
          <div class="fr">
            <div class="fg"><label>Account SID *</label><input class="inp" type="password" value="${esc(s.twilioSid)}" oninput="setSt('twilioSid',this.value)"/></div>
            <div class="fg"><label>Auth Token *</label><input class="inp" type="password" value="${esc(s.twilioToken)}" oninput="setSt('twilioToken',this.value)"/></div>
          </div>
          <div class="fg"><label>From Number (Twilio WA number)</label><input class="inp" placeholder="14155238886" value="${esc(s.twilioFrom)}" oninput="setSt('twilioFrom',this.value)"/><div class="hint">Without + sign. E.g. 14155238886</div></div>
        `:''}
        ${s.waProvider==='manual'?`
          <div class="abox abox-yellow"><span>⚠️</span><div>Manual mode: app opens WhatsApp Web in browser for each contact. You must click Send manually. Good for testing.</div></div>
        `:''}

        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;margin-top:4px">
          <label style="margin:0;font-size:13px;font-weight:600;color:var(--txt)">Enable WhatsApp Channel</label>
          <label style="position:relative;width:40px;height:22px;flex-shrink:0">
            <input type="checkbox" ${s.waEnabled?'checked':''} onchange="setSt('waEnabled',this.checked)" style="opacity:0;width:0;height:0;position:absolute">
            <span style="position:absolute;inset:0;background:${s.waEnabled?'var(--wa)':'var(--bor)'};border-radius:11px;cursor:pointer;transition:.25s">
              <span style="position:absolute;width:16px;height:16px;left:${s.waEnabled?'21px':'3px'};bottom:3px;background:#fff;border-radius:50%;transition:.25s"></span>
            </span>
          </label>
        </div>
      `:''}

      ${settingsTab==='templates'?`
        <div class="fr" style="margin-bottom:12px">
          <div class="fg" style="margin:0">
            <label>Message Language</label>
            <select class="inp" onchange="setSt('lang',this.value)">
              <option value="hindi"   ${s.lang==='hindi'?'selected':''}>हिंदी (Hindi)</option>
              <option value="english" ${s.lang==='english'?'selected':''}>English</option>
            </select>
          </div>
        </div>
        <div class="hint" style="margin-bottom:10px">
          Variables: <code>{amount}</code> <code>{vehicle_number}</code> <code>{challan_number}</code> <code>{violator_name}</code>
        </div>
        <div class="fg">
          <label>Hindi Template (हिंदी)</label>
          <textarea class="inp" rows="12" oninput="setSt('hindiTemplate',this.value)">${esc(s.hindiTemplate)}</textarea>
        </div>
        <div class="fg">
          <label>English Template</label>
          <textarea class="inp" rows="8" oninput="setSt('englishTemplate',this.value)">${esc(s.englishTemplate)}</textarea>
        </div>
        <button class="btn bg" onclick="resetTpls()">↩ Reset to Defaults</button>
      `:''}

      ${settingsTab==='general'?`
        <div class="fr">
          <div class="fg"><label>Country Code</label><input class="inp" value="${esc(s.countryCode)}" maxlength="4" oninput="setSt('countryCode',this.value)"/><div class="hint">India = 91. Added to 10-digit numbers.</div></div>
          <div class="fg"><label>Delay Between Messages (ms)</label><input class="inp" type="number" min="500" max="30000" value="${s.delay}" oninput="setSt('delay',parseInt(this.value)||2000)"/><div class="hint">Recommended: 2000–5000ms</div></div>
        </div>
      `:''}

      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--bor);display:flex;gap:10px">
        <button class="btn bp" onclick="doSaveSettings()">💾 Save Settings</button>
      </div>
    </div>
  </div>`;
}

// ── LOGS PANEL ────────────────────────────────────────────────────────────────
function panLogs() {
  const s={
    total:S.logs.length,
    ok:S.logs.filter(x=>x.type==='success').length,
    err:S.logs.filter(x=>x.type==='error').length,
    warn:S.logs.filter(x=>x.type==='warn').length
  };
  return `<div class="pan ${S.tab==='logs'?'on':''}" id="panLogs">
    <div class="sg">
      <div class="sc"><div class="sn" id="lsTotal" style="color:var(--acc);font-size:20px">${s.total}</div><div class="sl">Total</div></div>
      <div class="sc"><div class="sn" id="lsSent"  style="color:var(--ok);font-size:20px">${s.ok}</div><div class="sl">Success</div></div>
      <div class="sc"><div class="sn" id="lsErr"   style="color:var(--err);font-size:20px">${s.err}</div><div class="sl">Errors</div></div>
      <div class="sc"><div class="sn" id="lsWarn"  style="color:var(--warn);font-size:20px">${s.warn}</div><div class="sl">Warnings</div></div>
    </div>
    <div class="card" style="flex:1">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div class="ctitle" style="margin:0">📋 Activity Log</div>
        <div style="display:flex;gap:8px">
          <button class="btn bg bsm" onclick="doExportLog()">⬇ Export</button>
          <button class="btn bg bsm" onclick="doClearLog()">🗑 Clear</button>
        </div>
      </div>
      <div id="logList" style="border:1px solid var(--bor);border-radius:8px;max-height:500px;overflow-y:auto">
        ${S.logs.length===0
          ? `<div style="text-align:center;padding:40px;color:var(--mut)"><div style="font-size:36px;margin-bottom:10px">📭</div>No activity yet.</div>`
          : S.logs.map(l=>`<div style="display:flex;gap:10px;padding:7px 12px;border-bottom:1px solid rgba(37,45,66,.4);font-size:11px">
              <span style="color:var(--mut);flex-shrink:0;font-family:monospace;padding-top:1px;font-size:10px">${l.time}</span>
              <span style="flex:1;line-height:1.5;color:${l.type==='success'?'#22c55e':l.type==='error'?'#ef4444':l.type==='warn'?'#f59e0b':'#93c5fd'}">${esc(l.msg)}</span>
            </div>`).join('')
        }
      </div>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
//  GLOBAL ACTIONS
// ══════════════════════════════════════════════════════════════════════════════
window.goTab = (t) => {
  S.tab=t;
  if(t==='logs'){const d=document.getElementById('logDot');if(d)d.style.display='none';}
  document.querySelectorAll('.pan').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('on'));
  const p=document.getElementById('pan'+t.charAt(0).toUpperCase()+t.slice(1));
  if(p) p.classList.add('on');
  document.querySelectorAll('.tab').forEach(b=>{if(b.textContent.toLowerCase().includes(t.slice(0,3)))b.classList.add('on');});
};
window.setStab = (t) => { settingsTab=t; render(); };
window.loadFile = async () => {
  const r=await window.electronAPI.openFileDialog(); if(!r) return;
  try {
    const rows=parseB64(r.data, r.ext==='.csv');
    const f=rows.filter(x=>x['Violator Contact']||x['Violator Owner Contact']);
    S.rows=f; S.fileName=r.name; S.rowStatus={}; S.progress=0; S.previewIdx=0;
    addLog(`✅ Loaded "${r.name}" — ${f.length} records (${rows.length-f.length} without contact skipped)`,'success');
    render();
  } catch(e){ addLog(`❌ Parse error: ${e.message}`,'error'); }
};
window.clearFile  = () => { S.rows=[];S.fileName='';S.rowStatus={};S.progress=0;render(); };
window.togCh = (ch) => {
  S.channels[ch]=!S.channels[ch];
  render();
};
window.pickRow = (i) => {
  document.getElementById(`tr${S.previewIdx}`)?.classList.remove('hl');
  S.previewIdx=i;
  document.getElementById(`tr${i}`)?.classList.add('hl');
  const b=document.getElementById('pvtBox');
  if(b) b.textContent=applyTpl(S.rows[i]||{});
};
window.movePrev = () => { if(S.previewIdx>0) window.pickRow(S.previewIdx-1); };
window.moveNext = () => { if(S.previewIdx<S.rows.length-1) window.pickRow(S.previewIdx+1); };
window.doStart  = () => startSending();
window.doStop   = () => { S.stopFlag=true; addLog('⛔ Stop requested...','warn'); };
window.doReset  = () => { S.rowStatus={}; S.progress=0; render(); addLog('🔄 Status reset','info'); };
window.setSt = (k,v) => {
  S.settings[k]=v;
  if(['lang','hindiTemplate','englishTemplate'].includes(k)){
    const b=document.getElementById('pvtBox');
    if(b) b.textContent=applyTpl(S.rows[S.previewIdx]||{});
  }
};
window.doSaveSettings = async () => {
  await window.electronAPI.saveSettings(S.settings);
  addLog('💾 Settings saved to disk','success');
  alert('✅ Settings saved!');
};
window.resetTpls = () => {
  S.settings.hindiTemplate=DEFAULT_HINDI;
  S.settings.englishTemplate=DEFAULT_ENGLISH;
  render();
};
window.doExportLog = async () => {
  const c=S.logs.map(l=>`[${l.time}] [${l.type.toUpperCase()}] ${l.msg}`).join('\n');
  await window.electronAPI.saveLog({content:c});
  addLog('📄 Log exported','success');
};
window.doClearLog = () => { S.logs=[]; refreshLogs(); };

// ── DRAG & DROP ────────────────────────────────────────────────────────────────
function bindDrag() {
  document.addEventListener('dragover', e=>e.preventDefault());
  document.addEventListener('drop', async e=>{
    e.preventDefault();
    const file=e.dataTransfer.files[0]; if(!file) return;
    const ext='.'+file.name.split('.').pop().toLowerCase();
    if(!['.xlsx','.xlsm','.csv'].includes(ext)) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const b64=btoa(String.fromCharCode(...new Uint8Array(ev.target.result)));
        const rows=parseB64(b64,ext==='.csv');
        const f=rows.filter(x=>x['Violator Contact']||x['Violator Owner Contact']);
        S.rows=f;S.fileName=file.name;S.rowStatus={};S.progress=0;S.previewIdx=0;
        addLog(`✅ Loaded "${file.name}" — ${f.length} records`,'success');
        render();
      }catch(err){addLog(`❌ ${err.message}`,'error');}
    };
    reader.readAsArrayBuffer(file);
  });
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
async function boot() {
  const saved=await window.electronAPI.loadSettings();
  if(saved){ S.settings={...S.settings,...saved}; }
  render();
  addLog('🟢 Challan Sender v2 started. Load a file and configure API keys in Settings.','info');
}
boot();
