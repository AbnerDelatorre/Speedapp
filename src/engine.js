// Shared engine: lives at module level so the background location task and the UI share state.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Accelerometer } from 'expo-sensors';
import { VolumeManager } from 'react-native-volume-manager';
import { DEFAULT_SETTINGS, convertSpeed, dynamicG, smooth, targetVolume } from './volume';

const TASK = 'speedapp-location';

export const state = {
  running: false,
  speed: 0, // m/s
  g: 0,
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
    state.speed = v != null && v > 0 ? v : 0;
    tick();
  }
});

let accSub = null;
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
  accSub = Accelerometer.addListener((a) => { state.g = dynamicG(a); tick(); });
  timer = setInterval(tick, 200);
  state.running = true;
}

export async function stop() {
  state.running = false;
  accSub?.remove(); accSub = null;
  if (timer) clearInterval(timer); timer = null;
  if (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(TASK);
  }
  state.speed = 0; state.g = 0;
}
