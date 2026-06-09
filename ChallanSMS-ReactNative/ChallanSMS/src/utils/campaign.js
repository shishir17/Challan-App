// src/utils/campaign.js
// ─────────────────────────────────────────────────────────────────────────────
// Campaign = a multi-day SMS plan built from one uploaded sheet.
//
//   • Optionally sorts records by "Amount (Rs.)" descending.
//   • Splits records into daily batches of `batchSize` (= the daily limit).
//   • Batch 0 unlocks today. Each later batch unlocks the calendar day AFTER the
//     previous batch was actually sent (so skipped days simply push the schedule
//     forward — two batches are never sent on the same day).
//   • The whole plan + per-record status is persisted so it survives an app
//     restart without re-uploading the sheet.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'campaign_v1';

// ── Date helpers (local date, YYYY-MM-DD) ─────────────────────────────────────
export function todayStr(d = new Date()) {
  // Local date (not UTC) so "today" matches the user's wall clock.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(todayStr() + 'T00:00:00');
  const target = new Date(dateStr + 'T00:00:00');
  return Math.max(0, Math.round((target - today) / 86400000));
}

// ── Amount parsing / sorting ──────────────────────────────────────────────────
// Handles "Amount (Rs.)", "Amount (Rs)", "Amount" and strips "Rs.", commas, etc.
export function getAmount(row) {
  const raw =
    row['Amount (Rs.)'] ?? row['Amount (Rs)'] ?? row['Amount'] ?? 0;
  const num = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
  return isNaN(num) ? 0 : num;
}

export function sortByAmountDesc(rows) {
  // Stable-ish sort: copy first so the caller's array is untouched.
  return [...rows].sort((a, b) => getAmount(b) - getAmount(a));
}

// Apply ordering for ANY mode (batch or single-shot). When sorting is off we
// keep the sheet's original order.
export function orderRows(rows, sortByAmount) {
  return sortByAmount ? sortByAmountDesc(rows) : [...rows];
}

// ── Build a fresh campaign ────────────────────────────────────────────────────
export function buildCampaign(rows, { batchSize, sortByAmount, fileName }) {
  const ordered = orderRows(rows, sortByAmount);
  const size = Math.max(1, Number(batchSize) || 1);
  const count = Math.ceil(ordered.length / size) || 0;
  const today = todayStr();

  const batches = [];
  for (let i = 0; i < count; i++) {
    batches.push({
      index: i,
      start: i * size,
      end: Math.min((i + 1) * size, ordered.length),
      // null = locked until the previous batch is sent. Batch 0 is open today.
      unlockDate: i === 0 ? today : null,
      status: 'pending',          // 'pending' | 'sent'
      sent: 0,
      failed: 0,
      skipped: 0,
    });
  }

  return {
    fileName,
    batchSize: size,
    sortByAmount: !!sortByAmount,
    createdDate: today,
    rows: ordered,
    batches,
    currentBatch: 0,
    rowStatus: {},               // { [globalRowIndex]: 'sent'|'failed'|'skipped' }
  };
}

// ── The batch the user can act on right now (first not-yet-sent batch) ────────
export function currentBatch(c) {
  if (!c || !c.batches.length) return null;
  return c.batches[c.currentBatch] || null;
}

export function isBatchUnlocked(batch) {
  if (!batch || batch.status === 'sent' || !batch.unlockDate) return false;
  return todayStr() >= batch.unlockDate;
}

export function allBatchesSent(c) {
  return !!c && c.batches.length > 0 && c.currentBatch >= c.batches.length;
}

// ── Mark the current batch sent and unlock the next one for tomorrow ──────────
export function completeBatch(c, idx, stats, rowStatus) {
  const batches = c.batches.map(b =>
    b.index === idx
      ? { ...b, status: 'sent', sentDate: todayStr(), sent: stats.sent, failed: stats.failed, skipped: stats.skipped }
      : { ...b }
  );
  const next = batches[idx + 1];
  if (next) next.unlockDate = addDays(todayStr(), 1); // unlocks the next calendar day

  return {
    ...c,
    batches,
    currentBatch: Math.min(idx + 1, batches.length),
    rowStatus: { ...c.rowStatus, ...rowStatus },
  };
}

// ── Persistence ───────────────────────────────────────────────────────────────
export async function saveCampaign(c) {
  if (!c) return AsyncStorage.removeItem(KEY);
  return AsyncStorage.setItem(KEY, JSON.stringify(c));
}

export async function loadCampaign() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearCampaign() {
  return AsyncStorage.removeItem(KEY);
}
