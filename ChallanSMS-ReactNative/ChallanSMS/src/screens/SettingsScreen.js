// src/screens/SettingsScreen.js
import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Switch, Alert, Platform,
} from 'react-native';
import { C, DEFAULT_HINDI, DEFAULT_ENGLISH, DAILY_LIMIT } from '../utils/theme';
import { resetDailyCount } from '../utils/smsService';

const STABS = ['Templates', 'General', 'About'];

export default function SettingsScreen({ settings, saveSettings, addLog }) {
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
              Variables you can use:{'\n'}
              <Text style={{ color: C.accent }}>{'  {amount}'}</Text>        — Fine amount{'\n'}
              <Text style={{ color: C.accent }}>{'  {vehicle_number}'}</Text> — Vehicle reg no.{'\n'}
              <Text style={{ color: C.accent }}>{'  {challan_number}'}</Text> — Challan ID{'\n'}
              <Text style={{ color: C.accent }}>{'  {violator_name}'}</Text>  — Violator's name
            </Text>
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
            <Text style={st.cardTitle}>⚙️ SEND SETTINGS</Text>

            <View style={st.row}>
              <View style={{ flex: 1 }}>
                <Text style={st.switchLabel}>Country Code</Text>
                <Text style={st.switchSub}>India = 91 (added to 10-digit numbers)</Text>
              </View>
              <TextInput
                style={[st.inp, { width: 70, textAlign: 'center' }]}
                value={s.countryCode}
                onChangeText={v => update('countryCode', v)}
                keyboardType="numeric"
                maxLength={4}
              />
            </View>

            <View style={[st.row, { marginTop: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={st.switchLabel}>Delay Between Messages</Text>
                <Text style={st.switchSub}>Milliseconds. Recommended: 2000–5000ms</Text>
              </View>
              <TextInput
                style={[st.inp, { width: 80, textAlign: 'center' }]}
                value={String(s.delay)}
                onChangeText={v => update('delay', parseInt(v) || 3000)}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={st.card}>
            <Text style={st.cardTitle}>📅 DAILY LIMIT</Text>
            <View style={st.infoBox}>
              <Text style={st.infoTxt}>
                Maximum <Text style={{ color: C.yellow, fontWeight: '700' }}>200 SMS per day</Text> enforced automatically.{'\n'}
                This protects your SIM from being flagged as spam by the carrier.{'\n\n'}
                Counter resets automatically at midnight every day.
              </Text>
            </View>

            <View style={[st.row, { marginTop: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={st.switchLabel}>Custom Daily Limit</Text>
                <Text style={st.switchSub}>Max allowed: {DAILY_LIMIT}</Text>
              </View>
              <TextInput
                style={[st.inp, { width: 80, textAlign: 'center' }]}
                value={String(s.dailyLimit || DAILY_LIMIT)}
                onChangeText={v => update('dailyLimit', Math.min(parseInt(v)||200, DAILY_LIMIT))}
                keyboardType="numeric"
              />
            </View>

            <TouchableOpacity
              style={[st.btn, { backgroundColor: 'rgba(239,68,68,.15)', borderWidth: 1, borderColor: C.red, marginTop: 12 }]}
              onPress={handleResetDaily}
            >
              <Text style={[st.btnTxt, { color: C.red }]}>🔄 Reset Today's Counter (Testing Only)</Text>
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
          <Text style={st.aboutLine}>App: ChallanSMS v2.0</Text>
          <Text style={st.aboutLine}>For: UP Traffic Department</Text>
          <Text style={st.aboutLine}>SMS: Direct SIM (Android) / Messages app (iOS)</Text>
          <Text style={st.aboutLine}>Daily limit: 200 SMS/day</Text>
          <Text style={st.aboutLine}>No internet needed for SMS</Text>
          <Text style={st.aboutLine}>File formats: .xlsx, .xlsm, .csv</Text>

          <View style={[st.infoBox, { marginTop: 14 }]}>
            <Text style={st.infoTxt}>
              <Text style={{ fontWeight: '700', color: C.text }}>Required Excel columns:{'\n'}</Text>
              • Violator Contact (mobile number){'\n'}
              • Vehicle Number{'\n'}
              • Amount (Rs.){'\n'}
              • Challan Number{'\n'}
              • Violator Name{'\n'}
              • RTO/Office
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
