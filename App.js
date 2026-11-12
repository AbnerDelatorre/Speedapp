import { useEffect, useState } from 'react';
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { DEFAULT_SETTINGS, clamp, convertSpeed } from './src/volume';
import { start, state, stop } from './src/engine';

// Palette: midnight expressway, sodium lamps and neon signage.
const C = {
  bg: '#07060d',
  panel: '#100e1c',
  line: '#2a2444',
  dim: '#6d668f',
  text: '#f2efff',
  pink: '#ff2e88',
  cyan: '#27e0ff',
  amber: '#ffb000',
  green: '#3dff8b',
  red: '#ff3b30',
};
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
const UNIT_LABEL = { kmh: 'KM/H', mph: 'MPH' };
const SEGMENTS = 28;

/** Rev-light style bar: green -> amber -> red, lit up to `value` (0..1). */
function SegmentBar({ value, tall }) {
  const lit = Math.round(clamp(value, 0, 1) * SEGMENTS);
  return (
    <View style={[s.segRow, tall && { height: 34 }]}>
      {Array.from({ length: SEGMENTS }, (_, i) => {
        const color = i >= SEGMENTS * 0.85 ? C.red : i >= SEGMENTS * 0.6 ? C.amber : C.green;
        const on = i < lit;
        return (
          <View
            key={i}
            style={[s.seg, { backgroundColor: on ? color : C.line, opacity: on ? 1 : 0.5 },
              on && { shadowColor: color, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }]}
          />
        );
      })}
    </View>
  );
}

/** Faint CRT scanlines over the whole screen. */
function Scanlines() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: 240 }, (_, i) => <View key={i} style={s.scan} />)}
    </View>
  );
}

function Heading({ jp, en }) {
  return (
    <View style={s.heading}>
      <View style={s.headingMark} />
      <Text style={s.headingJp}>{jp}</Text>
      <Text style={s.headingEn}>{en}</Text>
      <View style={s.headingRule} />
    </View>
  );
}

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
  const speedFrac = (shownSpeed - settings.minSpeed) / Math.max(1, settings.maxSpeed - settings.minSpeed);
  const pct = (v) => `${Math.round(v * 100)}%`;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.wrap}>
        <View style={s.topBar}>
          <Text style={s.brand}>SPEEDAPP<Text style={{ color: C.pink }}>//</Text></Text>
          <Text style={[s.status, running && s.statusOn]}>{running ? '● 走行中 RUNNING' : '○ 待機 STANDBY'}</Text>
        </View>

        <View style={s.dash}>
          <Text style={s.dashTag}>スピード</Text>
          <Text style={s.speed}>{String(Math.round(shownSpeed)).padStart(3, '0')}</Text>
          <Text style={s.unit}>{UNIT_LABEL[unit]}</Text>
          <SegmentBar value={speedFrac} tall />
          <View style={s.scale}>
            <Text style={s.scaleText}>{settings.minSpeed}</Text>
            <Text style={s.scaleText}>{settings.maxSpeed}</Text>
          </View>
        </View>

        <View style={s.cards}>
          <View style={s.card}>
            <Text style={s.cardLabel}>Gフォース</Text>
            <Text style={[s.cardValue, { color: C.cyan }]}>{g.toFixed(2)}<Text style={s.cardUnit}> G</Text></Text>
            <SegmentBar value={g / settings.gFull} />
          </View>
          <View style={s.card}>
            <Text style={s.cardLabel}>ボリューム</Text>
            <Text style={[s.cardValue, { color: C.amber }]}>{Math.round(volume * 100)}<Text style={s.cardUnit}> %</Text></Text>
            <SegmentBar value={volume} />
          </View>
        </View>

        {error && <Text style={s.error}>! {error}</Text>}

        <Pressable style={[s.big, running && s.bigStop]} onPress={toggle}>
          <Text style={s.bigJp}>{running ? 'ストップ' : 'スタート'}</Text>
          <Text style={s.bigText}>{running ? 'STOP' : 'START'}</Text>
        </Pressable>

        <Heading jp="速度" en="SPEED RANGE" />
        <Pressable style={s.row} onPress={() => set('unit')(unit === 'kmh' ? 'mph' : 'kmh')}>
          <Text style={s.rowLabel}>UNITS</Text>
          <Text style={[s.rowValue, { color: C.pink, minWidth: 120 }]}>{UNIT_LABEL[unit]} ⇄</Text>
        </Pressable>
        <Stepper label="QUIET AT" value={settings.minSpeed} step={5} min={0} max={settings.maxSpeed - 5} onChange={set('minSpeed')} />
        <Stepper label="LOUDEST AT" value={settings.maxSpeed} step={5} min={settings.minSpeed + 5} max={300} onChange={set('maxSpeed')} />

        <Heading jp="音量" en="VOLUME RANGE" />
        <Stepper label="MIN VOLUME" value={settings.minVolume} step={0.05} min={0} max={settings.maxVolume} format={pct} onChange={set('minVolume')} />
        <Stepper label="MAX VOLUME" value={settings.maxVolume} step={0.05} min={settings.minVolume} max={1} format={pct} onChange={set('maxVolume')} />

        <Heading jp="加速" en="G-FORCE BOOST" />
        <Stepper label="BOOST AMOUNT" value={settings.gBoost} step={0.05} min={0} max={0.5} format={pct} onChange={set('gBoost')} />
        <Stepper label="FULL BOOST AT" value={settings.gFull} step={0.1} min={0.1} max={2} format={(v) => `${v.toFixed(1)} G`} onChange={set('gFull')} />

        <Text style={s.hint}>
          Volume rises with speed between the two limits. Hard braking, acceleration or cornering adds a boost on top.
        </Text>
        <Text style={s.footer}>© SPEEDAPP TUNING — 首都高 MIDNIGHT SPEC</Text>
      </ScrollView>
      <Scanlines />
    </SafeAreaView>
  );
}

