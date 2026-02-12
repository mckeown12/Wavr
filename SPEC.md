# Visual Thermin — Specification

## Overview
A web-based visual theremin (frequency modulator) controlled by hand gestures detected through a webcam. The application uses computer vision to track hand position and gestures, mapping them to audio synthesis parameters in real time.

**Target platform:** Raspberry Pi 5 running Chromium
**Stack:** Python/Flask backend, MediaPipe Hands + Web Audio API frontend

---

## Interaction Model

| Gesture | Parameter | Mapping |
|---|---|---|
| Hand horizontal position (X) | **Pitch / Frequency** | Left = low frequency, Right = high frequency |
| Hand vertical position (Y) | **Volume** | Up = loud, Down = quiet |
| Fist vs open hand | **Filter cutoff** | Fist = closed/dark filter, Open hand = bright/open filter |

### Frequency Range
- Minimum: ~65 Hz (C2)
- Maximum: ~1047 Hz (C6)
- Mapped linearly or logarithmically across the webcam frame width

### Volume Range
- 0% (hand at bottom) to 100% (hand at top)

### Filter
- Lowpass filter cutoff: 200 Hz (fist) to 8000 Hz (open hand)
- Gesture detection based on finger tip distance from palm center

### Activation
- Sound only plays when a hand is detected in the frame
- "Show hand to start" prompt displayed when no hand is visible

---

## Architecture

```
Browser (Chromium on Pi 5)
├── MediaPipe Hands (JS) ─── webcam → hand landmarks
├── Web Audio API ─────────── oscillators + gain + filter → speakers
└── UI ────────────────────── real-time metric display

Flask (Python)
└── Serves static files + HTML template on 0.0.0.0:5050
```

All computation happens client-side. Flask is a simple static file server.

---

## Audio Engine

Three switchable synth modes:

### 1. FM Synth (default)
- Carrier oscillator (sine) at the target frequency
- Modulator oscillator modulates the carrier frequency
- Modulation depth controlled by a fixed ratio
- Classic electronic theremin sound

### 2. Clean Wave
- Single oscillator (sine or sawtooth, user-selectable)
- Direct frequency control, no modulation
- Minimal and pure

### 3. Warm Tone
- Oscillator fed through a lowpass filter with moderate resonance
- Convolution reverb (or delay-based reverb fallback) for warmth
- Surf guitar / vintage feel

All modes share:
- **GainNode** for volume (hand Y)
- **BiquadFilterNode** (lowpass) for tonal control (fist/open hand)
- **Smooth transitions** via `linearRampToValueAtTime` to prevent clicks/pops

---

## UI Design — Beach Boys Aesthetic

### Color Palette
| Role | Color | Hex |
|---|---|---|
| Background | Sandy cream / warm white | `#FFF8E7` |
| Primary accent | Sunset coral | `#FF6B6B` |
| Secondary accent | Ocean turquoise | `#4ECDC4` |
| Tertiary accent | Sky blue | `#45B7D1` |
| Text (headings) | Deep navy | `#2C3E50` |
| Text (body) | Warm dark gray | `#5D5D5D` |
| Card background | White | `#FFFFFF` |
| Card shadow | Soft warm gray | rgba(0,0,0,0.08) |

### Typography
- **Headings:** "Pacifico" (Google Fonts) — retro surf script
- **Body/metrics:** "Inter" or system sans-serif — clean and readable
- **Metric values:** Large, bold, colored per-parameter

### Layout (Desktop / Pi Display)
```
┌─────────────────────────────────────────────────────┐
│            🏄  VISUAL THERMIN  🏄                    │
├────────────────────────┬────────────────────────────┤
│                        │  ┌──────────────────────┐  │
│                        │  │ 🎵 FREQUENCY  148 Hz │  │
│     [ WEBCAM FEED ]    │  │ 🔊 VOLUME      45%   │  │
│                        │  │ ✨ FILTER       Open  │  │
│                        │  │                      │  │
│                        │  │  ● Show hand to play │  │
│                        │  └──────────────────────┘  │
│                        │  ┌──────────────────────┐  │
│                        │  │   HOW TO PLAY        │  │
│                        │  │ ↔ Pitch: left/right  │  │
│                        │  │ ↕ Volume: up/down    │  │
│                        │  │ ✊ Filter: fist/open  │  │
│                        │  └──────────────────────┘  │
└────────────────────────┴────────────────────────────┘
```

### Visual Details
- Webcam feed: rounded corners (12px), soft shadow
- Metric cards: white background, rounded, drop shadow
- Metric values: large font, colored (coral for freq, turquoise for volume, blue for filter)
- Smooth CSS transitions on all value changes
- Optional: subtle wave/stripe pattern in the header area
- Synth mode selector: small toggle or dropdown in the metrics panel

---

## Tech Stack

### Backend
- **Python 3.9+**
- **Flask** — web server

### Frontend (all via CDN)
- **MediaPipe Hands** (`@mediapipe/hands`) — hand landmark detection
- **MediaPipe Camera Utils** (`@mediapipe/camera_utils`) — webcam helper
- **Google Fonts** — Pacifico

### No build step required
All JavaScript is vanilla ES modules or script tags. No bundler needed.

---

## File Structure

```
Wavr/
├── SPEC.md               # This file
├── app.py                # Flask server
├── requirements.txt      # Python deps (flask)
├── static/
│   ├── css/
│   │   └── style.css     # Beach Boys themed styles
│   └── js/
│       ├── hand-tracking.js  # MediaPipe setup + gesture detection
│       ├── audio-engine.js   # Web Audio synth engine
│       └── app.js            # Main controller, UI glue
└── templates/
    └── index.html        # Main page template
```

---

## Pi 5 Deployment Notes

- Run Flask with `host='0.0.0.0'` for LAN access
- Chromium on Pi 5 supports MediaPipe Hands via WebGL
- For kiosk mode: `chromium-browser --kiosk http://localhost:5050`
- Camera access requires HTTPS in some browsers; localhost is exempt
- If accessing from another device on LAN, may need to use the Pi's IP with HTTP (not HTTPS) — MediaPipe camera access may be blocked on non-localhost HTTP in some browsers
