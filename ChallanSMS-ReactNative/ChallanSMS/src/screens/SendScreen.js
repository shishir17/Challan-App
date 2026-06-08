// src/screens/SendScreen.js
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, ActivityIndicator, Platform, FlatList, TextInput, Modal,
} from 'react-native';
import { PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, DAILY_LIMIT } from '../utils/theme';
import {
  sendSMS, getDailyCount, incrementDailyCount,
  canSendMore, applyTemplate, getContact,
} from '../utils/smsService';
import { pickFromStorage, parseCSVText } from '../utils/fileLoader';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export default function SendScreen({
  rows, setRows, fileName, setFileName,
  rowStatus, setRowStatus, settings, addLog,
}) {
  const [sending, setSending]       = useState(false);
  const [stopFlag, setStopFlag]     = useState(false);
  const [progress, setProgress]     = useState(0);
  const [dailyCount, setDailyCount] = useState(0);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [loadModal, setLoadModal]   = useState(false);
  const [pasteText, setPasteText]   = useState('');
  const [pasteModal, setPasteModal] = useState(false);
  const [loading, setLoading]       = useState(false);
  const stopRef = useRef(false);

  // Refresh daily count on focus
  React.useEffect(() => {
    getDailyCount().then(setDailyCount);
  }, []);

  // ── Request SMS permission (Android) ────────────────────────────────────────
  const requestSmsPermission = async () => {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.SEND_SMS,
      {
        title: 'SMS Permission Required',
        message: 'ChallanSMS needs permission to send SMS via your SIM card.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  // ── Load from Storage ────────────────────────────────────────────────────────
  const loadFromStorage = async () => {
    setLoadModal(false);
    setLoading(true);
    try {
      const { rows: r, fileName: fn } = await pickFromStorage();
      // pickFromStorage returns parsed rows from fileLoader
      setRows(r);
      setFileName(fn);
      setRowStatus({});
      setProgress(0);
      setPreviewIdx(0);
      addLog(`✅ Loaded "${fn}" — ${r.length} records`, 'success');
    } catch (e) {
      if (!e.toString().includes('cancel')) {
        addLog(`❌ File load error: ${e.message}`, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Load from paste ──────────────────────────────────────────────────────────
  const loadFromPaste = () => {
    try {
      const r = parseCSVText(pasteText);
      setRows(r);
      setFileName('Pasted data');
      setRowStatus({});
      setPasteModal(false);
      setPasteText('');
      addLog(`✅ Parsed pasted data — ${r.length} records`, 'success');
    } catch (e) {
      Alert.alert('Parse Error', e.message);
    }
  };

  // ── Start Sending ────────────────────────────────────────────────────────────
  const startSending = async () => {
    if (!rows.length) return Alert.alert('No Data', 'Load a file first.');

    const daily = await getDailyCount();
    const remaining = DAILY_LIMIT - daily;
    if (remaining <= 0) {
      return Alert.alert(
        'Daily Limit Reached',
        `You have sent ${daily} SMS today. Limit is ${DAILY_LIMIT}/day.\nTry again tomorrow.`
      );
    }

    if (Platform.OS === 'android') {
      const ok = await requestSmsPermission();
      if (!ok) return Alert.alert('Permission Denied', 'SMS permission is required to send messages.');
    }

    const toSend = Math.min(rows.length, remaining);
    Alert.alert(
      'Confirm Send',
      `Send SMS to ${toSend} contacts?\n(${daily} sent today · ${remaining} remaining today · Limit: ${DAILY_LIMIT}/day)\n\nDelay: ${settings.delay}ms between each`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start', style: 'default', onPress: () => doSend(toSend) },
      ]
    );
  };

  const doSend = async (limit) => {
    setSending(true);
    stopRef.current = false;
    setStopFlag(false);
    setProgress(0);

    const template = settings.lang === 'hindi'
      ? settings.hindiTemplate
      : settings.englishTemplate;

    addLog(`🚀 Starting — ${limit} records · ${Platform.OS === 'android' ? 'Direct SIM' : 'iOS Messages'}`, 'info');

    let sentCount = 0;

    for (let i = 0; i < rows.length && sentCount < limit; i++) {
      if (stopRef.current) {
        addLog(`⛔ Stopped at ${i + 1}/${rows.length}`, 'warn');
        break;
      }

      const row     = rows[i];
      const contact = getContact(row);
      const vehicle = row['Vehicle Number'] || '?';
      const amount  = row['Amount (Rs.)'] || '0';
      const n       = i + 1;

      if (!contact || contact.length < 8) {
        setRowStatus(prev => ({ ...prev, [i]: 'skipped' }));
        addLog(`[${n}] ⚠️  SKIP — ${vehicle} — no contact`, 'warn');
        setProgress(Math.round((n / rows.length) * 100));
        continue;
      }

      const message = applyTemplate(template, row);

      try {
        const res = await sendSMS(contact, message);
        if (res.success) {
          await incrementDailyCount();
          sentCount++;
          setDailyCount(await getDailyCount());
          setRowStatus(prev => ({ ...prev, [i]: 'sent' }));
          const tag = res.manual ? '💬 Opened (iOS)' : '📱 SMS Sent';
          addLog(`[${n}] ${tag} → +91${contact} | ${vehicle} | ₹${amount}`, 'success');
        } else {
          setRowStatus(prev => ({ ...prev, [i]: 'failed' }));
          addLog(`[${n}] ❌ FAIL → ${contact} | ${res.error}`, 'error');
        }
      } catch (e) {
        setRowStatus(prev => ({ ...prev, [i]: 'failed' }));
        addLog(`[${n}] ❌ ERROR → ${contact} | ${e.message}`, 'error');
      }

      setProgress(Math.round((n / rows.length) * 100));

      // Delay between sends (except last)
      if (i < rows.length - 1 && !stopRef.current) {
        await sleep(settings.delay);
      }
    }

    setSending(false);
    const s = Object.values(rowStatus);
    addLog(
      `🏁 Done — ✅ ${sentCount} sent · ❌ ${s.filter(x=>x==='failed').length} failed`,
      'info'
    );
    getDailyCount().then(setDailyCount);
  };

  const stopSending = () => {
    stopRef.current = true;
    setStopFlag(true);
  };

  // ── Stats ────────────────────────────────────────────────────────────────────
  const sent    = Object.values(rowStatus).filter(x => x === 'sent').length;
  const failed  = Object.values(rowStatus).filter(x => x === 'failed').length;
  const skipped = Object.values(rowStatus).filter(x => x === 'skipped').length;
  const prow    = rows[previewIdx] || {};

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>

      {/* ── Daily counter ── */}
      <View style={s.dailyBar}>
        <Text style={s.dailyLabel}>📅 Today's SMS</Text>
        <View style={s.dailyRight}>
          <Text style={[s.dailyNum, dailyCount >= DAILY_LIMIT && { color: C.red }]}>
            {dailyCount} / {DAILY_LIMIT}
          </Text>
          {dailyCount >= DAILY_LIMIT && (
            <Text style={s.limitReached}>LIMIT REACHED</Text>
          )}
        </View>
        <View style={s.dailyTrack}>
          <View style={[s.dailyFill, { width: `${Math.min((dailyCount / DAILY_LIMIT) * 100, 100)}%`,
            backgroundColor: dailyCount >= DAILY_LIMIT ? C.red : C.green }]} />
        </View>
      </View>

      {/* ── Stats ── */}
      {rows.length > 0 && (
        <View style={s.statRow}>
          {[
            { l: 'Total',   v: rows.length, c: C.accent  },
            { l: 'Sent',    v: sent,         c: C.green   },
            { l: 'Failed',  v: failed,       c: C.red     },
            { l: 'Pending', v: rows.length - sent - failed - skipped, c: C.yellow },
          ].map(st => (
            <View key={st.l} style={s.statCard}>
              <Text style={[s.statNum, { color: st.c }]}>{st.v}</Text>
              <Text style={s.statLabel}>{st.l}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── File loader ── */}
      <View style={s.card}>
        <Text style={s.cardTitle}>📁 DATA FILE</Text>
        {!rows.length ? (
          <TouchableOpacity style={s.uploadZone} onPress={() => setLoadModal(true)}>
            {loading
              ? <ActivityIndicator color={C.accent} size="large" />
              : <>
                  <Text style={s.uploadIcon}>📊</Text>
                  <Text style={s.uploadTitle}>Tap to load your Excel / CSV file</Text>
                  <Text style={s.uploadSub}>Phone storage · Google Drive · Paste CSV</Text>
                </>
            }
          </TouchableOpacity>
        ) : (
          <View style={s.fileLoaded}>
            <Text style={{ fontSize: 24 }}>📋</Text>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.fileName} numberOfLines={1}>{fileName}</Text>
              <Text style={s.fileMeta}>{rows.length} records loaded</Text>
            </View>
            <TouchableOpacity onPress={() => { setRows([]); setFileName(''); setRowStatus({}); setProgress(0); }}>
              <Text style={s.changeBtn}>Change</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Platform note ── */}
      <View style={[s.infoBox, Platform.OS === 'ios' && { borderColor: C.yellow }]}>
        <Text style={s.infoText}>
          {Platform.OS === 'android'
            ? '✅ Android: SMS sent silently via SIM — no tapping needed'
            : '⚠️  iOS: Each SMS opens Messages app — you tap Send manually (iOS policy)'
          }
        </Text>
      </View>

      {/* ── Message preview ── */}
      {rows.length > 0 && (
        <View style={s.card}>
          <View style={s.previewHeader}>
            <Text style={s.cardTitle}>👁 PREVIEW — Record #{previewIdx + 1}/{rows.length}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity style={s.navBtn} onPress={() => setPreviewIdx(i => Math.max(0, i - 1))}>
                <Text style={s.navBtnTxt}>‹</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.navBtn} onPress={() => setPreviewIdx(i => Math.min(rows.length - 1, i + 1))}>
                <Text style={s.navBtnTxt}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={s.chipRow}>
            <View style={[s.chip, { backgroundColor: 'rgba(79,142,247,.15)' }]}>
              <Text style={{ color: C.accent, fontSize: 11, fontWeight: '700' }}>📞 {getContact(prow) || 'No contact'}</Text>
            </View>
            <View style={[s.chip, { backgroundColor: 'rgba(245,158,11,.15)' }]}>
              <Text style={{ color: C.yellow, fontSize: 11, fontWeight: '700' }}>🚗 {prow['Vehicle Number'] || 'N/A'}</Text>
            </View>
            <View style={[s.chip, { backgroundColor: 'rgba(34,197,94,.15)' }]}>
              <Text style={{ color: C.green, fontSize: 11, fontWeight: '700' }}>₹ {prow['Amount (Rs.)'] || '0'}</Text>
            </View>
          </View>
          <ScrollView style={s.previewBox} nestedScrollEnabled>
            <Text style={s.previewText}>
              {applyTemplate(
                settings.lang === 'hindi' ? settings.hindiTemplate : settings.englishTemplate,
                prow
              )}
            </Text>
          </ScrollView>
        </View>
      )}

      {/* ── Progress ── */}
      {rows.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>🚀 SEND CONTROLS</Text>
          <View style={s.progressWrap}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ color: C.muted, fontSize: 11 }}>Progress</Text>
              <Text style={{ color: C.text, fontSize: 11, fontFamily: 'monospace' }}>
                {progress}% · ✅{sent} ❌{failed}
              </Text>
            </View>
            <View style={s.progTrack}>
              <View style={[s.progFill, { width: `${progress}%` }]} />
            </View>
          </View>

          <View style={s.btnRow}>
            {!sending ? (
              <TouchableOpacity
                style={[s.btn, s.btnPrimary, (!rows.length || dailyCount >= DAILY_LIMIT) && s.btnDisabled]}
                onPress={startSending}
                disabled={!rows.length || dailyCount >= DAILY_LIMIT}
              >
                <Text style={s.btnTxt}>▶ Start Sending ({Math.min(rows.length, DAILY_LIMIT - dailyCount)} SMS)</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[s.btn, s.btnDanger]} onPress={stopSending}>
                <Text style={s.btnTxt}>⏹ Stop</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[s.btn, s.btnGhost]}
              onPress={() => { setRowStatus({}); setProgress(0); }}
            >
              <Text style={[s.btnTxt, { color: C.muted }]}>🔄 Reset</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 10, color: C.muted, marginTop: 8, textAlign: 'center' }}>
            Delay: {settings.delay}ms between messages · Limit: {DAILY_LIMIT}/day
          </Text>
        </View>
      )}

      {/* ── Records table ── */}
      {rows.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>📋 ALL RECORDS ({rows.length})</Text>
          {rows.slice(0, 100).map((row, i) => {
            const st2 = rowStatus[i] || 'pending';
            const dotColor = st2 === 'sent' ? C.green : st2 === 'failed' ? C.red : st2 === 'skipped' ? C.muted : C.yellow;
            return (
              <TouchableOpacity
                key={i}
                style={[s.tableRow, previewIdx === i && s.tableRowHL]}
                onPress={() => setPreviewIdx(i)}
              >
                <View style={[s.statusDot, { backgroundColor: dotColor }]} />
                <Text style={[s.tableVehicle]}>{row['Vehicle Number'] || '—'}</Text>
                <Text style={s.tableContact}>{getContact(row) || '—'}</Text>
                <Text style={[s.tableAmount, { color: C.green }]}>₹{row['Amount (Rs.)'] || '0'}</Text>
                <Text style={[s.tableStatus, { color: dotColor }]}>{st2}</Text>
              </TouchableOpacity>
            );
          })}
          {rows.length > 100 && (
            <Text style={{ color: C.muted, fontSize: 11, textAlign: 'center', padding: 8 }}>
              Showing 100 of {rows.length} — all will be processed during send
            </Text>
          )}
        </View>
      )}

      {/* ── Load Modal ── */}
      <Modal visible={loadModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Load Data File</Text>
            <Text style={s.modalSub}>Choose how to import your challan data</Text>

            <TouchableOpacity style={s.modalOption} onPress={loadFromStorage}>
              <Text style={s.modalOptionIcon}>📂</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.modalOptionTitle}>Phone Storage</Text>
                <Text style={s.modalOptionSub}>Browse .xlsx, .xlsm, .csv files from your device</Text>
              </View>
              <Text style={{ color: C.muted }}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.modalOption} onPress={() => {
              setLoadModal(false);
              Alert.alert(
                'Google Drive',
                'Google Drive integration requires:\n1. Enable Google Sign-In in Settings\n2. Sign in with your Google account\n3. Then come back here to browse Drive files.',
                [{ text: 'Go to Settings', onPress: () => {} }, { text: 'OK' }]
              );
            }}>
              <Text style={s.modalOptionIcon}>☁️</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.modalOptionTitle}>Google Drive</Text>
                <Text style={s.modalOptionSub}>Browse & import files from your Drive</Text>
              </View>
              <Text style={{ color: C.muted }}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.modalOption} onPress={() => { setLoadModal(false); setPasteModal(true); }}>
              <Text style={s.modalOptionIcon}>📋</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.modalOptionTitle}>Paste CSV Data</Text>
                <Text style={s.modalOptionSub}>Copy CSV text and paste it directly</Text>
              </View>
              <Text style={{ color: C.muted }}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.btn, s.btnGhost, { marginTop: 16 }]} onPress={() => setLoadModal(false)}>
              <Text style={[s.btnTxt, { color: C.muted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Paste Modal ── */}
      <Modal visible={pasteModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { maxHeight: '80%' }]}>
            <Text style={s.modalTitle}>Paste CSV Data</Text>
            <Text style={s.modalSub}>
              Copy your CSV text (with header row) and paste below.{'\n'}
              Must have: Vehicle Number, Violator Contact, Amount (Rs.), Challan Number
            </Text>
            <TextInput
              style={s.pasteInput}
              multiline
              value={pasteText}
              onChangeText={setPasteText}
              placeholder={'Vehicle Number,Violator Contact,Amount (Rs.),Challan Number\nUP32LY7577,9198444494,200,UP1234...'}
              placeholderTextColor={C.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={s.btnRow}>
              <TouchableOpacity style={[s.btn, s.btnPrimary, { flex: 1 }]} onPress={loadFromPaste}>
                <Text style={s.btnTxt}>✓ Parse & Load</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => setPasteModal(false)}>
                <Text style={[s.btnTxt, { color: C.muted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.bg },
  content:       { padding: 14, gap: 12, paddingBottom: 30 },
  dailyBar:      { backgroundColor: C.card, borderRadius: 10, padding: 12,
                   borderWidth: 1, borderColor: C.border },
  dailyLabel:    { fontSize: 11, color: C.muted, fontWeight: '700', letterSpacing: 1 },
  dailyRight:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                   marginVertical: 4 },
  dailyNum:      { fontSize: 20, fontWeight: '800', color: C.green, fontVariant: ['tabular-nums'] },
  limitReached:  { fontSize: 10, color: C.red, fontWeight: '700',
                   backgroundColor: 'rgba(239,68,68,.15)', paddingHorizontal: 8,
                   paddingVertical: 2, borderRadius: 4 },
  dailyTrack:    { height: 5, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
  dailyFill:     { height: '100%', borderRadius: 3 },
  statRow:       { flexDirection: 'row', gap: 8 },
  statCard:      { flex: 1, backgroundColor: C.card, borderRadius: 8, padding: 10,
                   alignItems: 'center', borderWidth: 1, borderColor: C.border },
  statNum:       { fontSize: 20, fontWeight: '800' },
  statLabel:     { fontSize: 9, color: C.muted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.8 },
  card:          { backgroundColor: C.card, borderRadius: 12, padding: 14,
                   borderWidth: 1, borderColor: C.border },
  cardTitle:     { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: C.muted,
                   marginBottom: 10, textTransform: 'uppercase' },
  uploadZone:    { borderWidth: 2, borderColor: C.border, borderStyle: 'dashed',
                   borderRadius: 10, padding: 28, alignItems: 'center' },
  uploadIcon:    { fontSize: 32, marginBottom: 8 },
  uploadTitle:   { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 4 },
  uploadSub:     { fontSize: 11, color: C.muted },
  fileLoaded:    { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
                   borderRadius: 8, padding: 10 },
  fileName:      { fontSize: 13, fontWeight: '600', color: C.text },
  fileMeta:      { fontSize: 11, color: C.muted, marginTop: 2 },
  changeBtn:     { fontSize: 12, color: C.accent, fontWeight: '600', paddingLeft: 10 },
  infoBox:       { padding: 10, borderRadius: 8, borderWidth: 1, borderColor: C.green,
                   backgroundColor: 'rgba(34,197,94,.07)' },
  infoText:      { fontSize: 11, color: C.text, lineHeight: 16 },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip:          { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 4 },
  navBtn:        { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: C.surface,
                   borderRadius: 6, borderWidth: 1, borderColor: C.border },
  navBtnTxt:     { color: C.text, fontSize: 16 },
  previewBox:    { backgroundColor: C.surface, borderRadius: 8, padding: 10,
                   maxHeight: 150, borderWidth: 1, borderColor: C.border },
  previewText:   { fontSize: 12, color: '#93c5fd', lineHeight: 20 },
  progressWrap:  { backgroundColor: C.surface, borderRadius: 8, padding: 12,
                   marginBottom: 12, borderWidth: 1, borderColor: C.border },
  progTrack:     { height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
  progFill:      { height: '100%', backgroundColor: C.accent, borderRadius: 3 },
  btnRow:        { flexDirection: 'row', gap: 8 },
  btn:           { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8,
                   alignItems: 'center', justifyContent: 'center' },
  btnPrimary:    { backgroundColor: C.accent, flex: 1 },
  btnDanger:     { backgroundColor: C.red, flex: 1 },
  btnGhost:      { borderWidth: 1, borderColor: C.border, paddingHorizontal: 14 },
  btnDisabled:   { opacity: 0.4 },
  btnTxt:        { color: C.white, fontWeight: '700', fontSize: 13 },
  tableRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 7,
                   borderBottomWidth: 1, borderBottomColor: 'rgba(37,45,66,.5)', gap: 6 },
  tableRowHL:    { backgroundColor: 'rgba(79,142,247,.07)', borderRadius: 6 },
  statusDot:     { width: 7, height: 7, borderRadius: 4 },
  tableVehicle:  { color: C.accent, fontSize: 11, fontWeight: '600', width: 90 },
  tableContact:  { color: C.text, fontSize: 11, flex: 1, fontFamily: 'monospace' },
  tableAmount:   { fontSize: 11, fontWeight: '600', width: 55, textAlign: 'right' },
  tableStatus:   { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, width: 48, textAlign: 'right' },
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,.7)', justifyContent: 'flex-end' },
  modalBox:      { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
                   padding: 20, borderWidth: 1, borderColor: C.border },
  modalTitle:    { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 4 },
  modalSub:      { fontSize: 12, color: C.muted, marginBottom: 18 },
  modalOption:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
                   backgroundColor: C.surface, borderRadius: 10, marginBottom: 8,
                   borderWidth: 1, borderColor: C.border },
  modalOptionIcon: { fontSize: 24 },
  modalOptionTitle:{ fontSize: 14, fontWeight: '700', color: C.text },
  modalOptionSub:  { fontSize: 11, color: C.muted, marginTop: 2 },
  pasteInput:    { backgroundColor: C.surface, borderRadius: 8, borderWidth: 1,
                   borderColor: C.border, padding: 12, color: C.text, fontSize: 12,
                   minHeight: 160, textAlignVertical: 'top', fontFamily: 'monospace',
                   marginBottom: 12 },
});
