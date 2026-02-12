# Visual Thermin

A computer vision-powered frequency modulator that turns your hand gestures into music. Wave your hands in front of a webcam to control pitch, volume, and filter — like a theremin, but with your camera.

Built to run on a Raspberry Pi 5.

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

- **Backend:** Python / Flask
- **Hand tracking:** MediaPipe Hands (runs client-side in the browser)
- **Audio:** Web Audio API (FM synthesis, filters, gain)
- **UI:** Vanilla HTML/CSS/JS, Google Fonts (Pacifico + Inter)

No build step. No bundler. No npm.

## Setup

```bash
# Clone
git clone https://github.com/MarioCruz/Wavr.git
cd Wavr

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run
python app.py
```

Open **http://localhost:5050** in your browser and allow camera access.

## Raspberry Pi 5 Deployment

```bash
# Same setup as above, then:
python app.py
```

The server binds to `0.0.0.0:5050` so you can access it from any device on your LAN at `http://<pi-ip>:5050`.

For kiosk mode:

```bash
chromium-browser --kiosk http://localhost:5050
```

## Project Structure

```
Wavr/
├── app.py                    # Flask server
├── requirements.txt          # flask
├── SPEC.md                   # Full specification
├── CLAUDE.md                 # Dev guide for Claude Code
├── static/
│   ├── css/
│   │   └── style.css         # Beach Boys themed UI
│   └── js/
│       ├── audio-engine.js   # Multi-voice Web Audio synth + scale quantization
│       ├── hand-tracking.js  # MediaPipe hand detection + gesture extraction
│       └── app.js            # Main controller wiring tracking → audio → UI
└── templates/
    └── index.html            # Jinja2 template
```

## License

MIT
