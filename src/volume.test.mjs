import assert from 'node:assert/strict';
import { convertRange, longitudinalAccel, totalG, G0, targetVolume, dynamicG, smooth, convertSpeed, DEFAULT_SETTINGS as S } from './volume.js';

assert.equal(targetVolume(0, 0, S), 0.2);
assert.equal(targetVolume(100, 0, S), 1);
assert.equal(targetVolume(500, 0, S), 1);
assert.ok(Math.abs(targetVolume(50, 0, S) - 0.6) < 1e-9);
assert.ok(Math.abs(targetVolume(0, 0.6, S) - 0.4) < 1e-9); // g boost
assert.equal(targetVolume(100, 5, S), 1); // clamped
assert.ok(Math.abs(dynamicG({ x: 0, y: 0, z: 1 })) < 1e-9);
assert.ok(Math.abs(dynamicG({ x: 0, y: 0, z: 1.5 }) - 0.5) < 1e-9);
assert.equal(smooth(0, 1, 0.25), 0.25);
assert.ok(Math.abs(convertSpeed(10, 'kmh') - 36) < 1e-9);
assert.equal(longitudinalAccel(10, 13, 1), 3);
assert.equal(longitudinalAccel(13, 10, 0.5), -6);
assert.equal(longitudinalAccel(10, 13, 0), 0); // bad dt
assert.equal(longitudinalAccel(10, 13, 30), 0); // stale sample
assert.ok(Math.abs(totalG({ x: 0, y: G0, z: 0 }) - 1) < 1e-9);
assert.deepEqual(convertRange(0, 100, 'mph'), { minSpeed: 0, maxSpeed: 60 });
assert.deepEqual(convertRange(0, 60, 'kmh'), { minSpeed: 0, maxSpeed: 95 });
assert.deepEqual(convertRange(5, 6, 'mph'), { minSpeed: 5, maxSpeed: 10 }); // keeps a gap
console.log('all tests passed');
