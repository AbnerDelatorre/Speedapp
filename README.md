# Speedapp

Plays a song and adjusts its volume from your **GPS speed** and **g-force** (accelerometer).
Built with Expo, so you can run it on an iPhone without a Mac.

## Run it on your iPhone
1. Install **Expo Go** from the App Store.
2. `npm install && npx expo start`
3. Scan the QR code with the iPhone camera (use `npx expo start --tunnel` if your phone isn't on the same Wi-Fi).

## How it works
- Below the "Quiet at" speed, volume is the min volume; at "Loudest at" it is the max. It rises linearly in between.
- Hard braking, acceleration or cornering adds a g-force boost on top.
- Volume is smoothed so it glides rather than jumps.
- Logic lives in `src/volume.js` (`node src/volume.test.mjs` runs its tests).

## Limitation
iOS does not let apps change the volume of other apps (Spotify, Apple Music). Speedapp changes the volume
of the song **you load inside it**. Speed readings need GPS, so test outdoors or in a moving vehicle.
