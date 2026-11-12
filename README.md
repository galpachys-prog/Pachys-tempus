# Pachys Tempus

Offline patient-monitor simulator for ALS / medical-simulation training. The monitor runs on a tablet; the instructor station runs on a phone.

**Live:** https://galpachys-prog.github.io/Pachys-tempus/

## Works with no network
- **PWA:** after one online visit (Safari → Share → Add to Home Screen) every file is cached by a service worker; the app then opens and runs fully offline.
- **Device-to-device link without internet:** WebRTC DataChannel with no STUN/TURN servers. The offer/answer is exchanged by scanning QR codes (or copy/paste / AirDrop of the text code). Both devices only need to share a local network — a phone hotspot or any travel Wi-Fi router; no internet connection is required.
- **No network at all:** single-device mode (`monitor.html?solo`, or long-press the logo) opens the instructor panel as a drawer on the monitor. On iPad, Split View with monitor + instructor in two windows links automatically (BroadcastChannel).

## Features
- Sweep waveforms: ECG II, pleth, capnography (normal / obstructive)
- Rhythms: Sinus, Sinus Brady, Sinus Tach, SVT, AF, Flutter, CHB, VT, VF, Asystole; PEA / pulseless VT via the pulse toggle; ST elevation; CPR artefact
- Numerics: HR/PR, SpO₂, NIBP (timed cuff cycle, auto interval), EtCO₂ + RR, temperature
- Alarms with priorities, onset delay, banner and IEC-style tones; 2-min silence
- Defibrillator: energy select, charge, shock (artefact + event sent to instructor)
- Instructor: staged changes with Apply or LIVE mode, ramp times (instant–5 min), sensor attach/detach, 14 preset scenarios, scenario timer, event log (shocks, charges, NIBP, alarms)

## Full version
`full/` holds the full single-file build (clinical pictures, IDF-doctrine checklists, staged scenarios, labs and images), with its own service worker scoped to `/full/`: https://galpachys-prog.github.io/Pachys-tempus/full/

## Files
`index.html` launcher · `monitor.html` · `instructor.html` · `js/` (physio engine, audio, link, pairing, controls) · `sw.js` offline cache · `vendor/` jsQR (Apache-2.0) and qrcode-generator (MIT).

When changing any file, bump `VERSION` in `sw.js` so devices pick up the update.
