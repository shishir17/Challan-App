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

export function applyTemplate(template, row) {
  return template
    .replace(/\{amount\}/g,         row['Amount (Rs.)'] || row['Amount'] || '')
    .replace(/\{vehicle_number\}/g,  row['Vehicle Number'] || '')
    .replace(/\{challan_number\}/g,  row['Challan Number'] || '')
    .replace(/\{violator_name\}/g,   row['Violator Name'] || '');
}

export function getContact(row) {
  return String(row['Violator Contact'] || row['Violator Owner Contact'] || '').replace(/\D/g, '');
}
