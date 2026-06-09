// src/screens/LogsScreen.js
import React, { useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Share, Alert,
} from 'react-native';
import { C } from '../utils/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FILTERS = ['all', 'success', 'error', 'warn', 'info'];
const COLOR = { success: C.green, error: C.red, warn: C.yellow, info: '#93c5fd' };

export default function LogsScreen({ logs, setLogs }) {
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? logs : logs.filter(l => l.type === filter);

  const exportLogs = async () => {
    const text = logs.map(l => `[${l.date || '----------'} ${l.time}] [${l.type.toUpperCase()}] ${l.msg}`).join('\n');
    await Share.share({ message: text, title: 'ChallanSMS Logs' });
  };

  const clearLogs = () => {
    Alert.alert('Clear Logs', 'Delete all log entries?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        setLogs([]);
        await AsyncStorage.removeItem('logs_v2');
      }},
    ]);
  };

  const counts = {
    success: logs.filter(l => l.type === 'success').length,
    error:   logs.filter(l => l.type === 'error').length,
    warn:    logs.filter(l => l.type === 'warn').length,
    info:    logs.filter(l => l.type === 'info').length,
  };

  return (
    <View style={s.root}>

      {/* Stats */}
      <View style={s.statRow}>
        {[
          { l: 'Total',   v: logs.length,      c: C.accent  },
          { l: 'Sent',    v: counts.success,    c: C.green   },
          { l: 'Errors',  v: counts.error,      c: C.red     },
          { l: 'Warnings',v: counts.warn,       c: C.yellow  },
        ].map(st => (
          <View key={st.l} style={s.statCard}>
            <Text style={[s.statNum, { color: st.c }]}>{st.v}</Text>
            <Text style={s.statLabel}>{st.l}</Text>
          </View>
        ))}
      </View>

      {/* Filter chips */}
      <View style={s.filters}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[s.filterChip, filter === f && s.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterTxt, filter === f && s.filterTxtActive]}>
              {f === 'all' ? `All (${logs.length})` : `${f} (${counts[f]||0})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Action buttons */}
      <View style={s.actions}>
        <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={exportLogs}>
          <Text style={[s.btnTxt, { color: C.muted }]}>⬆ Share / Export</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, { borderWidth: 1, borderColor: C.red, backgroundColor: 'rgba(239,68,68,.08)' }]} onPress={clearLogs}>
          <Text style={[s.btnTxt, { color: C.red }]}>🗑 Clear</Text>
        </TouchableOpacity>
      </View>

      {/* Log list */}
      {filtered.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📭</Text>
          <Text style={s.emptyTxt}>
            {logs.length === 0 ? 'No activity yet.\nStart sending to see logs here.' : 'No entries match this filter.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.id)}
          style={s.list}
          renderItem={({ item, index }) => {
            const prev = filtered[index - 1];
            const showDate = item.date && (!prev || prev.date !== item.date);
            return (
              <>
                {showDate && (
                  <View style={s.dateHeader}>
                    <Text style={s.dateHeaderTxt}>📅 {item.date}</Text>
                  </View>
                )}
                <View style={s.entry}>
                  <Text style={s.entryTime}>{item.time}</Text>
                  <Text style={[s.entryMsg, { color: COLOR[item.type] || C.muted }]}>
                    {item.msg}
                  </Text>
                </View>
              </>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.bg },
  statRow:        { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 0 },
  statCard:       { flex: 1, backgroundColor: C.card, borderRadius: 8, padding: 10,
                    alignItems: 'center', borderWidth: 1, borderColor: C.border },
  statNum:        { fontSize: 18, fontWeight: '800' },
  statLabel:      { fontSize: 9, color: C.muted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.8 },
  filters:        { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 6, flexWrap: 'wrap' },
  filterChip:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
                    borderWidth: 1, borderColor: C.border, backgroundColor: 'transparent' },
  filterChipActive:{ borderColor: C.accent, backgroundColor: 'rgba(79,142,247,.12)' },
  filterTxt:      { fontSize: 11, color: C.muted, fontWeight: '600' },
  filterTxtActive:{ color: C.accent },
  actions:        { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  btn:            { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  btnGhost:       { borderWidth: 1, borderColor: C.border },
  btnTxt:         { fontSize: 12, fontWeight: '700' },
  list:           { flex: 1, paddingHorizontal: 12 },
  dateHeader:     { paddingVertical: 6, paddingHorizontal: 10, marginTop: 8, marginBottom: 2,
                    backgroundColor: C.surface, borderRadius: 6, borderWidth: 1, borderColor: C.border },
  dateHeaderTxt:  { fontSize: 11, fontWeight: '800', color: C.accent, letterSpacing: 0.5 },
  entry:          { flexDirection: 'row', gap: 8, paddingVertical: 8,
                    borderBottomWidth: 1, borderBottomColor: 'rgba(37,45,66,.4)' },
  entryTime:      { fontSize: 10, color: C.muted, fontFamily: 'monospace',
                    width: 58, paddingTop: 1, flexShrink: 0 },
  entryMsg:       { flex: 1, fontSize: 12, lineHeight: 17 },
  sep:            { height: 1, backgroundColor: 'rgba(37,45,66,.4)' },
  empty:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon:      { fontSize: 48, marginBottom: 12 },
  emptyTxt:       { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 22 },
});
