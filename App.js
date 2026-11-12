import { useEffect, useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { useKeepAwake } from 'expo-keep-awake';
import {
  DEFAULT_SETTINGS, clamp, convertSpeed, dynamicG, smooth, targetVolume,
} from './src/volume';

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
  const [speed, setSpeed] = useState(0); // m/s
  const [g, setG] = useState(0);
  const [volume, setVolume] = useState(DEFAULT_SETTINGS.minVolume);
  const [track, setTrack] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(null);

  const player = useRef(null);
  const live = useRef({ speed: 0, g: 0, settings, volume: DEFAULT_SETTINGS.minVolume });
  live.current.settings = settings;

  // Sensors: GPS speed + accelerometer g-force.
  useEffect(() => {
    let locSub; let accSub; let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setError('Location permission is needed to read your speed.'); return; }
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 500, distanceInterval: 0 },
        (loc) => {
          const v = loc.coords.speed; // m/s, negative when unknown
          live.current.speed = v != null && v > 0 ? v : 0;
        },
        (e) => setError(String(e)),
      );
      if (cancelled) sub.remove(); else locSub = sub;
    })();
    Accelerometer.setUpdateInterval(100);
    accSub = Accelerometer.addListener((a) => { live.current.g = dynamicG(a); });
    return () => { cancelled = true; locSub?.remove(); accSub?.remove(); };
  }, []);

  // Control loop: ~10 Hz, smooths the volume and applies it to the player.
  useEffect(() => {
    const id = setInterval(() => {
      const L = live.current;
      const unitSpeed = convertSpeed(L.speed, L.settings.unit);
      const target = targetVolume(unitSpeed, L.g, L.settings);
      L.volume = smooth(L.volume, target, 0.2);
      if (player.current) player.current.volume = L.volume;
      setSpeed(L.speed); setG(L.g); setVolume(L.volume);
    }, 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => player.current?.remove?.(), []);

  async function pickTrack() {
    const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (res.canceled) return;
    const file = res.assets[0];
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true });
    player.current?.remove?.();
    const p = createAudioPlayer({ uri: file.uri });
    p.loop = true;
    p.volume = live.current.volume;
    player.current = p;
    setTrack(file.name);
    p.play();
    setPlaying(true);
  }

  function togglePlay() {
    const p = player.current;
    if (!p) return;
    if (playing) p.pause(); else p.play();
    setPlaying(!playing);
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
          <View style={s.card}><Text style={s.cardLabel}>VOLUME</Text><Text style={s.cardValue}>{pct(volume)}</Text></View>
        </View>
        <View style={s.bar}><View style={[s.barFill, { width: pct(volume) }]} /></View>

        {error && <Text style={s.error}>{error}</Text>}

        <View style={s.cards}>
          <Pressable style={[s.big, { flex: 2 }]} onPress={pickTrack}>
            <Text style={s.bigText} numberOfLines={1}>{track ?? 'Choose a song'}</Text>
          </Pressable>
          <Pressable style={[s.big, !track && s.disabled]} onPress={togglePlay} disabled={!track}>
            <Text style={s.bigText}>{playing ? 'Pause' : 'Play'}</Text>
          </Pressable>
        </View>

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
  big: { flex: 1, backgroundColor: '#4f8cff', borderRadius: 14, padding: 16, alignItems: 'center', justifyContent: 'center' },
  bigText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  section: { color: '#8b93a7', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', marginTop: 20, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#161a23', borderRadius: 12, padding: 12, marginBottom: 8 },
  rowLabel: { color: '#fff', fontSize: 16, flex: 1 },
  rowValue: { color: '#fff', fontSize: 16, minWidth: 70, textAlign: 'center', fontVariant: ['tabular-nums'] },
  btn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#262c3a', alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 22 },
  hint: { color: '#8b93a7', fontSize: 13, marginTop: 8, lineHeight: 18 },
  error: { color: '#ff6b6b', marginBottom: 12 },
});
