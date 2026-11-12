// Shared engine: lives at module level so the background location task and the UI share state.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Accelerometer, DeviceMotion } from 'expo-sensors';
import { VolumeManager } from 'react-native-volume-manager';
import {
  DEFAULT_SETTINGS, G0, convertSpeed, dynamicG, longitudinalAccel, smooth, targetVolume, totalG,
} from './volume';

const TASK = 'speedapp-location';

export const state = {
  running: false,
  speed: 0, // m/s
  g: 0, // total dynamic g (any direction)
  accel: 0, // forward acceleration from GPS, m/s^2 (+ accelerating, - braking)
  latG: 0, // sideways g (+ right), assumes the phone is mounted upright facing you
  peakG: 0,
  lastFix: 0,
  hasMotion: false,
  volume: DEFAULT_SETTINGS.minVolume,
  settings: { ...DEFAULT_SETTINGS },
  lastSet: -1,
  lastTick: 0,
};

/** Recompute the target volume and apply it to the system volume. Safe to call often. */
export function tick() {
  if (!state.running) return;
  const now = Date.now();
  if (now - state.lastTick < 150) return;
  state.lastTick = now;
  const target = targetVolume(convertSpeed(state.speed, state.settings.unit), state.g, state.settings);
  state.volume = smooth(state.volume, target, 0.25);
  if (Math.abs(state.volume - state.lastSet) >= 0.01) {
    state.lastSet = state.volume;
    VolumeManager.setVolume(state.volume, { showUI: false }).catch(() => {});
  }
}

// Must be defined at import time (top level) so iOS can run it in the background.
TaskManager.defineTask(TASK, ({ data, error }) => {
  if (error || !data) return;
  const locs = data.locations;
  const last = locs && locs[locs.length - 1];
  if (last) {
    const v = last.coords.speed;
    const speed = v != null && v > 0 ? v : 0;
    const t = last.timestamp;
    if (state.lastFix) {
      state.accel = smooth(state.accel, longitudinalAccel(state.speed, speed, (t - state.lastFix) / 1000), 0.5);
    }
    state.lastFix = t;
    state.speed = speed;
    tick();
  }
});

let accSub = null;
let motionSub = null;
let timer = null;

export async function start() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') throw new Error('Location permission is needed to read your speed.');
  // "Always" lets tracking continue with the screen locked; ignore if denied (falls back to while-in-use).
  await Location.requestBackgroundPermissionsAsync().catch(() => {});

  await VolumeManager.showNativeVolumeUI({ enabled: false }).catch(() => {});
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    activityType: Location.ActivityType.AutomotiveNavigation,
    timeInterval: 500,
    distanceInterval: 0,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
  });

  Accelerometer.setUpdateInterval(100);
  // Fallback g reading; replaced by gravity-free DeviceMotion data when available.
  accSub = Accelerometer.addListener((a) => {
    if (!state.hasMotion) { state.g = dynamicG(a); state.peakG = Math.max(state.peakG, state.g); }
    tick();
  });
  DeviceMotion.setUpdateInterval(100);
  motionSub = DeviceMotion.addListener((m) => {
    const a = m.acceleration;
    if (!a) return;
    state.hasMotion = true;
    state.g = smooth(state.g, totalG(a), 0.4);
    state.latG = smooth(state.latG, a.x / G0, 0.4);
    state.peakG = Math.max(state.peakG, state.g);
  });
  timer = setInterval(tick, 200);
  state.running = true;
}

export async function stop() {
  state.running = false;
  accSub?.remove(); accSub = null;
  motionSub?.remove(); motionSub = null;
  if (timer) clearInterval(timer); timer = null;
  if (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(TASK);
  }
  state.speed = 0; state.g = 0; state.accel = 0; state.latG = 0; state.lastFix = 0; state.hasMotion = false;
}

export function resetPeak() { state.peakG = 0; }
