// src/utils/fileLoader.js
// Handles: 1) Phone Storage  2) Google Drive  3) Manual paste/CSV

import { Platform } from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import { read, utils } from 'xlsx';

// ── 1. Phone Storage ──────────────────────────────────────────────────────────
export async function pickFromStorage() {
  const result = await DocumentPicker.pickSingle({
    type: [
      DocumentPicker.types.xls,
      DocumentPicker.types.xlsx,
      DocumentPicker.types.csv,
      'application/vnd.ms-excel.sheet.macroEnabled.12',
      'text/comma-separated-values',
      'text/csv',
    ],
    copyTo: 'cachesDirectory',
  });

  const path = result.fileCopyUri || result.uri;
  const cleaned = Platform.OS === 'android'
    ? decodeURIComponent(path.replace('file://', ''))
    : path.replace('file://', '');

  const content = await RNFS.readFile(cleaned, 'base64');
  const rows = parseExcelBase64(content);
  return { rows: filterRows(rows), fileName: result.name };
}

// ── 2. Google Drive (REST API with access token from Google Sign-In) ──────────
export async function listDriveFiles(accessToken) {
  const q = encodeURIComponent(
    "mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'" +
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

export async function downloadDriveFile(fileId, fileName, accessToken) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Download error: ${res.status}`);

  const blob = await res.blob();
  const base64 = await blobToBase64(blob);
  const rows = parseExcelBase64(base64);
  return { rows: filterRows(rows), fileName };
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
export function parseCSVText(text) {
  try {
    const wb = read(text, { type: 'string' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = utils.sheet_to_json(ws, { defval: '' });
    return filterRows(rows);
  } catch (e) {
    throw new Error('Could not parse pasted text. Make sure it is valid CSV with headers.');
  }
}

// ── Core Excel/CSV base64 parser ──────────────────────────────────────────────
export function parseExcelBase64(base64) {
  const wb = read(base64, { type: 'base64' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return utils.sheet_to_json(ws, { defval: '' });
}

function filterRows(rows) {
  return rows.filter(r =>
    r['Violator Contact'] || r['Violator Owner Contact']
  );
}
