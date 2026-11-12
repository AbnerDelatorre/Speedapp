# Speedapp

Plays a song and adjusts its volume from your **GPS speed** and **g-force** (accelerometer).
Built with Expo, so you can run it on an iPhone without a Mac.

## What it does
Runs in the background and sets your iPhone's **system volume** from GPS speed and g-force, so it controls
whatever you are playing (Spotify, Apple Music, YouTube...). Open your music app, start playback, then tap Start.

## Install on iPhone without a Mac (free)
1. On GitHub: **Actions -> Build unsigned IPA -> Run workflow** (also runs on every push). Download the `Speedapp-ipa` artifact and unzip it.
2. On a PC/Mac install **Sideloadly** (or AltStore), plug in the iPhone, and sign `Speedapp.ipa` with your free Apple ID.
3. On the iPhone: Settings -> General -> VPN & Device Management -> trust your Apple ID. Enable Developer Mode if asked.
4. Free Apple IDs expire apps after 7 days; re-sign the same way. (Paid account: 1 year.)

Choose **Always** when asked for location access so tracking continues with the screen locked.

## How the volume is chosen
- Below "Quiet at" speed: min volume. At "Loudest at": max volume. Linear in between.
- Hard braking, acceleration or cornering adds a g-force boost on top.
- Smoothed so it glides. Logic: `src/volume.js` (`node src/volume.test.mjs`).

## Limits
- The build workflow and system-volume control are untested on a real device; iOS may show or limit the volume HUD.
- While running, the app owns the volume; tap Stop to get manual control back.
- Quick testing in Expo Go still works for the UI, but not background tracking or system volume.
