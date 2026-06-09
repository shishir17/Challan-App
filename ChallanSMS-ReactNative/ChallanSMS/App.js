// App.js — Root with bottom tab navigation
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Platform, SafeAreaView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, DEFAULT_HINDI, DEFAULT_ENGLISH } from './src/utils/theme';
import SendScreen    from './src/screens/SendScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LogsScreen    from './src/screens/LogsScreen';

const TABS = [
  { key: 'send',     icon: '📤', label: 'Send'     },
  { key: 'settings', icon: '⚙️',  label: 'Settings' },
  { key: 'logs',     icon: '📋', label: 'Logs'     },
];

export default function App() {
  const [activeTab, setActiveTab]   = useState('send');
  const [rows, setRows]             = useState([]);
  const [fileName, setFileName]     = useState('');
  const [logs, setLogs]             = useState([]);
  const [rowStatus, setRowStatus]   = useState({});
  const [settings, setSettings]     = useState({
    lang:           'hindi',
    delay:          3000,
    hindiTemplate:  DEFAULT_HINDI,
    englishTemplate: DEFAULT_ENGLISH,
    countryCode:    '91',
    dailyLimit:     100,
    batchEnabled:   true,   // split sheet into daily batches & schedule them
    sortByAmount:   true,   // sort by Amount (Rs.) desc before batching
  });
  const [hasNewLog, setHasNewLog]   = useState(false);

  // Load saved settings on mount
  useEffect(() => {
    AsyncStorage.getItem('settings_v2').then(raw => {
      if (raw) setSettings(s => ({ ...s, ...JSON.parse(raw) }));
    });
    AsyncStorage.getItem('logs_v2').then(raw => {
      if (raw) setLogs(JSON.parse(raw));
    });
  }, []);

  const saveSettings = async (s) => {
    setSettings(s);
    await AsyncStorage.setItem('settings_v2', JSON.stringify(s));
  };

  const addLog = (msg, type = 'info') => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const entry = {
      id:   Date.now() + Math.random(),
      time: now.toLocaleTimeString('en-IN', { hour12: false }),
      date,
      msg,
      type,
    };
    setLogs(prev => {
      const next = [entry, ...prev].slice(0, 500);
      AsyncStorage.setItem('logs_v2', JSON.stringify(next));
      return next;
    });
    if (activeTab !== 'logs') setHasNewLog(true);
  };

  const switchTab = (key) => {
    setActiveTab(key);
    if (key === 'logs') setHasNewLog(false);
  };

  const sharedProps = {
    rows, setRows, fileName, setFileName,
    logs, setLogs, rowStatus, setRowStatus,
    settings, saveSettings, addLog,
  };

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Top bar */}
      <View style={s.topbar}>
        <Text style={s.logo}>🚦 <Text style={s.logoAcc}>Challan</Text>
          <Text style={s.logoMuted}>SMS</Text>
        </Text>
        <Text style={s.sub}>UP Traffic Dept · SIM Based</Text>
      </View>

      {/* Screen */}
      <View style={s.screen}>
        {activeTab === 'send'     && <SendScreen     {...sharedProps} />}
        {activeTab === 'settings' && <SettingsScreen {...sharedProps} />}
        {activeTab === 'logs'     && <LogsScreen     {...sharedProps} />}
      </View>

      {/* Bottom tabs */}
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tab, activeTab === t.key && s.tabActive]}
            onPress={() => switchTab(t.key)}
            activeOpacity={0.7}
          >
            <Text style={s.tabIcon}>{t.icon}</Text>
            <Text style={[s.tabLabel, activeTab === t.key && s.tabLabelActive]}>
              {t.label}
            </Text>
            {t.key === 'logs' && hasNewLog && <View style={s.dot} />}
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  topbar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 16, paddingVertical: 10,
                  backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  logo:         { fontSize: 18, fontWeight: '800' },
  logoAcc:      { color: C.accent },
  logoMuted:    { color: C.text, opacity: 0.5 },
  sub:          { fontSize: 10, color: C.muted },
  screen:       { flex: 1 },
  tabBar:       { flexDirection: 'row', backgroundColor: C.surface,
                  borderTopWidth: 1, borderTopColor: C.border,
                  paddingBottom: Platform.OS === 'ios' ? 16 : 4 },
  tab:          { flex: 1, alignItems: 'center', paddingVertical: 8, position: 'relative' },
  tabActive:    { borderTopWidth: 2, borderTopColor: C.accent },
  tabIcon:      { fontSize: 20 },
  tabLabel:     { fontSize: 10, color: C.muted, marginTop: 2, fontWeight: '600' },
  tabLabelActive: { color: C.accent },
  dot:          { position: 'absolute', top: 6, right: 20, width: 8, height: 8,
                  borderRadius: 4, backgroundColor: C.red },
});
