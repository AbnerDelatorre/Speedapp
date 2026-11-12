import { memo, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { DEFAULT_SETTINGS, G0, clamp, convertRange, convertSpeed } from './src/volume';
import { cleanupStale, resetPeak, start, state, stop } from './src/engine';

// Palette: late-90s Japanese sports car cabin at night, taped on VHS.
// Black gauge faces, warm white print, amber illumination, orange needles, green VFD.
const C = {
  bg: '#0a0907',       // cabin black, slightly warm
  panel: '#15130f',    // dash plastic
  face: '#050505',     // gauge face
  bezel: '#2b2823',
  line: '#35312a',
  dim: '#8a8172',
  print: '#efe6d2',    // warm white gauge print
  amber: '#ff9a1f',    // illumination
  needle: '#ff4a12',   // orange-red needle
  red: '#e0261b',      // redline / start button
  vfd: '#43f5c0',      // vacuum fluorescent display green
  tape: '#f4f1e8',     // camcorder OSD white
};
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
const UNIT_LABEL = { kmh: 'km/h', mph: 'MPH' };
const SWEEP = 270; // degrees, like a real speedo
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Analog gauge drawn with plain views: ticks, numbers, amber band, redline and a needle. */
function Gauge({ size, value, max, major, minor, title, unit, band, redFrom, readout }) {
  const angle = (v) => -SWEEP / 2 + SWEEP * clamp(v / max, 0, 1);
  const c = size / 2;
  const big = size > 200;
  const ticks = [];
  for (let v = 0; v <= max + 0.001; v += minor) ticks.push(Math.round(v * 100) / 100);
  const isMajor = (v) => Math.abs(v / major - Math.round(v / major)) < 0.001;
  const tickColor = (v) => (redFrom != null && v >= redFrom ? C.red
    : band && v >= band[0] && v <= band[1] ? C.amber : C.print);
  const labelR = c - (big ? 44 : 25);

  return (
    <View style={[s.bezel, { width: size + 12, height: size + 12, borderRadius: (size + 12) / 2 }]}>
      <View style={[s.face, { width: size, height: size, borderRadius: c }]}>
        {ticks.map((v) => (
          <View key={v} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${angle(v)}deg` }], paddingTop: 7 }]}>
            <View style={{ alignSelf: 'center', width: isMajor(v) ? 3 : 1.5, height: isMajor(v) ? (big ? 16 : 10) : (big ? 9 : 6), backgroundColor: tickColor(v) }} />
          </View>
        ))}
        {ticks.filter(isMajor).map((v) => {
          const r = (angle(v) * Math.PI) / 180;
          return (
            <Text key={`n${v}`} style={[s.gaugeNum, { fontSize: big ? 17 : 10, color: tickColor(v), left: c + labelR * Math.sin(r) - 22, top: c - labelR * Math.cos(r) - (big ? 11 : 7) }]}>
              {v}
            </Text>
          );
        })}
        {big && <Text style={[s.gaugeTitle, { top: c * 0.56, fontSize: 11 }]}>{title}</Text>}
        <Text style={[s.gaugeUnit, { top: c * (big ? 0.68 : 0.6), fontSize: big ? 13 : 8 }]}>{big ? unit : `${title} ${unit}`}</Text>
        <View style={[s.lcd, { bottom: size * (big ? 0.14 : 0.12) }]}>
          <Text style={[s.lcdText, { fontSize: big ? 22 : 13 }]}>{readout}</Text>
        </View>
        <View style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${angle(value)}deg` }] }]}>
          <View style={[s.needle, { marginTop: size * 0.09, height: size * 0.41, width: big ? 4 : 3 }]} />
        </View>
        <View style={[s.hub, { width: size * 0.16, height: size * 0.16, borderRadius: size * 0.08, left: c - size * 0.08, top: c - size * 0.08 }]} />
      </View>
    </View>
  );
}

