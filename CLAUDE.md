# CLAUDE.md — Developer Guide

## What is this project?

Visual Theremin is a web-based musical instrument controlled by hand gestures via webcam. It's a pure static site with no backend — all hand tracking and audio synthesis runs client-side in the browser using MediaPipe Hands and Web Audio API.

## Quick Start

```bash
# Option 1: Open directly
open index.html

# Option 2: Serve with HTTP server
python3 -m http.server 5050
# → http://localhost:5050
```

## Architecture

- **`index.html`** — Main HTML file. Loads Google Fonts, MediaPipe from CDN, local CSS/JS. No backend required.
- **`static/js/hand-tracking.js`** — Wraps MediaPipe Hands. Detects 1-2 hands, extracts X/Y position and fist/open gesture. Returns array of hand data objects per frame.
- **`static/js/audio-engine.js`** — Multi-voice Web Audio synth. Each detected hand gets its own voice (oscillator chain + gain + filter). Handles scale quantization and glide/portamento. Seven synth modes: FM, Clean, Warm, Pad, Theremin, Organ, Bitcrush.
- **`static/js/app.js`** — IIFE that wires hand tracking callbacks to audio engine and DOM updates. Manages settings UI (scale, root, glide, synth mode, multi-hand toggle).
- **`static/css/style.css`** — Beach Boys aesthetic: sunset gradients, coral/turquoise/sky palette, Pacifico font.

## Key Concepts

### Scales & Quantization
Scales are defined in `audio-engine.js` as arrays of pitch classes (0-11). The `quantize()` function snaps any continuous frequency to the nearest note in the selected scale + root. Glide time controls how fast the oscillator ramps to the quantized pitch (0 = snap, up to 500ms = slow morph).

### Multi-Voice
Each hand maps to a voice ID (0 or 1). Voices are created on demand in `updateVoice()` and destroyed in `stopVoice()`. Each voice has its own complete audio chain: oscillators → BiquadFilter → GainNode → destination.

### Synth Modes
All modes are defined in `setupModeNodes()` with frequency updates in `updateVoice()`:

| Mode | Key | Sound Design |
|---|---|---|
| FM Synth | `fm` | Carrier + modulator oscillators, classic electronic |
| Clean Wave | `clean` | Single oscillator (sine/sawtooth selectable) |
| Warm Tone | `warm` | Triangle osc + delay-based reverb feedback loop |
| Pad | `pad` | 3 detuned oscillators (1x, 1.005x, 0.995x) for lush ambient |
| Theremin | `theremin` | Sine + 5.5Hz vibrato LFO, depth scales with frequency |
| Organ | `organ` | Additive harmonics: fundamental + 2nd + 3rd partial |
| Bitcrush | `bitcrush` | Sawtooth through 8-step staircase waveshaper |

### Hand Tracking Data Flow
```
MediaPipe frame → HandTracking.processResults()
  → array of { id, x, y, openness }
  → app.js onHandData()
    → AudioEngine.updateVoice(id, freqNorm, volNorm, openness)
    → DOM updates per hand
```

## Conventions

- Pure static site — no backend, no build step, no bundler
- All vanilla JS loaded via `<script>` tags
- Modules use the revealing module pattern (IIFE returning public API)
- CSS uses custom properties defined in `:root`
- Target platform: Modern browsers with webcam (Chrome, Firefox, Edge)
- Can be deployed to GitHub Pages, Netlify, or any static host

## Testing

Open `index.html` in a browser with a webcam (or serve via `python3 -m http.server 5050`). Verify:
1. Camera feed appears in the left panel
2. Show hand → audio plays, metrics update
3. Change scale/root → notes snap to correct pitches
4. Adjust glide → smooth vs instant transitions
5. Toggle multi-hand → second hand row appears, two independent voices
6. Switch synth mode → sound character changes

## Files You'll Touch Most

| Task | Files |
|---|---|
| Add a new scale | `audio-engine.js` (SCALES object) + `index.html` (dropdown option) |
| Add a new synth mode | `audio-engine.js` (setupModeNodes + updateVoice) + `index.html` (dropdown option) |
| Change the sound | `audio-engine.js` (setupModeNodes functions) |
| Add a new gesture | `hand-tracking.js` (extractHandData) + `app.js` (onHandData) |
| Modify the layout/theme | `style.css` + `index.html` |
