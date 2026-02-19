/**
 * Audio Engine Module
 * Multi-voice Web Audio synth with scale quantization and glide.
 */

const AudioEngine = (() => {
    let ctx = null;
    let audioDestination = null; // for recording
    let currentMode = 'fm';
    let currentWaveform = 'sine'; // for clean mode: 'sine' or 'sawtooth'
    let customWaveData = null; // for custom drawn waveforms
    let customPeriodicWave = null;
    let currentScale = 'chromatic';
    let rootNote = 48; // C3 MIDI note
    let glideTime = 0.08; // seconds — 0 = snap, higher = glide

    // ADSR envelope parameters (in seconds)
    let attackTime = 0.01;   // Attack: 0 to peak
    let decayTime = 0.1;     // Decay: peak to sustain level
    let sustainLevel = 0.7;  // Sustain: held level (0-1)
    let releaseTime = 0.3;   // Release: sustain to 0

    // Frequency range (configurable)
    let FREQ_MIN = 65;    // C2 (MIDI 36)
    let FREQ_MAX = 1047;  // C6 (MIDI 84)
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
        // baseMidi should be at the start of an octave (multiple of 12)
        const baseMidi = Math.floor(midi / 12 - 1) * 12;
        for (let oct = 0; oct < 4; oct++) {
            for (const pc of scale.notes) {
                const candidate = baseMidi + oct * 12 + ((pc + rootPitchClass) % 12);
                const d = Math.abs(candidate - midi);
                if (d < bestDist) {
                    bestDist = d;
                    bestMidi = candidate;
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
        audioDestination = ctx.createMediaStreamDestination();
    }

    /**
     * Get the audio stream for recording.
     */
    function getAudioStream() {
        ensureContext();
        return audioDestination.stream;
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
            triggered: false, // tracks if ADSR envelope has been triggered
            lastTriggerTime: 0, // when the note was last triggered
        };

        voice.gain.gain.value = 0;
        voice.filter.type = 'lowpass';
        voice.filter.frequency.value = FILTER_MAX;
        voice.filter.Q.value = 2;

        voice.filter.connect(voice.gain);
        voice.gain.connect(ctx.destination);
        voice.gain.connect(audioDestination); // Also connect to recording destination

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

            // Use custom wave if available, otherwise standard waveform
            if (customPeriodicWave) {
                osc.setPeriodicWave(customPeriodicWave);
            } else {
                osc.type = currentWaveform;
            }

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

        } else if (currentMode === 'pad') {
            // 3 detuned oscillators for lush ambient pad
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const osc3 = ctx.createOscillator();
            osc1.type = 'sine';
            osc2.type = 'sine';
            osc3.type = 'triangle';
            osc1.frequency.value = 220;
            osc2.frequency.value = 220 * 1.005;
            osc3.frequency.value = 220 * 0.995;

            const mix = ctx.createGain();
            mix.gain.value = 0.4;

            osc1.connect(mix);
            osc2.connect(mix);
            osc3.connect(mix);
            mix.connect(voice.filter);

            osc1.start();
            osc2.start();
            osc3.start();

            voice.nodes = { osc1, osc2, osc3, mix };

        } else if (currentMode === 'theremin') {
            // Classic theremin: sine + vibrato LFO
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = 220;

            const lfo = ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 5.5;

            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 4;

            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);
            osc.connect(voice.filter);

            osc.start();
            lfo.start();

            voice.nodes = { osc, lfo, lfoGain };

        } else if (currentMode === 'organ') {
            // Additive harmonics: fundamental + 2nd + 3rd
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const osc3 = ctx.createOscillator();
            osc1.type = 'sine';
            osc2.type = 'sine';
            osc3.type = 'sine';
            osc1.frequency.value = 220;
            osc2.frequency.value = 440;
            osc3.frequency.value = 660;

            const gain1 = ctx.createGain();
            const gain2 = ctx.createGain();
            const gain3 = ctx.createGain();
            gain1.gain.value = 0.5;
            gain2.gain.value = 0.25;
            gain3.gain.value = 0.15;

            osc1.connect(gain1);
            osc2.connect(gain2);
            osc3.connect(gain3);
            gain1.connect(voice.filter);
            gain2.connect(voice.filter);
            gain3.connect(voice.filter);

            osc1.start();
            osc2.start();
            osc3.start();

            voice.nodes = { osc1, osc2, osc3, gain1, gain2, gain3 };

        } else if (currentMode === 'bitcrush') {
            // Lo-fi: sawtooth through waveshaper distortion
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = 220;

            const shaper = ctx.createWaveShaper();
            const samples = 256;
            const curve = new Float32Array(samples);
            for (let i = 0; i < samples; i++) {
                const x = (i * 2) / samples - 1;
                // Staircase quantization for bitcrush effect
                const steps = 8;
                curve[i] = Math.round(x * steps) / steps;
            }
            shaper.curve = curve;
            shaper.oversample = 'none';

            osc.connect(shaper);
            shaper.connect(voice.filter);

            osc.start();

            voice.nodes = { osc, shaper };
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
        // Release: current volume to 0
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0, now + releaseTime);

        setTimeout(() => {
            teardownModeNodes(voice);
            try { voice.filter.disconnect(); } catch(e) {}
            try { voice.gain.disconnect(); } catch(e) {}
            voice.playing = false;
            delete voices[id];
        }, releaseTime * 1000 + 50);
    }

    /**
     * Update a voice's parameters.
     * Creates the voice if it doesn't exist yet.
     * @param {boolean} retrigger - If true, retrigger the ADSR envelope
     */
    function updateVoice(id, freqNorm, volNorm, openness, retrigger = false) {
        let voice = voices[id];
        if (!voice) {
            voice = createVoice(id);
        }

        // Retrigger ADSR envelope if requested
        if (retrigger && voice.triggered) {
            voice.triggered = false;
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

        } else if (currentMode === 'pad' && voice.nodes.osc1) {
            const oscs = [voice.nodes.osc1, voice.nodes.osc2, voice.nodes.osc3];
            const detune = [1, 1.005, 0.995];
            for (let i = 0; i < oscs.length; i++) {
                oscs[i].frequency.cancelScheduledValues(now);
                oscs[i].frequency.setValueAtTime(oscs[i].frequency.value, now);
                oscs[i].frequency.linearRampToValueAtTime(freq * detune[i], now + ramp);
            }

        } else if (currentMode === 'theremin' && voice.nodes.osc) {
            const o = voice.nodes.osc;
            o.frequency.cancelScheduledValues(now);
            o.frequency.setValueAtTime(o.frequency.value, now);
            o.frequency.linearRampToValueAtTime(freq, now + ramp);
            // Scale vibrato depth with frequency
            const lg = voice.nodes.lfoGain;
            lg.gain.cancelScheduledValues(now);
            lg.gain.setValueAtTime(lg.gain.value, now);
            lg.gain.linearRampToValueAtTime(freq * 0.02, now + ramp);

        } else if (currentMode === 'organ' && voice.nodes.osc1) {
            const oscs = [voice.nodes.osc1, voice.nodes.osc2, voice.nodes.osc3];
            const harmonics = [1, 2, 3];
            for (let i = 0; i < oscs.length; i++) {
                oscs[i].frequency.cancelScheduledValues(now);
                oscs[i].frequency.setValueAtTime(oscs[i].frequency.value, now);
                oscs[i].frequency.linearRampToValueAtTime(freq * harmonics[i], now + ramp);
            }

        } else if (currentMode === 'bitcrush' && voice.nodes.osc) {
            const o = voice.nodes.osc;
            o.frequency.cancelScheduledValues(now);
            o.frequency.setValueAtTime(o.frequency.value, now);
            o.frequency.linearRampToValueAtTime(freq, now + ramp);
        }

        // Volume with ADSR envelope
        // If this is a new trigger (voice just created or retriggered), apply attack
        if (!voice.triggered) {
            voice.triggered = true;
            voice.lastTriggerTime = now;

            const peakVol = vol / sustainLevel; // Scale up so sustain = vol

            voice.gain.gain.cancelScheduledValues(now);
            voice.gain.gain.setValueAtTime(0, now);
            // Attack: 0 to peak
            voice.gain.gain.linearRampToValueAtTime(peakVol, now + attackTime);
            // Decay: peak to sustain
            voice.gain.gain.linearRampToValueAtTime(vol, now + attackTime + decayTime);
        } else {
            // Check if we're still in attack/decay phase
            const elapsed = now - voice.lastTriggerTime;
            const attackDecayTime = attackTime + decayTime;

            if (elapsed >= attackDecayTime) {
                // We're in sustain phase, can adjust level smoothly
                voice.gain.gain.cancelScheduledValues(now);
                voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
                voice.gain.gain.linearRampToValueAtTime(vol, now + 0.05);
            }
            // Otherwise, let the scheduled attack/decay finish
        }

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
        customWaveData = null;
        customPeriodicWave = null;
        // Rebuild clean voices so the new waveform takes effect
        if (currentMode === 'clean') {
            for (const voice of Object.values(voices)) {
                setupModeNodes(voice);
            }
        }
    }

    /**
     * Set a custom waveform from drawn data.
     */
    function setCustomWave(waveData) {
        ensureContext();
        customWaveData = waveData;

        // Create PeriodicWave from the drawn data
        // We need to convert time-domain data to frequency-domain (Fourier coefficients)
        // For simplicity, we'll use the waveData directly as the wave shape
        const real = new Float32Array(waveData.length);
        const imag = new Float32Array(waveData.length);

        for (let i = 0; i < waveData.length; i++) {
            real[i] = waveData[i];
            imag[i] = 0;
        }

        customPeriodicWave = ctx.createPeriodicWave(real, imag);

        // Rebuild clean voices if active
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

    /**
     * Set frequency range.
     */
    function setFreqRange(minFreq, maxFreq) {
        FREQ_MIN = minFreq;
        FREQ_MAX = maxFreq;
    }

    /**
     * Get current frequency range.
     */
    function getFreqRange() {
        return { min: FREQ_MIN, max: FREQ_MAX };
    }

    /**
     * Get all notes in the current scale within the frequency range.
     * Returns array of { midi, freq, name } for drawing vertical lines.
     */
    function getScaleNotes() {
        const minMidi = Math.ceil(freqToMidi(FREQ_MIN));
        const maxMidi = Math.floor(freqToMidi(FREQ_MAX));
        const notes = [];

        if (currentScale === 'chromatic') {
            // All semitones
            for (let midi = minMidi; midi <= maxMidi; midi++) {
                notes.push({
                    midi,
                    freq: midiToFreq(midi),
                    name: getNoteName(midiToFreq(midi))
                });
            }
        } else {
            const scale = SCALES[currentScale];
            if (!scale) return notes;

            const rootPitchClass = rootNote % 12;

            // Find all notes in scale within range
            for (let midi = minMidi; midi <= maxMidi; midi++) {
                const pitchClass = midi % 12;
                // Check if this pitch class is in the scale (transposed by root)
                const scalePitchClass = (pitchClass - rootPitchClass + 12) % 12;
                if (scale.notes.includes(scalePitchClass)) {
                    notes.push({
                        midi,
                        freq: midiToFreq(midi),
                        name: getNoteName(midiToFreq(midi))
                    });
                }
            }
        }

        return notes;
    }

    /**
     * Set ADSR envelope parameters.
     */
    function setAttack(time) {
        attackTime = Math.max(0.001, time); // Min 1ms
    }

    function setDecay(time) {
        decayTime = Math.max(0.001, time);
    }

    function setSustain(level) {
        sustainLevel = Math.max(0.001, Math.min(1, level)); // Clamp 0.001-1
    }

    function setRelease(time) {
        releaseTime = Math.max(0.001, time);
    }

    function getADSR() {
        return { attack: attackTime, decay: decayTime, sustain: sustainLevel, release: releaseTime };
    }

    return {
        updateVoice, stopVoice, stopAll,
        setMode, setScale, setRootNote, setGlideTime, setWaveform, setCustomWave,
        setFreqRange, getFreqRange, getScaleNotes,
        getScales, getFrequency, getNoteName,
        midiToFreq, freqToMidi,
        getAudioStream,
        setAttack, setDecay, setSustain, setRelease, getADSR,
    };
})();