/** G-ball: dot moves with sideways g (left/right) and acceleration/braking (up/down). Rings at 0.5 and 1.0 g. */
function GBall({ size, lat, long }) {
  const c = size / 2;
  const r = c - 8; // 1.0 g radius
  const mag = Math.hypot(lat, long);
  const k = mag > 1 ? 1 / mag : 1;
  const dot = 12;
  return (
    <View style={[s.bezel, { width: size + 12, height: size + 12, borderRadius: (size + 12) / 2 }]}>
      <View style={[s.face, { width: size, height: size, borderRadius: c }]}>
        <View style={[s.ring, { width: r * 2, height: r * 2, borderRadius: r, left: c - r, top: c - r }]} />
        <View style={[s.ring, { width: r, height: r, borderRadius: r / 2, left: c - r / 2, top: c - r / 2 }]} />
        <View style={[s.cross, { left: c - 0.5, top: 8, width: 1, height: size - 16 }]} />
        <View style={[s.cross, { top: c - 0.5, left: 8, height: 1, width: size - 16 }]} />
        <Text style={[s.ballTag, { top: 10, alignSelf: 'center' }]}>ACC</Text>
        <Text style={[s.ballTag, { bottom: 10, alignSelf: 'center' }]}>BRK</Text>
        <View style={[s.ballDot, { width: dot, height: dot, borderRadius: dot / 2, left: c + lat * k * r - dot / 2, top: c - long * k * r - dot / 2 }]} />
      </View>
    </View>
  );
}

// Static, so memoized: the dash re-renders ~7x a second and must not rebuild 240 views each time.
const Scanlines = memo(function Scanlines() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: 240 }, (_, i) => <View key={i} style={s.scan} />)}
    </View>
  );
});

/** Camcorder on-screen display + scanlines: the whole thing is "taped". */
function TapeOverlay({ running }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const h = now.getHours();
  const pad = (n) => String(n).padStart(2, '0');
  const blink = now.getSeconds() % 2 === 0;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Scanlines />
      <Text style={[s.osd, { top: 54, left: 18 }]}>{running ? `REC ${blink ? '●' : ' '}` : 'STBY ❙❙'}</Text>
      <Text style={[s.osd, { top: 54, right: 18 }]}>SP</Text>
      <Text style={[s.osd, s.osdStamp]}>
        {`${h < 12 ? 'AM' : 'PM'} ${pad(h % 12 || 12)}:${pad(now.getMinutes())}\n${MONTHS[now.getMonth()]}.${pad(now.getDate())} ${now.getFullYear()}`}
      </Text>
    </View>
  );
}

