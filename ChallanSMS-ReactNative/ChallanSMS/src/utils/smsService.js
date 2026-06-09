// src/utils/smsService.js
// ─────────────────────────────────────────────────────────────────────────────
// SMS Service
// Android : Uses android.telephony.SmsManager → sends silently via SIM
// iOS     : Opens native Messages app (pre-filled) — iOS policy restriction
// ─────────────────────────────────────────────────────────────────────────────

import { Platform, NativeModules, Linking } from 'react-native';

// Daily limit enforced in JS (200 SMS/day)
const DAILY_LIMIT = 200;

// ── Android Native SMS (silent, uses SIM directly) ───────────────────────────
// Calls our custom native module defined in SmsModule.java
const { SmsModule } = NativeModules;

export async function sendSMSAndroid(phone, message) {
  if (!SmsModule) {
    throw new Error('SmsModule native module not found. Did you rebuild the app?');
  }
  return new Promise((resolve) => {
    SmsModule.sendSMS(
      cleanPhone(phone),
      message,
      (error) => resolve({ success: false, error }),
      ()      => resolve({ success: true })
    );
  });
}

// ── iOS SMS (opens Messages app pre-filled) ───────────────────────────────────
export async function sendSMSiOS(phone, message) {
  const num = cleanPhone(phone);
  // sms: URI opens iOS Messages with body pre-filled
  const url = `sms:${num}&body=${encodeURIComponent(message)}`;
  const can = await Linking.canOpenURL(url);
  if (!can) return { success: false, error: 'Cannot open Messages app' };
  await Linking.openURL(url);
  // iOS: we consider it "sent" once the app opens (user taps Send)
  return { success: true, manual: true };
}

// ── Unified send (auto-picks platform) ───────────────────────────────────────
export async function sendSMS(phone, message) {
  if (Platform.OS === 'android') {
    return sendSMSAndroid(phone, message);
  } else {
    return sendSMSiOS(phone, message);
  }
}

// ── Daily limit tracker ───────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getDailyCount() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  try {
    const raw = await AsyncStorage.getItem('sms_daily');
    if (!raw) return 0;
    const data = JSON.parse(raw);
    if (data.date !== today) return 0;
    return data.count || 0;
  } catch { return 0; }
}

export async function incrementDailyCount() {
  const today = new Date().toISOString().slice(0, 10);
  const count = await getDailyCount();
  await AsyncStorage.setItem('sms_daily', JSON.stringify({ date: today, count: count + 1 }));
  return count + 1;
}

export async function resetDailyCount() {
  await AsyncStorage.removeItem('sms_daily');
}

export async function canSendMore() {
  const count = await getDailyCount();
  return count < DAILY_LIMIT;
}

export { DAILY_LIMIT };

// ── Helpers ───────────────────────────────────────────────────────────────────
export function cleanPhone(phone) {
  let p = String(phone).replace(/\D/g, '');
  if (p.length === 10) p = '91' + p;
  return p;
}

// Dynamic templating: any {Column Name} in the template is replaced with that
// column's value from the row (case-insensitive). So if the file has columns
// "name", "mob", "reason", a template "Hello {name} {reason}" just works.
// Legacy short aliases are kept for backward compatibility with old templates.
const LEGACY_ALIASES = {
  amount:         row => row['Amount (Rs.)'] ?? row['Amount (Rs)'] ?? row['Amount'] ?? '',
  vehicle_number: row => row['Vehicle Number'] ?? '',
  challan_number: row => row['Challan Number'] ?? '',
  violator_name:  row => row['Violator Name'] ?? '',
};

export function applyTemplate(template, row) {
  if (!template) return '';
  if (!row) return template;
  return template.replace(/\{([^{}]+)\}/g, (match, rawKey) => {
    const key = rawKey.trim();
    // 1) exact column match
    if (row[key] != null && String(row[key]).trim() !== '') return String(row[key]);
    // 2) case-insensitive column match
    const found = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
    if (found && String(row[found]).trim() !== '') return String(row[found]);
    // 3) legacy alias
    const alias = LEGACY_ALIASES[key.toLowerCase()];
    if (alias) {
      const v = alias(row);
      if (v != null && String(v).trim() !== '') return String(v);
    }
    // 4) unknown / empty -> blank
    return '';
  });
}

// Phone-number column hints (used when the user hasn't configured one).
const CONTACT_HINTS = ['contact', 'mobile', 'phone', 'mob'];

export function getContact(row, contactColumn) {
  if (!row) return '';
  const tryKeys = [];
  if (contactColumn) tryKeys.push(contactColumn);
  tryKeys.push('Violator Contact', 'Violator Owner Contact');
  for (const k of tryKeys) {
    if (row[k] != null && String(row[k]).trim() !== '') {
      return String(row[k]).replace(/\D/g, '');
    }
  }
  // Fall back to any column whose name looks like a phone column.
  const hintKey = Object.keys(row).find(k => {
    const lc = k.toLowerCase();
    return CONTACT_HINTS.some(h => lc.includes(h));
  });
  if (hintKey && String(row[hintKey]).trim() !== '') {
    return String(row[hintKey]).replace(/\D/g, '');
  }
  return '';
}
