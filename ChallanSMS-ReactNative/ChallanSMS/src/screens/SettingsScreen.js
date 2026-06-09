// src/screens/SettingsScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Switch, Alert, Platform,
} from 'react-native';
import { C, DEFAULT_HINDI, DEFAULT_ENGLISH, DAILY_LIMIT } from '../utils/theme';
import { resetDailyCount } from '../utils/smsService';
import { clearCampaign } from '../utils/campaign';

const STABS = ['Templates', 'General', 'About'];

// Numeric field that lets you freely edit (including clearing it) while typing,
// and only clamps/commits the value when you finish editing (blur / submit).
// This fixes the bug where typing a multi-digit limit snapped back to "1".
function NumField({ value, onCommit, min, max, fallback, width = 80 }) {
  const [text, setText] = useState(String(value ?? ''));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(String(value ?? '')); }, [value, focused]);

  const commit = () => {
    setFocused(false);
    let n = parseInt(text, 10);
    if (isNaN(n)) n = fallback;
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    setText(String(n));
    onCommit(n);
  };

  return (
    <TextInput
      style={[st.inp, { width, textAlign: 'center' }]}
      value={text}
      onFocus={() => setFocused(true)}
      onChangeText={setText}
      onBlur={commit}
      onSubmitEditing={commit}
      keyboardType="numeric"
      returnKeyType="done"
    />
  );
}