const glow = (color, r = 12) => ({ textShadowColor: color, textShadowRadius: r, textShadowOffset: { width: 0, height: 0 } });

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  wrap: { padding: 18, paddingBottom: 60 },
  scan: { height: 1, marginBottom: 3, backgroundColor: '#000', opacity: 0.22 },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  brand: { color: C.text, fontSize: 20, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2, ...glow(C.pink, 8) },
  status: { color: C.dim, fontFamily: MONO, fontSize: 11, letterSpacing: 1 },
  statusOn: { color: C.green, ...glow(C.green, 6) },

  dash: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderLeftWidth: 4, borderLeftColor: C.pink, padding: 16, marginBottom: 12 },
  dashTag: { color: C.pink, fontSize: 12, letterSpacing: 4 },
  speed: { color: C.text, fontFamily: MONO, fontSize: 112, fontWeight: '800', fontStyle: 'italic', textAlign: 'center', fontVariant: ['tabular-nums'], ...glow(C.cyan, 18) },
  unit: { color: C.cyan, fontFamily: MONO, fontSize: 16, letterSpacing: 6, textAlign: 'center', marginBottom: 14 },
  scale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  scaleText: { color: C.dim, fontFamily: MONO, fontSize: 11 },

  segRow: { flexDirection: 'row', gap: 3, height: 14 },
  seg: { flex: 1, transform: [{ skewX: '-14deg' }] },

  cards: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: { flex: 1, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, padding: 14 },
  cardLabel: { color: C.dim, fontSize: 11, letterSpacing: 3 },
  cardValue: { fontFamily: MONO, fontSize: 30, fontWeight: '800', fontStyle: 'italic', marginVertical: 6, fontVariant: ['tabular-nums'] },
  cardUnit: { fontSize: 14, color: C.dim },

  big: { backgroundColor: C.pink, paddingVertical: 14, alignItems: 'center', marginBottom: 6, transform: [{ skewX: '-6deg' }], shadowColor: C.pink, shadowOpacity: 0.8, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
  bigStop: { backgroundColor: C.red, shadowColor: C.red },
  bigJp: { color: '#fff', fontSize: 11, letterSpacing: 6, opacity: 0.85 },
  bigText: { color: '#fff', fontSize: 26, fontWeight: '900', fontStyle: 'italic', letterSpacing: 6 },

  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 8 },
  headingMark: { width: 10, height: 14, backgroundColor: C.amber, transform: [{ skewX: '-14deg' }] },
  headingJp: { color: C.amber, fontSize: 14, fontWeight: '700' },
  headingEn: { color: C.text, fontFamily: MONO, fontSize: 12, letterSpacing: 3 },
  headingRule: { flex: 1, height: 1, backgroundColor: C.line },

  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, padding: 10, marginBottom: 6 },
  rowLabel: { color: C.text, fontFamily: MONO, fontSize: 13, letterSpacing: 1, flex: 1 },
  rowValue: { color: C.cyan, fontFamily: MONO, fontSize: 16, fontWeight: '700', minWidth: 76, textAlign: 'center', fontVariant: ['tabular-nums'] },
  btn: { width: 44, height: 44, borderWidth: 1, borderColor: C.pink, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: C.pink, fontSize: 22, fontWeight: '700' },

  hint: { color: C.dim, fontSize: 12, marginTop: 12, lineHeight: 18 },
  footer: { color: C.line, fontFamily: MONO, fontSize: 10, letterSpacing: 2, textAlign: 'center', marginTop: 24 },
  error: { color: C.red, fontFamily: MONO, marginBottom: 10 },
});
