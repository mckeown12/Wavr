# Visual Thermin

A computer vision-powered frequency modulator that turns your hand gestures into music. Wave your hands in front of a webcam to control pitch, volume, and filter — like a theremin, but with your camera.

Pure client-side web app. No backend required.

## How It Works

| Gesture | Controls | Mapping |
|---|---|---|
| Hand left / right | **Pitch** | Low frequency → High frequency |
| Hand up / down | **Volume** | Loud → Quiet |
| Fist / Open hand | **Filter** | Dark (closed) → Bright (open) |

Show your hand to start playing. Remove it to stop.

## Features

- **7 synth modes** — FM Synth, Clean Wave, Warm Tone, Pad, Theremin, Organ, Bitcrush
- **10 musical scales** — Major, Minor, Pentatonic, Blues, Dorian, Mixolydian, Harmonic Minor, Whole Tone, and more
- **Root note selector** — Transpose the scale to any key
- **Glide control** — Snap instantly to scale notes or morph slowly between them (portamento)
- **Multi-hand mode** — Toggle on 2-hand tracking for duets or two-hand play, each hand gets its own independent voice
- **Real-time display** — Note name, frequency, volume %, and filter state per hand

## Tech Stack

- **Hand tracking:** MediaPipe Hands (client-side in the browser)
- **Audio:** Web Audio API (FM synthesis, filters, gain)
- **UI:** Vanilla HTML/CSS/JS, Google Fonts (Pacifico + Inter)

No backend. No build step. No bundler. No npm. Just open `index.html` in a browser.

## Setup

```bash
# Clone
git clone https://github.com/mckeown12/Wavr.git
cd Wavr

# Option 1: Open directly in browser
open index.html

# Option 2: Serve with a local HTTP server (recommended for full functionality)
python3 -m http.server 5050
# or
npx serve
```

Open **http://localhost:5050** in your browser and allow camera access.

### GitHub Pages

This app is hosted live at: **[https://mckeown12.github.io/Wavr](https://mckeown12.github.io/Wavr)**

To deploy your own:
1. Push to GitHub
2. Go to Settings → Pages
3. Set Source to "Deploy from a branch"
4. Select `main` branch and `/ (root)` folder
5. Save and wait for deployment

## Raspberry Pi 5 Deployment

```bash
# Clone the repo
git clone https://github.com/mckeown12/Wavr.git
cd Wavr

# Serve locally (optional, or just open index.html)
python3 -m http.server 5050 --bind 0.0.0.0
```

Access from any device on your LAN at `http://<pi-ip>:5050`.

For kiosk mode:

```bash
chromium-browser --kiosk index.html
# or
chromium-browser --kiosk http://localhost:5050
```

## Project Structure

```
Wavr/
├── index.html                # Main HTML file
├── SPEC.md                   # Full specification
├── CLAUDE.md                 # Dev guide for Claude Code
└── static/
    ├── css/
    │   └── style.css         # Beach Boys themed UI
    └── js/
        ├── audio-engine.js   # Multi-voice Web Audio synth + scale quantization
        ├── hand-tracking.js  # MediaPipe hand detection + gesture extraction
        └── app.js            # Main controller wiring tracking → audio → UI
```

## License

MIT
