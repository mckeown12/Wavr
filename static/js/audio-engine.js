/**
 * Audio Engine Module
 * Multi-voice Web Audio synth with scale quantization and glide.
 */

const AudioEngine = (() => {
    let ctx = null;
    let currentMode = 'fm';
    let currentWaveform = 'sine'; // for clean mode: 'sine' or 'sawtooth'
    let currentScale = 'chromatic';
    let rootNote = 48; // C3 MIDI note
    let glideTime = 0.08; // seconds — 0 = snap, higher = glide

    // Frequency range
    const FREQ_MIN = 65;    // C2
    const FREQ_MAX = 1047;  // C6
    const FILTER_MIN = 200;
    const FILTER_MAX = 8000;

    // --- Scale definitions (pitch classes 0-11) ---
    const SCALES = {
        chromatic:    { name: 'Chromatic',        notes: [0,1,2,3,4,5,6,7,8,9,10,11] },
        major:        { name: 'Major',            notes: [0,2,4,5,7,9,11] },
        minor:        { name: 'Natural Minor',    notes: [0,2,3,5,7,8,10] },
        pentatonic:   { name: 'Pentatonic Major', notes: [0,2,4,7,9] },
        pent_minor:   { name: 'Pentatonic Minor', notes: [0,3,5,7,10] },
        blues:        { name: 'Blues',             notes: [0,3,5,6,7,10] },
        dorian:       { name: 'Dorian',           notes: [0,2,3,5,7,9,10] },
        mixolydian:   { name: 'Mixolydian',       notes: [0,2,4,5,7,9,10] },
        harmonic_min: { name: 'Harmonic Minor',   notes: [0,2,3,5,7,8,11] },
        whole_tone:   { name: 'Whole Tone',       notes: [0,2,4,6,8,10] },
    };

    // --- Voices (one per hand) ---
    const voices = {}; // keyed by voice id (0, 1)

    /**
     * MIDI note number to frequency.
     */
    function midiToFreq(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    /**
     * Frequency to nearest MIDI note number.
     */
    function freqToMidi(freq) {
        return 69 + 12 * Math.log2(freq / 440);
    }

    /**
     * Quantize a frequency to the nearest note in the current scale.
     */
    function quantize(freq) {
        if (currentScale === 'chromatic') {
            // Snap to nearest semitone
            const midi = Math.round(freqToMidi(freq));
            return midiToFreq(midi);
        }

        const scale = SCALES[currentScale];
        if (!scale) return freq;

        const midi = freqToMidi(freq);
        const rootPitchClass = rootNote % 12;

        // Find the closest note in the scale across octaves
        let bestMidi = Math.round(midi);
        let bestDist = Infinity;

        // Check notes in a range around the raw MIDI value
        const baseMidi = Math.floor(midi) - 12;
        for (let oct = 0; oct < 3; oct++) {
            for (const pc of scale.notes) {
                const candidate = baseMidi + oct * 12 + ((pc + rootPitchClass) % 12);
                // Also check one octave shift of candidate
                for (const c of [candidate, candidate + 12]) {
                    const d = Math.abs(c - midi);
                    if (d < bestDist) {
                        bestDist = d;
                        bestMidi = c;
                    }
                }
            }
        }

        return midiToFreq(bestMidi);
    }

    /**
     * Map a 0-1 value to frequency (log scale).
     */
    function mapFrequency(normalized) {
        return FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, normalized);
    }

    /**
     * Map openness (0-1) to filter cutoff.
     */
    function mapFilter(openness) {
        return FILTER_MIN + (FILTER_MAX - FILTER_MIN) * openness;
    }

    /**
     * Ensure AudioContext exists.
     */
    function ensureContext() {
        if (ctx) return;
        ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    // ---- Voice management ----

    /**
     * Create a new voice with its own oscillator chain + gain + filter.
     */
    function createVoice(id) {
        ensureContext();
        if (ctx.state === 'suspended') ctx.resume();

        const voice = {
            id: id,
            gain: ctx.createGain(),
            filter: ctx.createBiquadFilter(),
            nodes: {},  // mode-specific oscillator nodes
            playing: false,
        };

        voice.gain.gain.value = 0;
        voice.filter.type = 'lowpass';
        voice.filter.frequency.value = FILTER_MAX;
        voice.filter.Q.value = 2;

        voice.filter.connect(voice.gain);
        voice.gain.connect(ctx.destination);

        setupModeNodes(voice);
        voice.playing = true;
        voices[id] = voice;
        return voice;
    }

    /**
     * Set up oscillator nodes for the current synth mode on a voice.
     */
    function setupModeNodes(voice) {
        teardownModeNodes(voice);

        if (currentMode === 'fm') {
            const carrier = ctx.createOscillator();
            carrier.type = 'sine';
            carrier.frequency.value = 220;

            const modulator = ctx.createOscillator();
            modulator.type = 'sine';
            modulator.frequency.value = 440;

            const modGain = ctx.createGain();
            modGain.gain.value = 100;

            modulator.connect(modGain);
            modGain.connect(carrier.frequency);
            carrier.connect(voice.filter);

            carrier.start();
            modulator.start();

            voice.nodes = { carrier, modulator, modGain };

        } else if (currentMode === 'clean') {
            const osc = ctx.createOscillator();
            osc.type = currentWaveform;
            osc.frequency.value = 220;
            osc.connect(voice.filter);
            osc.start();

            voice.nodes = { osc };

        } else if (currentMode === 'warm') {
            const osc = ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = 220;

            const delay = ctx.createDelay(1.0);
            delay.delayTime.value = 0.15;

            const delayGain = ctx.createGain();
            delayGain.gain.value = 0.3;

            osc.connect(voice.filter);
            osc.connect(delay);
            delay.connect(delayGain);
            delayGain.connect(voice.filter);
            delayGain.connect(delay);

            osc.start();

            voice.nodes = { osc, delay, delayGain };
        }
    }

    /**
     * Tear down oscillator nodes on a voice.
     */
    function teardownModeNodes(voice) {
        for (const node of Object.values(voice.nodes)) {
            try { if (node.stop) node.stop(); } catch(e) {}
            try { node.disconnect(); } catch(e) {}
        }
        voice.nodes = {};
    }

    /**
     * Destroy a voice entirely.
     */
    function destroyVoice(id) {
        const voice = voices[id];
        if (!voice) return;

        const now = ctx.currentTime;
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0, now + 0.05);

        setTimeout(() => {
            teardownModeNodes(voice);
            try { voice.filter.disconnect(); } catch(e) {}
            try { voice.gain.disconnect(); } catch(e) {}
            voice.playing = false;
            delete voices[id];
        }, 80);
    }

    /**
     * Update a voice's parameters.
     * Creates the voice if it doesn't exist yet.
     */
    function updateVoice(id, freqNorm, volNorm, openness) {
        let voice = voices[id];
        if (!voice) {
            voice = createVoice(id);
        }

        const now = ctx.currentTime;
        const rawFreq = mapFrequency(freqNorm);
        const freq = quantize(rawFreq);
        const filterFreq = mapFilter(openness);
        const ramp = glideTime;

        // Per-voice volume (scale down when multiple voices active)
        const voiceCount = Object.keys(voices).length;
        const vol = (volNorm * 0.5) / Math.max(1, voiceCount * 0.7);

        // Update frequency
        if (currentMode === 'fm' && voice.nodes.carrier) {
            const c = voice.nodes.carrier;
            const m = voice.nodes.modulator;
            const mg = voice.nodes.modGain;

            c.frequency.cancelScheduledValues(now);
            c.frequency.setValueAtTime(c.frequency.value, now);
            c.frequency.linearRampToValueAtTime(freq, now + ramp);

            m.frequency.cancelScheduledValues(now);
            m.frequency.setValueAtTime(m.frequency.value, now);
            m.frequency.linearRampToValueAtTime(freq * 2, now + ramp);

            mg.gain.cancelScheduledValues(now);
            mg.gain.setValueAtTime(mg.gain.value, now);
            mg.gain.linearRampToValueAtTime(freq * 0.5, now + ramp);

        } else if (currentMode === 'clean' && voice.nodes.osc) {
            const o = voice.nodes.osc;
            o.frequency.cancelScheduledValues(now);
            o.frequency.setValueAtTime(o.frequency.value, now);
            o.frequency.linearRampToValueAtTime(freq, now + ramp);

        } else if (currentMode === 'warm' && voice.nodes.osc) {
            const o = voice.nodes.osc;
            o.frequency.cancelScheduledValues(now);
            o.frequency.setValueAtTime(o.frequency.value, now);
            o.frequency.linearRampToValueAtTime(freq, now + ramp);
        }

        // Volume
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(vol, now + 0.05);

        // Filter
        voice.filter.frequency.cancelScheduledValues(now);
        voice.filter.frequency.setValueAtTime(voice.filter.frequency.value, now);
        voice.filter.frequency.linearRampToValueAtTime(filterFreq, now + 0.05);

        return freq; // return quantized freq for display
    }

    /**
     * Stop a specific voice.
     */
    function stopVoice(id) {
        destroyVoice(id);
    }

    /**
     * Stop all voices.
     */
    function stopAll() {
        for (const id of Object.keys(voices)) {
            destroyVoice(id);
        }
    }

    /**
     * Change synth mode. Rebuilds oscillators on all active voices.
     */
    function setMode(mode) {
        currentMode = mode;
        for (const voice of Object.values(voices)) {
            setupModeNodes(voice);
        }
    }

    function setScale(scale) {
        currentScale = scale;
    }

    function setRootNote(midi) {
        rootNote = midi;
    }

    function setGlideTime(t) {
        glideTime = t;
    }

    function setWaveform(type) {
        currentWaveform = type;
        // Rebuild clean voices so the new waveform takes effect
        if (currentMode === 'clean') {
            for (const voice of Object.values(voices)) {
                setupModeNodes(voice);
            }
        }
    }

    function getScales() {
        return SCALES;
    }

    /**
     * Get quantized frequency for display (without playing).
     */
    function getFrequency(normalized) {
        const raw = mapFrequency(normalized);
        return quantize(raw);
    }

    /**
     * Get note name from frequency.
     */
    function getNoteName(freq) {
        const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        const midi = Math.round(freqToMidi(freq));
        const name = noteNames[midi % 12];
        const octave = Math.floor(midi / 12) - 1;
        return name + octave;
    }

    return {
        updateVoice, stopVoice, stopAll,
        setMode, setScale, setRootNote, setGlideTime, setWaveform,
        getScales, getFrequency, getNoteName,
    };
})();