export default function SettingsScreen({ settings, saveSettings, addLog, columns = [] }) {
  const [tab, setTab] = useState('Templates');
  const s = settings;

  const update = (key, val) => saveSettings({ ...s, [key]: val });

  const handleResetDaily = () => {
    Alert.alert(
      'Reset Daily Count',
      'This will reset today\'s SMS counter to 0. Use only for testing.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: async () => {
          await resetDailyCount();
          addLog('🔄 Daily SMS counter reset to 0', 'warn');
          Alert.alert('Done', 'Daily counter reset.');
        }},
      ]
    );
  };

  return (
    <ScrollView style={st.root} contentContainerStyle={st.content}>

      {/* Sub-tabs */}
      <View style={st.stabs}>
        {STABS.map(t => (
          <TouchableOpacity
            key={t}
            style={[st.stab, tab === t && st.stabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[st.stabTxt, tab === t && st.stabTxtActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── TEMPLATES ── */}
      {tab === 'Templates' && (
        <View style={st.card}>
          <Text style={st.cardTitle}>📝 MESSAGE TEMPLATES</Text>

          <View style={st.fg}>
            <Text style={st.label}>Language</Text>
            <View style={st.segRow}>
              {['hindi', 'english'].map(l => (
                <TouchableOpacity
                  key={l}
                  style={[st.seg, s.lang === l && st.segActive]}
                  onPress={() => update('lang', l)}
                >
                  <Text style={[st.segTxt, s.lang === l && st.segTxtActive]}>
                    {l === 'hindi' ? 'हिंदी' : 'English'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={st.hintBox}>
            <Text style={st.hintTxt}>
              Use any column from your file as a variable by wrapping its header in
              {' '}<Text style={{ color: C.accent }}>{'{ }'}</Text>. Example: a file with
              {' '}headers <Text style={{ color: C.text }}>name, mob, reason</Text> →
              {' '}template <Text style={{ color: C.accent }}>Hello {'{name}'} — {'{reason}'}</Text>.
            </Text>
            {columns.length > 0 ? (
              <>
                <Text style={[st.hintTxt, { marginTop: 8, color: C.text, fontWeight: '700' }]}>
                  Columns in your loaded file (tap-friendly):
                </Text>
                <View style={st.chipWrap}>
                  {columns.map(col => (
                    <View key={col} style={st.varChip}>
                      <Text style={st.varChipTxt}>{`{${col}}`}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={[st.hintTxt, { marginTop: 8 }]}>
                Built-in aliases also work:{'\n'}
                <Text style={{ color: C.accent }}>{'  {amount}'}</Text> ·
                <Text style={{ color: C.accent }}>{' {vehicle_number}'}</Text> ·
                <Text style={{ color: C.accent }}>{' {challan_number}'}</Text> ·
                <Text style={{ color: C.accent }}>{' {violator_name}'}</Text>
                {'\n'}Load a file on the Send tab to see its exact column names here.
              </Text>
            )}
          </View>

          <View style={st.fg}>
            <Text style={st.label}>Hindi Template (हिंदी)</Text>
            <TextInput
              style={[st.inp, st.textarea]}
              multiline
              value={s.hindiTemplate}
              onChangeText={v => update('hindiTemplate', v)}
              placeholderTextColor={C.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={st.fg}>
            <Text style={st.label}>English Template</Text>
            <TextInput
              style={[st.inp, st.textarea]}
              multiline
              value={s.englishTemplate}
              onChangeText={v => update('englishTemplate', v)}
              placeholderTextColor={C.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={[st.btn, st.btnGhost]}
            onPress={() => {
              update('hindiTemplate',   DEFAULT_HINDI);
              update('englishTemplate', DEFAULT_ENGLISH);
              Alert.alert('Done', 'Templates reset to defaults.');
            }}
          >
            <Text style={[st.btnTxt, { color: C.muted }]}>↩ Reset Templates to Default</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── GENERAL ── */}
      {tab === 'General' && (
        <>
          <View style={st.card}>
            <Text style={st.cardTitle}>📑 FILE COLUMNS</Text>

            <View style={st.fg}>
              <Text style={st.label}>Phone / Contact Column</Text>
              <Text style={[st.switchSub, { marginBottom: 6 }]}>
                Header of the column that holds the mobile number. Leave the default
                if unsure — the app also auto-detects columns named like
                "contact", "mobile", "phone".
              </Text>
              <TextInput
                style={st.inp}
                value={s.contactColumn || ''}
                onChangeText={v => update('contactColumn', v)}
                placeholder="e.g. Violator Contact / mob / phone"
                placeholderTextColor={C.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {columns.length > 0 && (
              <View style={st.hintBox}>
                <Text style={[st.hintTxt, { color: C.text, fontWeight: '700' }]}>
                  Detected columns in your loaded file:
                </Text>
                <View style={st.chipWrap}>
                  {columns.map(col => (
                    <View key={col} style={st.varChip}>
                      <Text style={st.varChipTxt}>{col}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          <View style={st.card}>
            <Text style={st.cardTitle}>⚙️ SEND SETTINGS</Text>

            <View style={st.row}>
              <View style={{ flex: 1 }}>
                <Text style={st.switchLabel}>Country Code</Text>
                <Text style={st.switchSub}>India = 91 (added to 10-digit numbers)</Text>
              </View>
              <TextInput
                style={[st.inp, { width: 70, textAlign: 'center' }]}
                value={s.countryCode}
                onChangeText={v => update('countryCode', v.replace(/\D/g, ''))}
                keyboardType="numeric"
                maxLength={4}
              />
            </View>

            <View style={[st.row, { marginTop: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={st.switchLabel}>Delay Between Messages</Text>
                <Text style={st.switchSub}>Milliseconds. Recommended: 2000–5000ms</Text>
              </View>
              <NumField
                value={s.delay}
                onCommit={v => update('delay', v)}
                min={0}
                max={60000}
                fallback={3000}
                width={80}
              />
            </View>
          </View>

          <View style={st.card}>
            <Text style={st.cardTitle}>📅 DAILY LIMIT</Text>
            <View style={st.infoBox}>
              <Text style={st.infoTxt}>
                Maximum <Text style={{ color: C.yellow, fontWeight: '700' }}>{DAILY_LIMIT} SMS per day</Text> enforced automatically.{'\n'}
                This protects your SIM from being flagged as spam by the carrier.{'\n\n'}
                Counter resets automatically at midnight every day.
              </Text>
            </View>

            <View style={[st.row, { marginTop: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={st.switchLabel}>Daily Limit (per day)</Text>
                <Text style={st.switchSub}>Records sent per day · batch size · max {DAILY_LIMIT}</Text>
              </View>
              <NumField
                value={s.dailyLimit || DAILY_LIMIT}
                onCommit={v => update('dailyLimit', v)}
                min={1}
                max={DAILY_LIMIT}
                fallback={DAILY_LIMIT}
                width={80}
              />
            </View>
          </View>

          <View style={st.card}>
            <Text style={st.cardTitle}>🗂 BATCHING & SCHEDULING</Text>

            <View style={st.row}>
              <View style={{ flex: 1 }}>
                <Text style={st.switchLabel}>Batch & Schedule Sending</Text>
                <Text style={st.switchSub}>
                  ON: split the sheet into daily batches of {s.dailyLimit || DAILY_LIMIT}; send one batch
                  per day. OFF: send only the top {s.dailyLimit || DAILY_LIMIT} records now.
                </Text>
              </View>
              <Switch
                value={s.batchEnabled !== false}
                onValueChange={v => update('batchEnabled', v)}
                trackColor={{ false: C.border, true: C.accent }}
                thumbColor={C.white}
              />
            </View>

            <View style={[st.row, { marginTop: 14 }]}>
              <View style={{ flex: 1 }}>
                <Text style={st.switchLabel}>Sort by Amount (high → low)</Text>
                <Text style={st.switchSub}>
                  ON: order records by "Amount (Rs.)" descending before sending. OFF:
                  keep the sheet's original order.
                </Text>
              </View>
              <Switch
                value={s.sortByAmount !== false}
                onValueChange={v => update('sortByAmount', v)}
                trackColor={{ false: C.border, true: C.accent }}
                thumbColor={C.white}
              />
            </View>

            <View style={[st.infoBox, { marginTop: 14 }]}>
              <Text style={st.infoTxt}>
                Changing these options applies the next time you load a sheet. A
                schedule already in progress keeps its original settings.
              </Text>
            </View>

            <TouchableOpacity
              style={[st.btn, { backgroundColor: 'rgba(239,68,68,.15)', borderWidth: 1, borderColor: C.red, marginTop: 12 }]}
              onPress={handleResetDaily}
            >
              <Text style={[st.btnTxt, { color: C.red }]}>🔄 Reset Today's Counter (Testing Only)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[st.btn, st.btnGhost, { marginTop: 8 }]}
              onPress={() => {
                Alert.alert(
                  'Clear Saved Schedule',
                  'This deletes the current multi-day batch plan. Re-upload the sheet to start a new schedule.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Clear', style: 'destructive', onPress: async () => {
                      await clearCampaign();
                      addLog('🗑 Cleared saved batch schedule', 'warn');
                      Alert.alert('Done', 'Saved schedule cleared. Reload your sheet on the Send tab.');
                    }},
                  ]
                );
              }}
            >
              <Text style={[st.btnTxt, { color: C.muted }]}>🗑 Clear Saved Schedule</Text>
            </TouchableOpacity>
          </View>

          {Platform.OS === 'ios' && (
            <View style={[st.card, { borderColor: C.yellow }]}>
              <Text style={st.cardTitle}>🍎 iOS NOTE</Text>
              <Text style={{ color: C.yellow, fontSize: 12, lineHeight: 18 }}>
                iOS does not allow apps to send SMS silently.{'\n\n'}
                When you tap Start, for each contact the app opens the Messages app with the number and message pre-filled.{'\n\n'}
                You need to tap the <Text style={{ fontWeight: '700' }}>Send button</Text> in Messages for each one.{'\n\n'}
                For fully automatic SMS without tapping, use an Android device.
              </Text>
            </View>
          )}
        </>
      )}

      {/* ── ABOUT ── */}
      {tab === 'About' && (
        <View style={st.card}>
          <Text style={st.cardTitle}>ℹ️ ABOUT</Text>
          <Text style={st.aboutLine}>App: Bulk SMS v2.1</Text>
          <Text style={st.aboutLine}>Mode: SMS Sim Based</Text>
          <Text style={st.aboutLine}>SMS: Direct SIM (Android) / Messages app (iOS)</Text>
          <Text style={st.aboutLine}>Daily limit: up to {DAILY_LIMIT} SMS/day</Text>
          <Text style={st.aboutLine}>No internet needed for SMS</Text>
          <Text style={st.aboutLine}>File formats: .xlsx, .xlsm, .xls, .csv</Text>

          <View style={[st.infoBox, { marginTop: 14 }]}>
            <Text style={st.infoTxt}>
              <Text style={{ fontWeight: '700', color: C.text }}>Dynamic columns:{'\n'}</Text>
              The header row is detected automatically (any report preamble above the
              table is skipped). Set your phone column under General → File Columns,
              and use any header as a {'{variable}'} in your template.
            </Text>
          </View>
        </View>
      )}

    </ScrollView>
  );
}

const st = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  content:     { padding: 14, gap: 12, paddingBottom: 30 },
  stabs:       { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 10,
                 padding: 4, borderWidth: 1, borderColor: C.border },
  stab:        { flex: 1, paddingVertical: 8, borderRadius: 7, alignItems: 'center' },
  stabActive:  { backgroundColor: C.accent },
  stabTxt:     { fontSize: 12, fontWeight: '700', color: C.muted },
  stabTxtActive: { color: C.white },
  card:        { backgroundColor: C.card, borderRadius: 12, padding: 14,
                 borderWidth: 1, borderColor: C.border },
  cardTitle:   { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: C.muted,
                 marginBottom: 12, textTransform: 'uppercase' },
  fg:          { marginBottom: 14 },
  label:       { fontSize: 11, fontWeight: '700', color: C.muted, marginBottom: 5, letterSpacing: 0.5 },
  inp:         { backgroundColor: C.surface, borderRadius: 7, borderWidth: 1,
                 borderColor: C.border, padding: 10, color: C.text, fontSize: 13 },
  textarea:    { minHeight: 120, textAlignVertical: 'top', fontSize: 12, lineHeight: 18 },
  segRow:      { flexDirection: 'row', gap: 8 },
  seg:         { flex: 1, paddingVertical: 8, borderRadius: 7, alignItems: 'center',
                 borderWidth: 1, borderColor: C.border },
  segActive:   { backgroundColor: C.accent, borderColor: C.accent },
  segTxt:      { color: C.muted, fontWeight: '700', fontSize: 13 },
  segTxtActive:{ color: C.white },
  hintBox:     { backgroundColor: C.surface, borderRadius: 8, padding: 12,
                 marginBottom: 14, borderWidth: 1, borderColor: C.border },
  hintTxt:     { fontSize: 11, color: C.muted, lineHeight: 18 },
  chipWrap:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  varChip:     { backgroundColor: 'rgba(79,142,247,.12)', borderRadius: 6,
                 paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1,
                 borderColor: 'rgba(79,142,247,.3)' },
  varChipTxt:  { color: C.accent, fontSize: 11, fontWeight: '600' },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 10 },
  switchLabel: { fontSize: 13, fontWeight: '600', color: C.text },
  switchSub:   { fontSize: 11, color: C.muted, marginTop: 2 },
  btn:         { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8,
                 alignItems: 'center', justifyContent: 'center' },
  btnGhost:    { borderWidth: 1, borderColor: C.border },
  btnTxt:      { fontWeight: '700', fontSize: 13, color: C.white },
  infoBox:     { backgroundColor: 'rgba(79,142,247,.08)', borderRadius: 8, padding: 12,
                 borderWidth: 1, borderColor: 'rgba(79,142,247,.2)' },
  infoTxt:     { fontSize: 12, color: C.muted, lineHeight: 18 },
  aboutLine:   { fontSize: 13, color: C.text, paddingVertical: 5,
                 borderBottomWidth: 1, borderBottomColor: C.border },
});
