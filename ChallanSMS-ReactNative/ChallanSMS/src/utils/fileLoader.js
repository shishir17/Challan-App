// src/utils/fileLoader.js
// Handles: 1) Phone Storage  2) Google Drive  3) Manual paste/CSV
//
// Files often have a metadata preamble (e.g. "Report Name :-", dates, etc.) above
// the real table. We auto-detect the header row instead of assuming row 1, and we
// support ANY column layout (the header row is read dynamically).

import { Platform } from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import { read, utils } from 'xlsx';

// Column-name hints used to find the phone/contact column when the user hasn't
// explicitly configured one in Settings.
const CONTACT_HINTS = [
  'violator contact', 'violator owner contact',
  'contact', 'mobile number', 'mobile no', 'mobile', 'phone number', 'phone', 'mob',
];

// ── 1. Phone Storage ──────────────────────────────────────────────────────────
export async function pickFromStorage(opts = {}) {
  // allFiles makes sure .xlsm (and any other spreadsheet/CSV) can always be picked,
  // since some Android file providers don't expose the macro-enabled MIME type.
  const result = await DocumentPicker.pickSingle({
    type: [DocumentPicker.types.allFiles],
    copyTo: 'cachesDirectory',
  });

  const path = result.fileCopyUri || result.uri;
  const cleaned = Platform.OS === 'android'
    ? decodeURIComponent(path.replace('file://', ''))
    : path.replace('file://', '');

  const content = await RNFS.readFile(cleaned, 'base64');
  const { rows, columns } = parseExcelBase64(content);
  return { rows: filterRows(rows, columns, opts.contactColumn), columns, fileName: result.name };
}

// ── 2. Google Drive (REST API with access token from Google Sign-In) ──────────
export async function listDriveFiles(accessToken) {
  const q = encodeURIComponent(
    "mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'" +
    " or mimeType='application/vnd.ms-excel.sheet.macroEnabled.12'" +
    " or mimeType='text/csv'" +
    " or mimeType='application/vnd.ms-excel'"
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime+desc&pageSize=30`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
  const data = await res.json();
  return data.files || [];
}

export async function downloadDriveFile(fileId, fileName, accessToken, opts = {}) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Download error: ${res.status}`);

  const blob = await res.blob();
  const base64 = await blobToBase64(blob);
  const { rows, columns } = parseExcelBase64(base64);
  return { rows: filterRows(rows, columns, opts.contactColumn), columns, fileName };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── 3. Parse CSV/Excel text (for manual paste) ────────────────────────────────
export function parseCSVText(text, opts = {}) {
  try {
    const wb = read(text, { type: 'string' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = utils.sheet_to_json(ws, { header: 1, defval: '' });
    const { rows, columns } = aoaToRows(aoa);
    return { rows: filterRows(rows, columns, opts.contactColumn), columns };
  } catch (e) {
    throw new Error('Could not parse pasted text. Make sure it is valid CSV with headers.');
  }
}

// ── Core Excel/CSV base64 parser ──────────────────────────────────────────────
export function parseExcelBase64(base64) {
  const wb = read(base64, { type: 'base64' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = utils.sheet_to_json(ws, { header: 1, defval: '' });
  return aoaToRows(aoa);
}

// ── Header-row detection + object building ────────────────────────────────────
// The header row is taken to be the row with the most non-empty cells (scanning
// the first 50 rows). This skips any "Report Name / dates" preamble that report
// exports put above the actual table.
export function aoaToRows(aoa) {
  if (!aoa || !aoa.length) return { rows: [], columns: [] };

  const scan = Math.min(aoa.length, 50);
  let headerIdx = 0, best = -1;
  for (let i = 0; i < scan; i++) {
    const n = (aoa[i] || []).filter(c => String(c).trim() !== '').length;
    if (n > best) { best = n; headerIdx = i; }
  }

  const rawHeaders = aoa[headerIdx] || [];
  // Name blank header cells, and de-duplicate repeated header names.
  const seen = {};
  const columns = rawHeaders.map((h, i) => {
    let name = String(h).trim() || `Column ${i + 1}`;
    if (seen[name] === undefined) { seen[name] = 0; }
    else { seen[name] += 1; name = `${name} (${seen[name]})`; }
    return name;
  });

  const rows = [];
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const arr = aoa[r] || [];
    if (arr.every(c => String(c).trim() === '')) continue; // skip blank rows
    const obj = {};
    for (let c = 0; c < columns.length; c++) {
      obj[columns[c]] = arr[c] !== undefined && arr[c] !== null ? arr[c] : '';
    }
    rows.push(obj);
  }
  return { rows, columns };
}

// ── Resolve which column holds the phone number ───────────────────────────────
export function resolveContactKeys(columns, contactColumn) {
  const keys = [];
  if (columns && columns.length) {
    if (contactColumn) {
      const lc = String(contactColumn).toLowerCase().trim();
      const exact = columns.find(c => c.toLowerCase().trim() === lc);
      if (exact) keys.push(exact);
    }
    // Always also consider the standard challan contact columns + hint matches.
    for (const hint of CONTACT_HINTS) {
      const k = columns.find(c => c.toLowerCase().includes(hint) && !keys.includes(c));
      if (k) keys.push(k);
    }
  }
  return keys;
}

// Keep rows that have a value in a contact-like column. If the sheet has no
// recognizable contact column at all, keep every non-empty row (so the user at
// least sees their data instead of "zero records").
function filterRows(rows, columns, contactColumn) {
  const contactKeys = resolveContactKeys(columns, contactColumn);
  if (!contactKeys.length) return rows;
  return rows.filter(r => contactKeys.some(k => String(r[k] ?? '').trim() !== ''));
}