function Heading({ jp, en }) {
  return (
    <View style={s.heading}>
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
  const [m, setM] = useState({ accel: 0, latG: 0, peakG: 0 });
  const [volume, setVolume] = useState(DEFAULT_SETTINGS.minVolume);
  const [error, setError] = useState(null);

  const busy = useRef(false);

  useEffect(() => { state.settings = settings; }, [settings]);
  useEffect(() => { cleanupStale(); }, []);

  // Refresh the on-screen numbers (the engine itself runs in src/engine.js).
  useEffect(() => {
    const id = setInterval(() => { setSpeed(state.speed); setG(state.g); setVolume(state.volume);
      setM({ accel: state.accel, latG: state.latG, peakG: state.peakG }); }, 150);
    return () => clearInterval(id);
  }, []);

  async function toggle() {
    if (busy.current) return; // ignore double taps while starting/stopping
    busy.current = true;
    setError(null);
    try {
      if (running) { await stop(); setRunning(false); }
      else { await start(); setRunning(true); }
    } catch (e) {
      await stop().catch(() => {}); // don't leave sensors half-started
      setRunning(false);
      setError(String(e.message ?? e));
    } finally { busy.current = false; }
  }

  const set = (k) => (v) => setSettings((p) => ({ ...p, [k]: v }));
  const switchUnit = () => setSettings((p) => {
    const to = p.unit === 'kmh' ? 'mph' : 'kmh';
    return { ...p, unit: to, ...convertRange(p.minSpeed, p.maxSpeed, to) };
  });
  const unit = settings.unit;
  const shownSpeed = convertSpeed(speed, unit);
  const kmh = unit === 'kmh';
  const signed = (v, d) => `${v < 0 ? '-' : '+'}${Math.abs(v).toFixed(d)}`;
  const pct = (v) => `${Math.round(v * 100)}%`;

  return (
    <View style={s.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.wrap}>
        <View style={s.topBar}>
          <Text style={s.brand}>SPEEDAPP</Text>
          <Text style={s.brandJp}>スピードアップ ・ 湾岸仕様</Text>
        </View>

        <View style={s.cluster}>
          <Gauge
            size={300} value={shownSpeed} max={kmh ? 180 : 120} major={20} minor={kmh ? 10 : 5}
            title="SPEED" unit={UNIT_LABEL[unit]} band={[settings.minSpeed, settings.maxSpeed]}
            readout={String(Math.round(shownSpeed)).padStart(3, '0')}
          />
          <View style={s.subRow}>
            <Gauge
              size={132} value={volume * 100} max={100} major={20} minor={10}
              title="VOLUME" unit="%" redFrom={90} readout={String(Math.round(volume * 100)).padStart(3, '0')}
            />
            <View style={s.vfd}>
              <Text style={s.vfdLabel}>G-SENSOR</Text>
              <Text style={s.vfdValue}>{g.toFixed(2)}</Text>
              <View style={s.vfdBar}>
                {Array.from({ length: 12 }, (_, i) => (
                  <View key={i} style={[s.vfdSeg, { opacity: i < Math.round(clamp(g / settings.gFull, 0, 1) * 12) ? 1 : 0.15 }]} />
                ))}
              </View>
              <Text style={s.vfdLabel}>{running ? 'ACTIVE' : 'STANDBY'}</Text>
            </View>
          </View>
          <View style={s.subRow}>
            <Pressable onPress={resetPeak}>
              <GBall size={132} lat={m.latG} long={m.accel / G0} />
            </Pressable>
            <View style={s.vfd}>
              <Text style={s.vfdLabel}>ACCEL m/s²</Text>
              <Text style={s.vfdValue}>{signed(m.accel, 1)}</Text>
              <Text style={s.vfdLine}>LONG {signed(m.accel / G0, 2)} G</Text>
              <Text style={s.vfdLine}>LAT  {signed(m.latG, 2)} G</Text>
              <Text style={s.vfdLine}>PEAK  {m.peakG.toFixed(2)} G</Text>
            </View>
          </View>
        </View>

        {error && <Text style={s.error}>! {error}</Text>}

        <Pressable style={s.startRing} onPress={toggle}>
          <View style={[s.startBtn, running && s.startBtnOn]}>
            <Text style={s.startSmall}>ENGINE</Text>
            <Text style={s.startText}>{running ? 'STOP' : 'START'}</Text>
          </View>
        </Pressable>

        <Heading jp="速度" en="SPEED RANGE" />
        <Pressable style={s.row} onPress={switchUnit}>
          <Text style={s.rowLabel}>UNITS</Text>
          <Text style={[s.rowValue, { minWidth: 120 }]}>{UNIT_LABEL[unit]} ⇄</Text>
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
          Amber marks on the speedo show your speed range. The G-ball shows cornering (left/right) and acceleration/braking (up/down); tap it to reset the peak. Mount the phone upright facing you for correct left/right. Volume rises across it; hard braking, acceleration or cornering adds a boost.
        </Text>
      </ScrollView>
      <TapeOverlay running={running} />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  wrap: { padding: 18, paddingTop: 88, paddingBottom: 110 },
  scan: { height: 1, marginBottom: 3, backgroundColor: '#000', opacity: 0.2 },
  osd: { position: 'absolute', color: C.tape, fontFamily: MONO, fontSize: 15, fontWeight: '700', letterSpacing: 1, opacity: 0.85, textShadowColor: '#000', textShadowRadius: 2, textShadowOffset: { width: 1, height: 1 } },

  osdStamp: { bottom: 24, left: 12, backgroundColor: 'rgba(10,9,7,0.88)', paddingHorizontal: 6, paddingVertical: 3 },

  topBar: { alignItems: 'center', marginBottom: 14 },
  brand: { color: C.print, fontSize: 30, fontWeight: '900', fontStyle: 'italic', letterSpacing: 4, textShadowColor: C.red, textShadowRadius: 0, textShadowOffset: { width: 3, height: 2 } },
  brandJp: { color: C.amber, fontSize: 11, letterSpacing: 4, marginTop: 4 },

  cluster: { backgroundColor: C.panel, borderRadius: 26, borderWidth: 1, borderColor: C.line, paddingVertical: 16, alignItems: 'center', marginBottom: 16 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14 },
  bezel: { backgroundColor: C.bezel, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#000' },
  face: { backgroundColor: C.face, overflow: 'hidden' },
  gaugeNum: { position: 'absolute', width: 44, textAlign: 'center', fontWeight: '800', fontStyle: 'italic' },
  gaugeTitle: { position: 'absolute', alignSelf: 'center', color: C.dim, letterSpacing: 3, fontWeight: '700' },
  gaugeUnit: { position: 'absolute', alignSelf: 'center', color: C.print, fontStyle: 'italic', fontWeight: '700' },
  lcd: { position: 'absolute', alignSelf: 'center', backgroundColor: '#120b03', borderWidth: 1, borderColor: C.line, paddingHorizontal: 8, paddingVertical: 1 },
  lcdText: { color: C.amber, fontFamily: MONO, fontWeight: '700', fontVariant: ['tabular-nums'], textShadowColor: C.amber, textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 } },
  needle: { alignSelf: 'center', backgroundColor: C.needle, borderRadius: 2, shadowColor: C.needle, shadowOpacity: 0.9, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
  hub: { position: 'absolute', backgroundColor: '#1b1916', borderWidth: 2, borderColor: '#000' },

  vfd: { width: 150, backgroundColor: '#03110d', borderWidth: 2, borderColor: C.bezel, borderRadius: 6, padding: 10 },
  vfdLabel: { color: C.vfd, fontFamily: MONO, fontSize: 9, letterSpacing: 2, opacity: 0.8 },
  vfdValue: { color: C.vfd, fontFamily: MONO, fontSize: 34, fontWeight: '700', fontVariant: ['tabular-nums'], textShadowColor: C.vfd, textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 } },
  vfdLine: { color: C.vfd, fontFamily: MONO, fontSize: 12, letterSpacing: 1, marginTop: 2, fontVariant: ['tabular-nums'] },
  ring: { position: 'absolute', borderWidth: 1, borderColor: C.dim, opacity: 0.6 },
  cross: { position: 'absolute', backgroundColor: C.dim, opacity: 0.4 },
  ballTag: { position: 'absolute', color: C.dim, fontSize: 8, fontWeight: '700', letterSpacing: 1 },
  ballDot: { position: 'absolute', backgroundColor: C.needle, shadowColor: C.needle, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  vfdBar: { flexDirection: 'row', gap: 2, height: 10, marginVertical: 6 },
  vfdSeg: { flex: 1, backgroundColor: C.vfd },

  startRing: { alignSelf: 'center', width: 124, height: 124, borderRadius: 62, backgroundColor: '#b9b4a8', alignItems: 'center', justifyContent: 'center', marginBottom: 6, borderWidth: 2, borderColor: '#5c584f' },
  startBtn: { width: 104, height: 104, borderRadius: 52, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#7d120c' },
  startBtnOn: { backgroundColor: '#8f140d', shadowColor: C.red, shadowOpacity: 1, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } },
  startSmall: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  startText: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 2 },

  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 8 },
  headingJp: { color: C.bg, backgroundColor: C.amber, fontSize: 13, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 1 },
  headingEn: { color: C.print, fontSize: 13, fontWeight: '800', fontStyle: 'italic', letterSpacing: 2 },
  headingRule: { flex: 1, height: 1, backgroundColor: C.line },

  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 4, padding: 10, marginBottom: 6 },
  rowLabel: { color: C.print, fontSize: 13, fontWeight: '700', letterSpacing: 1, flex: 1 },
  rowValue: { color: C.amber, fontFamily: MONO, fontSize: 16, fontWeight: '700', minWidth: 76, textAlign: 'center', fontVariant: ['tabular-nums'] },
  btn: { width: 44, height: 44, borderRadius: 6, backgroundColor: '#24211c', borderWidth: 1, borderColor: '#000', borderTopColor: '#4a453c', alignItems: 'center', justifyContent: 'center' },
  btnText: { color: C.amber, fontSize: 22, fontWeight: '700' },

  hint: { color: C.dim, fontSize: 12, marginTop: 12, lineHeight: 18 },
  error: { color: C.red, fontFamily: MONO, marginBottom: 10, textAlign: 'center' },
});
