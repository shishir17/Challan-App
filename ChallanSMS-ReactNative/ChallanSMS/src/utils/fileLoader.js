// src/utils/fileLoader.js
// Handles: 1) Phone Storage  2) Google Drive  3) Manual paste

import { Platform } from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import { read, utils } from 'xlsx';

// ── 1. Phone Storage ──────────────────────────────────────────────────────────
export async function pickFromStorage() {
  const result = await DocumentPicker.pickSingle({
    type: [DocumentPicker.types.xls, DocumentPicker.types.xlsx, DocumentPicker.types.csv,
           'application/vnd.ms-excel.sheet.macroEnabled.12', // xlsm
           'text/comma-separated-values', 'text/csv'],
    copyTo: 'cachesDirectory',
  });

  const path = result.fileCopyUri || result.uri;
  const cleaned = Platform.OS === 'android'
    ? decodeURIComponent(path.replace('file://', ''))
    : path.replace('file://', '');

  const content = await RNFS.readFile(cleaned, 'base64');
  return parseExcelBase64(content, result.name);
}

// ── 2. Google Drive ───────────────────────────────────────────────────────────
// Note: requires Google Sign-In configured in app
export async function pickFromGoogleDrive(accessToken) {
  // List recent spreadsheet files
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=mimeType%3D'application%2Fvnd.openxmlformats-officedocument.spreadsheetml.sheet'+or+mimeType%3D'text%2Fcsv'&fields=files(id,name,modifiedTime)&orderBy=modifiedTime+desc&pageSize=20`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const listData = await listRes.json();
  return listData.files || [];
}

export async function downloadFromGoogleDrive(fileId, fileName, accessToken) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(parseExcelBase64(base64, fileName));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── 3. Parse CSV text (for manual paste) ─────────────────────────────────────
export function parseCSVText(text) {
  const wb = read(text, { type: 'string' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = utils.sheet_to_json(ws, { defval: '' });
  return filterRows(rows);
}

// ── Core Excel/CSV parser ─────────────────────────────────────────────────────
export function parseExcelBase64(base64, fileName = '') {
  const ext = fileName.split('.').pop().toLowerCase();
  const wb = read(base64, { type: 'base64' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = utils.sheet_to_json(ws, { defval: '' });
  return filterRows(rows);
}

function filterRows(rows) {
  return rows.filter(r =>
    r['Violator Contact'] || r['Violator Owner Contact']
  );
}
