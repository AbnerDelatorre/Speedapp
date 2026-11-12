// Pure volume-mapping logic (no React Native imports, so it is easy to test).

export const MS_TO_KMH = 3.6;
export const MS_TO_MPH = 2.2369362920544;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Convert m/s to the chosen unit ('kmh' | 'mph'). */
export function convertSpeed(ms, unit) {
  return ms * (unit === 'mph' ? MS_TO_MPH : MS_TO_KMH);
}

/** Dynamic g-force: how far total acceleration is from resting 1 g. */
export function dynamicG({ x, y, z }) {
  return Math.abs(Math.sqrt(x * x + y * y + z * z) - 1);
}

export const G0 = 9.80665; // m/s^2 per g

/** Forward acceleration (m/s^2) from two GPS speed samples; + speeding up, - braking. */
export function longitudinalAccel(prevSpeed, speed, dtSec) {
  if (!(dtSec > 0.05) || dtSec > 5) return 0;
  return (speed - prevSpeed) / dtSec;
}

/** Total g from gravity-free acceleration (m/s^2). */
export function totalG({ x, y, z }) {
  return Math.sqrt(x * x + y * y + z * z) / G0;
}

/**
 * Target volume (0..1) for a speed and g-force.
 * - Speed at/below `minSpeed` -> `minVolume`; at/above `maxSpeed` -> `maxVolume`.
 * - Between them the volume rises linearly.
 * - Hard accel/braking/cornering adds up to `gBoost` on top (full effect at `gFull` g).
 */
export function targetVolume(speed, g, s) {
  const span = Math.max(0.0001, s.maxSpeed - s.minSpeed);
  const t = clamp((speed - s.minSpeed) / span, 0, 1);
  const base = s.minVolume + t * (s.maxVolume - s.minVolume);
  const boost = s.gBoost * clamp(g / s.gFull, 0, 1);
  return clamp(base + boost, 0, 1);
}

/** Exponential smoothing so volume glides instead of jumping. */
export function smooth(prev, next, alpha) {
  return prev + (next - prev) * alpha;
}

export const DEFAULT_SETTINGS = {
  unit: 'kmh',
  minSpeed: 0, // in chosen unit
  maxSpeed: 100,
  minVolume: 0.2,
  maxVolume: 1,
  gBoost: 0.2,
  gFull: 0.6,
};
