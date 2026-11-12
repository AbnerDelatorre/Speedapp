import { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { DEFAULT_SETTINGS, clamp, convertSpeed } from './src/volume';
import { start, state, stop } from './src/engine';

const UNIT_LABEL = { kmh: 'km/h', mph: 'mph' };

function Stepper({ label, value, step, min, max, format, onChange }) {
  const set = (v) => onChange(clamp(Math.round(v * 100) / 100, min, max));
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Pressable style={s.btn} onPress={() => set(value - step)}><Text style={s.btnText}>−</Text></Pressable>
      <Text style={s.rowValue}>{format ? format(value) : value}</Text>
      <Pressable style={s.btn} onPress={() => set(value + step)}><Text style={s.btnText}>+</Text></Pressable>
    </View>
  );
}

export default function App() {
  useKeepAwake();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [g, setG] = useState(0);
  const [volume, setVolume] = useState(DEFAULT_SETTINGS.minVolume);
  const [error, setError] = useState(null);

  state.settings = settings;

  // Refresh the on-screen numbers (the engine itself runs in src/engine.js).
  useEffect(() => {
    const id = setInterval(() => { setSpeed(state.speed); setG(state.g); setVolume(state.volume); }, 150);
    return () => clearInterval(id);
  }, []);

  async function toggle() {
    setError(null);
    try {
      if (running) { await stop(); setRunning(false); }
      else { await start(); setRunning(true); }
    } catch (e) { setError(String(e.message ?? e)); }
  }

  const set = (k) => (v) => setSettings((p) => ({ ...p, [k]: v }));
  const unit = settings.unit;
  const shownSpeed = convertSpeed(speed, unit);
  const pct = (v) => `${Math.round(v * 100)}%`;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.wrap}>
        <Text style={s.speed}>{Math.round(shownSpeed)}</Text>
        <Text style={s.unit}>{UNIT_LABEL[unit]}</Text>

        <View style={s.cards}>
          <View style={s.card}><Text style={s.cardLabel}>G-FORCE</Text><Text style={s.cardValue}>{g.toFixed(2)} g</Text></View>
          <View style={s.card}><Text style={s.cardLabel}>PHONE VOLUME</Text><Text style={s.cardValue}>{pct(volume)}</Text></View>
        </View>
        <View style={s.bar}><View style={[s.barFill, { width: pct(volume) }]} /></View>

        {error && <Text style={s.error}>{error}</Text>}

        <Pressable style={[s.big, running && s.stop]} onPress={toggle}>
          <Text style={s.bigText}>{running ? 'Stop controlling volume' : 'Start'}</Text>
        </Pressable>

        <Text style={s.section}>Speed range</Text>
        <Pressable style={s.row} onPress={() => set('unit')(unit === 'kmh' ? 'mph' : 'kmh')}>
          <Text style={s.rowLabel}>Units</Text>
          <Text style={s.rowValue}>{UNIT_LABEL[unit]} (tap to switch)</Text>
        </Pressable>
        <Stepper label="Quiet at" value={settings.minSpeed} step={5} min={0} max={settings.maxSpeed - 5} onChange={set('minSpeed')} />
        <Stepper label="Loudest at" value={settings.maxSpeed} step={5} min={settings.minSpeed + 5} max={300} onChange={set('maxSpeed')} />

        <Text style={s.section}>Volume range</Text>
        <Stepper label="Min volume" value={settings.minVolume} step={0.05} min={0} max={settings.maxVolume} format={pct} onChange={set('minVolume')} />
        <Stepper label="Max volume" value={settings.maxVolume} step={0.05} min={settings.minVolume} max={1} format={pct} onChange={set('maxVolume')} />

        <Text style={s.section}>G-force boost</Text>
        <Stepper label="Boost amount" value={settings.gBoost} step={0.05} min={0} max={0.5} format={pct} onChange={set('gBoost')} />
        <Stepper label="Full boost at" value={settings.gFull} step={0.1} min={0.1} max={2} format={(v) => `${v.toFixed(1)} g`} onChange={set('gFull')} />
        <Text style={s.hint}>
          Volume rises with speed between the two limits. Hard braking, acceleration or cornering adds a boost on top.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0d12' },
  wrap: { padding: 20, paddingBottom: 60 },
  speed: { color: '#fff', fontSize: 120, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  unit: { color: '#8b93a7', fontSize: 20, textAlign: 'center', marginBottom: 16 },
  cards: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: { flex: 1, backgroundColor: '#161a23', borderRadius: 16, padding: 16 },
  cardLabel: { color: '#8b93a7', fontSize: 12, letterSpacing: 1 },
  cardValue: { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: 4 },
  bar: { height: 10, backgroundColor: '#161a23', borderRadius: 5, overflow: 'hidden', marginBottom: 20 },
  barFill: { height: '100%', backgroundColor: '#4f8cff' },
  big: { marginBottom: 12, backgroundColor: '#4f8cff', borderRadius: 14, padding: 16, alignItems: 'center', justifyContent: 'center' },
  bigText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  stop: { backgroundColor: '#d9534f' },
  section: { color: '#8b93a7', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', marginTop: 20, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#161a23', borderRadius: 12, padding: 12, marginBottom: 8 },
  rowLabel: { color: '#fff', fontSize: 16, flex: 1 },
  rowValue: { color: '#fff', fontSize: 16, minWidth: 70, textAlign: 'center', fontVariant: ['tabular-nums'] },
  btn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#262c3a', alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 22 },
  hint: { color: '#8b93a7', fontSize: 13, marginTop: 8, lineHeight: 18 },
  error: { color: '#ff6b6b', marginBottom: 12 },
});
