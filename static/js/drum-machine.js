/* === Drum Machine Module === */
const DrumMachine = (function () {

    // ══════════════════════════════════════════════════════════════════
    // Sample Configuration
    // ══════════════════════════════════════════════════════════════════

    const SAMPLE_BASE = './static/audio/drums/';

    const KITS = {
        acoustic: { label: 'Acoustic', files: { kick: 'kick.mp3', snare: 'snare.mp3', hihat: 'hihat.mp3', tom: 'tom.mp3' } },
        cr78:     { label: 'CR-78',    files: { kick: 'kick-cr78.mp3', snare: 'snare-cr78.mp3', hihat: 'hihat-cr78.mp3', tom: 'tom-cr78.mp3' } },
        techno:   { label: 'Techno',   files: { kick: 'kick-techno.mp3', snare: 'snare-techno.mp3', hihat: 'hihat-techno.mp3' } },
        linn:     { label: 'LinnDrum', files: { kick: 'kick-linn.mp3', snare: 'snare-linn.mp3', hihat: 'hihat-linn.mp3', tom: 'tom-linn.mp3' } },
        synth:    { label: 'Synth',    files: {} },
    };

    const EXTRA_FILES = {
        openhat: 'openhat.mp3',
        clap:    'clap.mp3',
        cowbell: 'cowbell.mp3',
        crash:   'crash.mp3',
    };

    let currentKit = 'acoustic';
    const sampleBuffers = {};

    async function loadSamples() {
        const files = { ...((KITS[currentKit] && KITS[currentKit].files) || {}), ...EXTRA_FILES };
        await Promise.allSettled(Object.entries(files).map(async ([id, file]) => {
            try {
                const resp = await fetch(SAMPLE_BASE + file);
                if (!resp.ok) throw new Error(resp.status);
                sampleBuffers[id] = await ctx.decodeAudioData(await resp.arrayBuffer());
            } catch (e) {
                delete sampleBuffers[id];
            }
        }));
    }

    function playSample(id, time, vel) {
        const buf = sampleBuffers[id];
        if (!buf) return false;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.value = Math.min(1, instrumentVolumes[id] * vel * 1.2);
        src.connect(g); g.connect(masterGain);
        src.start(time);
        return true;
    }

    function switchKit(kitId) {
        if (!KITS[kitId]) return;
        currentKit = kitId;
        Object.keys((KITS[kitId] && KITS[kitId].files) || {}).forEach(id => delete sampleBuffers[id]);
        if (ctx) loadSamples();
        saveState();
    }

    // ══════════════════════════════════════════════════════════════════
    // Audio Context + FX Chain
    // ══════════════════════════════════════════════════════════════════

    let ctx = null;
    let masterGain = null;
    let fxComp = null;
    let fxReverb = null; let fxReverbWet = null; let fxReverbDry = null;
    let fxLimiter = null;
    let samplesInitiated = false;

    // FX state — persisted to localStorage
    const fx = {
        comp:    { enabled: true,  threshold: -24, ratio: 4 },
        reverb:  { enabled: false, wet: 20,  size: 'medium' },
        limiter: { enabled: true,  threshold: -0.5 },
    };

    const REVERB_SIZES = {
        small:  { duration: 0.6, decay: 4.0 },
        medium: { duration: 1.5, decay: 2.5 },
        large:  { duration: 3.0, decay: 2.0 },
        hall:   { duration: 5.0, decay: 1.5 },
    };

    function buildReverbIR(size) {
        const { duration, decay } = REVERB_SIZES[size] || REVERB_SIZES.medium;
        const length = Math.floor(ctx.sampleRate * duration);
        const ir = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const d = ir.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
            }
        }
        return ir;
    }

    function applyFX() {
        if (!fxComp) return;
        // Compressor (ratio=1 ≈ bypass; threshold=0 with ratio=1 = no compression)
        fxComp.threshold.value = fx.comp.enabled ? fx.comp.threshold : 0;
        fxComp.ratio.value     = fx.comp.enabled ? fx.comp.ratio : 1;
        // Reverb wet/dry mix
        const wet = fx.reverb.enabled ? (fx.reverb.wet / 100) : 0;
        fxReverbWet.gain.value = wet;
        fxReverbDry.gain.value = 1 - wet * 0.5; // slight dry boost when wet is high
        // Limiter (ratio=1 = bypass)
        fxLimiter.threshold.value = fx.limiter.enabled ? fx.limiter.threshold : 0;
        fxLimiter.ratio.value     = fx.limiter.enabled ? 20 : 1;
    }

    function initAudio() {
        if (ctx) return;
        ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Instrument voices connect to masterGain
        masterGain = ctx.createGain();
        masterGain.gain.value = 0.8;

        // Compressor (threshold/ratio/knee fixed defaults; threshold+ratio controlled by UI)
        fxComp = ctx.createDynamicsCompressor();
        fxComp.knee.value    = 3;
        fxComp.attack.value  = 0.003;
        fxComp.release.value = 0.25;

        // Reverb — synthetic exponential-noise impulse response (no IR files needed)
        fxReverb    = ctx.createConvolver();
        fxReverbWet = ctx.createGain();
        fxReverbDry = ctx.createGain();
        fxReverb.buffer = buildReverbIR(fx.reverb.size);

        // Limiter — DynamicsCompressor with near-infinite ratio, fast attack, zero knee
        fxLimiter = ctx.createDynamicsCompressor();
        fxLimiter.knee.value    = 0;
        fxLimiter.attack.value  = 0.001;
        fxLimiter.release.value = 0.1;

        // Apply current FX settings to node parameters
        applyFX();

        // Signal path:  masterGain → compressor → ┬─ dry ──────────┬─ limiter → output
        //                                          └─ reverb → wet ─┘
        masterGain.connect(fxComp);
        fxComp.connect(fxReverbDry);
        fxComp.connect(fxReverb);
        fxReverb.connect(fxReverbWet);
        fxReverbDry.connect(fxLimiter);
        fxReverbWet.connect(fxLimiter);
        fxLimiter.connect(ctx.destination);

        if (!samplesInitiated) { samplesInitiated = true; loadSamples(); }
    }

    // ══════════════════════════════════════════════════════════════════
    // Instruments
    // ══════════════════════════════════════════════════════════════════

    const INSTRUMENTS = [
        { id: 'kick',    label: 'Kick',     color: '#FF6B6B' },
        { id: 'snare',   label: 'Snare',    color: '#FF9F43' },
        { id: 'hihat',   label: 'Hi-Hat',   color: '#4ECDC4' },
        { id: 'openhat', label: 'Open Hat', color: '#45B7D1' },
        { id: 'clap',    label: 'Clap',     color: '#A29BFE' },
        { id: 'tom',     label: 'Tom',      color: '#FD79A8' },
        { id: 'cowbell', label: 'Cowbell',  color: '#55EFC4' },
        { id: 'crash',   label: 'Crash',    color: '#FDCB6E' },
    ];

    // Typical per-instrument step density for randomize (0–1)
    const RAND_DENSITY = { kick: 0.28, snare: 0.15, hihat: 0.5, openhat: 0.1, clap: 0.15, tom: 0.18, cowbell: 0.1, crash: 0.06 };

    // Genre pattern templates — 16 probability values per instrument (wraps for 8/32 step counts)
    // 0 = never, 1 = always, 0.x = sometimes — adds controlled randomness while staying musical
    const STYLE_TEMPLATES = {
        house: { label: 'House',
            kick:    [1,0,0,0,    1,0,0,0,    1,0,0,0,    1,0,0.2,0],
            snare:   [0,0,0,0,    1,0,0,0.1,  0,0,0,0,    1,0,0,0.1],
            hihat:   [0.9,0,0.9,0, 0.9,0,0.9,0, 0.9,0,0.9,0, 0.9,0,0.9,0.4],
            openhat: [0,0,0,0,    0.7,0,0,0,  0,0,0,0,    0.7,0,0,0],
            clap:    [0,0,0,0,    0,0,0,0,    0,0,0,0,    0,0,0,0],
            tom:     [0,0,0,0,    0,0,0,0,    0,0,0,0,    0,0,0.3,0.3],
            cowbell: [0,0,0,0,    0,0,0,0,    0,0,0,0,    0,0,0,0],
            crash:   [0.7,0,0,0,  0,0,0,0,    0,0,0,0,    0,0,0,0],
        },
        hiphop: { label: 'Hip-Hop',
            kick:    [1,0,0,0.3,  0,0,0.3,0,  0.6,0,0.4,0, 0,0,0.2,0],
            snare:   [0,0,0,0,    1,0,0,0.2,  0,0,0,0,    1,0,0,0.3],
            hihat:   [0.8,0,0.7,0, 0.8,0,0.7,0, 0.8,0,0.7,0, 0.8,0.4,0.7,0],
            openhat: [0,0,0,0,    0,0,0.4,0,  0,0,0,0,    0,0,0.4,0],
            clap:    [0,0,0,0,    0.9,0,0,0,  0,0,0,0,    0.9,0,0,0.2],
            tom:     [0,0,0,0,    0,0,0,0.2,  0,0,0,0,    0,0,0,0.2],
            cowbell: [0,0,0,0,    0,0,0,0,    0,0,0,0,    0,0,0,0],
            crash:   [0.3,0,0,0,  0,0,0,0,    0,0,0,0,    0,0,0,0],
        },
        techno: { label: 'Techno',
            kick:    [1,0,0,0,    1,0,0,0,    1,0,0,0,    1,0,0,0],
            snare:   [0,0,0,0,    0,0,0,0,    0,0,0,0,    0.2,0,0.2,0],
            hihat:   [1,0.6,1,0.6, 1,0.6,1,0.6, 1,0.6,1,0.6, 1,0.6,1,0.6],
            openhat: [0,0,0,0,    0.8,0,0,0,  0,0,0,0,    0.8,0,0,0],
            clap:    [0,0,0,0,    0.5,0,0,0,  0,0,0,0,    0.5,0,0,0],
            tom:     [0,0,0,0,    0,0,0,0,    0,0,0,0,    0,0,0.5,0.5],
            cowbell: [0,0.3,0,0.3, 0,0.3,0,0.3, 0,0.3,0,0.3, 0,0.3,0,0.3],
            crash:   [0.5,0,0,0,  0,0,0,0,    0,0,0,0,    0,0,0,0],
        },
        dnb: { label: 'Drum & Bass',
            kick:    [1,0,0,0,    0,0.8,0,0,  0,0,0.4,0,  0,0,0.3,0],
            snare:   [0,0,0,0,    0,0,0,0,    1,0,0,0,    0,0,0.3,0],
            hihat:   [0.9,0.6,0.9,0.6, 0.9,0.6,0.9,0.6, 0.9,0.6,0.9,0.6, 0.9,0.6,0.9,0.6],
            openhat: [0,0,0.4,0,  0,0.4,0,0,  0,0,0.4,0,  0,0.4,0,0],
            clap:    [0,0,0,0,    0,0,0,0,    0.7,0,0,0,  0,0,0,0],
            tom:     [0,0,0,0,    0,0,0,0.2,  0,0,0,0,    0,0,0,0.2],
            cowbell: [0,0,0,0,    0,0,0,0,    0,0,0,0,    0,0,0,0],
            crash:   [0.4,0,0,0,  0,0,0,0,    0,0,0,0,    0,0,0,0],
        },
        lofi: { label: 'Lo-fi',
            kick:    [0.9,0,0,0.2, 0,0.3,0,0, 0.7,0,0.2,0, 0,0,0.3,0],
            snare:   [0,0,0,0,    0.8,0,0,0.2, 0,0,0.2,0, 0.8,0,0,0.2],
            hihat:   [0.7,0,0.6,0, 0.7,0,0.6,0, 0.7,0,0.6,0, 0.7,0,0.6,0],
            openhat: [0,0,0,0,    0.3,0,0,0,  0,0,0,0,    0.3,0,0,0],
            clap:    [0,0,0,0,    0.5,0,0,0.2, 0,0,0.2,0, 0.5,0,0,0],
            tom:     [0,0,0,0,    0,0,0,0,    0,0,0,0,    0,0,0.2,0.2],
            cowbell: [0,0,0,0,    0,0,0,0,    0,0,0,0,    0,0,0,0],
            crash:   [0.2,0,0,0,  0,0,0,0,    0,0,0,0,    0,0,0,0],
        },
        reggae: { label: 'Reggae',
            kick:    [0,0,0,0,    0,0,0.3,0,  1,0,0,0,    0,0,0.3,0],
            snare:   [0,0,0,0,    0,0,0,0,    1,0,0,0,    0,0,0,0],
            hihat:   [0.9,0,0.9,0, 0.9,0,0.9,0, 0.9,0,0.9,0, 0.9,0,0.9,0],
            openhat: [0,0,0,0,    0.8,0,0,0,  0,0,0,0,    0.8,0,0,0],
            clap:    [0,0,0,0,    0,0,0,0,    0,0,0,0,    0,0,0,0],
            tom:     [0,0,0,0,    0,0,0,0,    0,0,0,0,    0,0,0,0],
            cowbell: [0.4,0,0,0,  0,0,0,0,    0,0,0,0,    0.4,0,0,0],
            crash:   [0,0,0,0,    0,0,0,0,    0,0,0,0,    0,0,0,0],
        },
    };

    const instrumentVolumes = {};
    const mutedInstruments = new Set();
    INSTRUMENTS.forEach(i => { instrumentVolumes[i.id] = 0.8; });

    // ══════════════════════════════════════════════════════════════════
    // Playback State
    // ══════════════════════════════════════════════════════════════════

    let bpm = 120;
    let stepsCount = 16;
    let swingAmount = 0;
    let isPlaying = false;

    const LOOKAHEAD_MS = 25;
    const SCHEDULE_AHEAD = 0.1;

    let schedulerTimer = null;
    let currentStep = 0;
    let nextNoteTime = 0;

    // ── Tap Tempo ──────────────────────────────────────────────────────
    let tapTimes = [];

    function handleTap() {
        const now = performance.now();
        if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > 2500) tapTimes = [];
        tapTimes.push(now);
        if (tapTimes.length > 8) tapTimes = tapTimes.slice(-8);
        if (tapTimes.length >= 2) {
            let total = 0;
            for (let i = 1; i < tapTimes.length; i++) total += tapTimes[i] - tapTimes[i - 1];
            bpm = Math.round(Math.max(40, Math.min(240, 60000 / (total / (tapTimes.length - 1)))));
            const bpmDisplay = document.getElementById('dm-bpm-display');
            const bpmSlider  = document.getElementById('dm-bpm-slider');
            if (bpmDisplay) bpmDisplay.value = bpm;
            if (bpmSlider)  bpmSlider.value  = bpm;
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // Patterns & Timeline
    // ══════════════════════════════════════════════════════════════════

    const patterns = {};
    let currentPatternId = null;
    let patternCounter = 0;

    const TIMELINE_SLOTS = 32;
    let timelineSlots = new Array(TIMELINE_SLOTS).fill(null);
    let timelineLoopActive = false;
    let currentTimelineSlot = -1;

    // ══════════════════════════════════════════════════════════════════
    // localStorage
    // ══════════════════════════════════════════════════════════════════

    const STORAGE_KEY = 'wavr-drum-machine-v2';

    function saveState() {
        try {
            const data = {
                bpm, stepsCount, swingAmount: Math.round(swingAmount * 100),
                currentKit, patternCounter, currentPatternId, timelineSlots,
                fx: { comp: {...fx.comp}, reverb: {...fx.reverb}, limiter: {...fx.limiter} },
                patterns: {},
            };
            Object.entries(patterns).forEach(([id, pat]) => {
                data.patterns[id] = { id: pat.id, name: pat.name, steps: {}, vel: {}, prob: {} };
                INSTRUMENTS.forEach(instr => {
                    data.patterns[id].steps[instr.id] = Array.from(pat.steps[instr.id] || []);
                    data.patterns[id].vel[instr.id]   = Array.from(pat.vel[instr.id] || []);
                    data.patterns[id].prob[instr.id]  = Array.from(pat.prob[instr.id] || []);
                });
            });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) { /* quota */ }
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            bpm        = data.bpm        || 120;
            stepsCount = data.stepsCount || 16;
            swingAmount = (data.swingAmount || 0) / 100;
            currentKit  = KITS[data.currentKit] ? data.currentKit : 'acoustic';
            patternCounter = data.patternCounter || 0;
            if (data.fx) {
                if (data.fx.comp)    Object.assign(fx.comp,    data.fx.comp);
                if (data.fx.reverb)  Object.assign(fx.reverb,  data.fx.reverb);
                if (data.fx.limiter) Object.assign(fx.limiter, data.fx.limiter);
            }
            Object.entries(data.patterns || {}).forEach(([id, pat]) => {
                patterns[id] = { id: pat.id, name: pat.name, steps: {}, vel: {}, prob: {} };
                INSTRUMENTS.forEach(instr => {
                    patterns[id].steps[instr.id] = Array.from({ length: stepsCount },
                        (_, i) => !!(pat.steps && pat.steps[instr.id] && pat.steps[instr.id][i]));
                    patterns[id].vel[instr.id] = Array.from({ length: stepsCount },
                        (_, i) => (pat.vel && pat.vel[instr.id] && pat.vel[instr.id][i] != null) ? pat.vel[instr.id][i] : 1.0);
                    patterns[id].prob[instr.id] = Array.from({ length: stepsCount },
                        (_, i) => (pat.prob && pat.prob[instr.id] && pat.prob[instr.id][i] != null) ? pat.prob[instr.id][i] : 100);
                });
            });
            timelineSlots = Array.from({ length: TIMELINE_SLOTS }, (_, i) => {
                const s = data.timelineSlots && data.timelineSlots[i];
                return (s && patterns[s]) ? s : null;
            });
            currentPatternId = (data.currentPatternId && patterns[data.currentPatternId])
                ? data.currentPatternId : (Object.keys(patterns)[0] || null);
            return Object.keys(patterns).length > 0;
        } catch (e) { return false; }
    }

    // ══════════════════════════════════════════════════════════════════
    // Drum Synthesis
    // ══════════════════════════════════════════════════════════════════

    function makeNoiseBuf(secs) {
        const frames = Math.ceil(ctx.sampleRate * secs);
        const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource(); src.buffer = buf; return src;
    }

    function playKick(time, vel) {
        if (playSample('kick', time, vel)) return;
        const v = instrumentVolumes.kick * vel;
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(160, time);
        osc.frequency.exponentialRampToValueAtTime(40, time + 0.08);
        g.gain.setValueAtTime(v, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.45);
        osc.connect(g); g.connect(masterGain); osc.start(time); osc.stop(time + 0.45);
        const c = ctx.createOscillator(); const cg = ctx.createGain();
        c.type = 'triangle'; c.frequency.setValueAtTime(900, time);
        c.frequency.exponentialRampToValueAtTime(100, time + 0.015);
        cg.gain.setValueAtTime(v * 0.7, time); cg.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
        c.connect(cg); cg.connect(masterGain); c.start(time); c.stop(time + 0.02);
    }

    function playSnare(time, vel) {
        if (playSample('snare', time, vel)) return;
        const v = instrumentVolumes.snare * vel;
        const osc = ctx.createOscillator(); const og = ctx.createGain();
        osc.type = 'triangle'; osc.frequency.setValueAtTime(200, time);
        osc.frequency.exponentialRampToValueAtTime(90, time + 0.15);
        og.gain.setValueAtTime(v * 0.5, time); og.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
        osc.connect(og); og.connect(masterGain); osc.start(time); osc.stop(time + 0.2);
        const n = makeNoiseBuf(0.22); const flt = ctx.createBiquadFilter(); const ng = ctx.createGain();
        flt.type = 'bandpass'; flt.frequency.value = 3500; flt.Q.value = 0.8;
        ng.gain.setValueAtTime(v * 0.9, time); ng.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
        n.connect(flt); flt.connect(ng); ng.connect(masterGain); n.start(time); n.stop(time + 0.22);
    }

    function playHihat(time, vel, open) {
        const id = open ? 'openhat' : 'hihat';
        if (playSample(id, time, vel)) return;
        const v = instrumentVolumes[id] * vel; const dur = open ? 0.5 : 0.07;
        const n = makeNoiseBuf(dur); const flt = ctx.createBiquadFilter(); const g = ctx.createGain();
        flt.type = 'highpass'; flt.frequency.value = 8000;
        g.gain.setValueAtTime(v * 0.35, time); g.gain.exponentialRampToValueAtTime(0.001, time + dur);
        n.connect(flt); flt.connect(g); g.connect(masterGain); n.start(time); n.stop(time + dur);
    }

    function playClap(time, vel) {
        if (playSample('clap', time, vel)) return;
        const v = instrumentVolumes.clap * vel;
        [0, 0.008, 0.016, 0.025].forEach((offset, i) => {
            const n = makeNoiseBuf(0.15); const flt = ctx.createBiquadFilter(); const g = ctx.createGain();
            flt.type = 'bandpass'; flt.frequency.value = 1400; flt.Q.value = 0.6;
            const peak = i === 3 ? v : v * 0.55; const decay = i === 3 ? 0.18 : 0.018;
            g.gain.setValueAtTime(peak, time + offset); g.gain.exponentialRampToValueAtTime(0.001, time + offset + decay);
            n.connect(flt); flt.connect(g); g.connect(masterGain);
            n.start(time + offset); n.stop(time + offset + decay + 0.01);
        });
    }

    function playTom(time, vel) {
        if (playSample('tom', time, vel)) return;
        const v = instrumentVolumes.tom * vel;
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(130, time);
        osc.frequency.exponentialRampToValueAtTime(55, time + 0.3);
        g.gain.setValueAtTime(v, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
        osc.connect(g); g.connect(masterGain); osc.start(time); osc.stop(time + 0.35);
    }

    function playCowbell(time, vel) {
        if (playSample('cowbell', time, vel)) return;
        const v = instrumentVolumes.cowbell * vel;
        [562, 845].forEach(f => {
            const osc = ctx.createOscillator(); const flt = ctx.createBiquadFilter(); const g = ctx.createGain();
            osc.type = 'square'; osc.frequency.value = f;
            flt.type = 'bandpass'; flt.frequency.value = f; flt.Q.value = 2.5;
            g.gain.setValueAtTime(v * 0.28, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.55);
            osc.connect(flt); flt.connect(g); g.connect(masterGain); osc.start(time); osc.stop(time + 0.55);
        });
    }

    function playCrash(time, vel) {
        if (playSample('crash', time, vel)) return;
        const v = instrumentVolumes.crash * vel;
        [420, 631, 835, 1046, 1287].forEach(f => {
            const osc = ctx.createOscillator(); const g = ctx.createGain();
            osc.type = 'sawtooth'; osc.frequency.value = f;
            g.gain.setValueAtTime(v * 0.06, time); g.gain.exponentialRampToValueAtTime(0.001, time + 1.2);
            osc.connect(g); g.connect(masterGain); osc.start(time); osc.stop(time + 1.2);
        });
        const n = makeNoiseBuf(1.2); const flt = ctx.createBiquadFilter(); const g = ctx.createGain();
        flt.type = 'highpass'; flt.frequency.value = 5000;
        g.gain.setValueAtTime(v * 0.28, time); g.gain.exponentialRampToValueAtTime(0.001, time + 1.2);
        n.connect(flt); flt.connect(g); g.connect(masterGain); n.start(time); n.stop(time + 1.2);
    }

    const PLAY_FN = {
        kick:    playKick,
        snare:   playSnare,
        hihat:   (t, v) => playHihat(t, v, false),
        openhat: (t, v) => playHihat(t, v, true),
        clap:    playClap,
        tom:     playTom,
        cowbell: playCowbell,
        crash:   playCrash,
    };

    // ══════════════════════════════════════════════════════════════════
    // Scheduler
    // ══════════════════════════════════════════════════════════════════

    function getStepDuration(step) {
        const base = 60.0 / bpm / 4;
        if (swingAmount > 0) return (step % 2 === 0) ? base * (1 + swingAmount) : base * (1 - swingAmount);
        return base;
    }

    function scheduleStep(step, time) {
        const pattern = patterns[currentPatternId];
        if (!pattern) return;
        INSTRUMENTS.forEach(instr => {
            if (mutedInstruments.has(instr.id)) return;
            if (!pattern.steps[instr.id] || !pattern.steps[instr.id][step]) return;
            const prob = (pattern.prob[instr.id] && pattern.prob[instr.id][step] != null) ? pattern.prob[instr.id][step] : 100;
            if (prob < 100 && Math.random() * 100 >= prob) return;
            const vel = (pattern.vel[instr.id] && pattern.vel[instr.id][step] != null) ? pattern.vel[instr.id][step] : 1.0;
            if (PLAY_FN[instr.id]) PLAY_FN[instr.id](time, vel);
        });
        const delay = Math.max(0, (time - ctx.currentTime) * 1000);
        setTimeout(() => { if (isPlaying) updateStepHighlight(step); }, delay);
    }

    function advanceStep() {
        nextNoteTime += getStepDuration(currentStep);
        currentStep = (currentStep + 1) % stepsCount;
        if (currentStep === 0 && timelineLoopActive) advanceTimelineSlot();
    }

    function scheduler() {
        while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
            scheduleStep(currentStep, nextNoteTime);
            advanceStep();
        }
        schedulerTimer = setTimeout(scheduler, LOOKAHEAD_MS);
    }

    // ══════════════════════════════════════════════════════════════════
    // Timeline
    // ══════════════════════════════════════════════════════════════════

    function advanceTimelineSlot() {
        let next = currentTimelineSlot + 1;
        while (next < TIMELINE_SLOTS && timelineSlots[next] === null) next++;
        if (next >= TIMELINE_SLOTS) {
            next = 0;
            while (next < TIMELINE_SLOTS && timelineSlots[next] === null) next++;
        }
        if (next < TIMELINE_SLOTS && timelineSlots[next]) {
            currentTimelineSlot = next;
            currentPatternId = timelineSlots[next];
            rebuildSequencerSteps();
            updatePatternSelect();
            renderTimeline();
        }
    }

    // ── Slot Picker ───────────────────────────────────────────────────

    let pickerTargetSlot = -1;

    function openSlotPicker(slotEl, slotIndex) {
        pickerTargetSlot = slotIndex;
        const picker = document.getElementById('dm-slot-picker');
        const optionsEl = document.getElementById('dm-slot-picker-options');
        const removeBtn = document.getElementById('dm-slot-picker-remove');
        if (!picker || !optionsEl) return;

        optionsEl.innerHTML = '';
        const patIds = Object.keys(patterns);
        const patColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FF9F43', '#A29BFE', '#FD79A8', '#55EFC4', '#FDCB6E'];
        patIds.forEach((id, idx) => {
            const btn = document.createElement('button');
            btn.className = 'dm-slot-picker-option';
            btn.textContent = patterns[id].name;
            btn.style.borderLeft = '3px solid ' + patColors[idx % patColors.length];
            if (timelineSlots[slotIndex] === id) btn.classList.add('active');
            btn.addEventListener('click', () => {
                timelineSlots[slotIndex] = id;
                renderTimeline();
                saveState();
                closeSlotPicker();
            });
            optionsEl.appendChild(btn);
        });

        removeBtn.style.display = timelineSlots[slotIndex] ? '' : 'none';
        removeBtn.onclick = () => {
            timelineSlots[slotIndex] = null;
            renderTimeline();
            saveState();
            closeSlotPicker();
        };

        // Position near the slot element
        const rect = slotEl.getBoundingClientRect();
        picker.style.display = 'block';
        const pickerH = Math.min(optionsEl.children.length * 36 + 60, 300);
        let top = rect.bottom + window.scrollY + 4;
        let left = rect.left + window.scrollX;
        // Keep within viewport
        if (left + 180 > window.innerWidth) left = window.innerWidth - 188;
        if (top + pickerH > window.scrollY + window.innerHeight) top = rect.top + window.scrollY - pickerH - 4;
        picker.style.top  = top + 'px';
        picker.style.left = left + 'px';
    }

    function closeSlotPicker() {
        const picker = document.getElementById('dm-slot-picker');
        if (picker) picker.style.display = 'none';
        pickerTargetSlot = -1;
    }

    // ══════════════════════════════════════════════════════════════════
    // Pattern Management
    // ══════════════════════════════════════════════════════════════════

    function createPattern(name) {
        const id = 'pat-' + (++patternCounter);
        const steps = {}, vel = {}, prob = {};
        INSTRUMENTS.forEach(instr => {
            steps[instr.id] = new Array(stepsCount).fill(false);
            vel[instr.id]   = new Array(stepsCount).fill(1.0);
            prob[instr.id]  = new Array(stepsCount).fill(100);
        });
        patterns[id] = { id, name: name || ('Pattern ' + patternCounter), steps, vel, prob };
        return id;
    }

    function loadPattern(id) {
        if (!patterns[id]) return;
        currentPatternId = id;
        rebuildSequencerSteps();
        const sel = document.getElementById('dm-pattern-select');
        if (sel) sel.value = id;
        const nameInput = document.getElementById('dm-pattern-name-input');
        if (nameInput) nameInput.value = patterns[id].name;
        renderTimeline();
    }

    // ── Step State Helpers ────────────────────────────────────────────

    function getStepState(pat, instrId, step) {
        if (!pat.steps[instrId] || !pat.steps[instrId][step]) return 'off';
        const v = (pat.vel[instrId] && pat.vel[instrId][step] != null) ? pat.vel[instrId][step] : 1.0;
        const p = (pat.prob[instrId] && pat.prob[instrId][step] != null) ? pat.prob[instrId][step] : 100;
        if (v < 0.8) return 'ghost';
        if (p === 75) return 'p75';
        if (p === 50) return 'p50';
        if (p === 25) return 'p25';
        return 'full';
    }

    function applyStepVisual(btn, instrId, step, pat) {
        const state = getStepState(pat, instrId, step);
        btn.className = btn.className
            .replace(/\s*(dm-step-active|dm-step-ghost|dm-step-prob)\S*/g, '').trim();
        delete btn.dataset.prob;
        if (state === 'off') return;
        btn.classList.add('dm-step-active');
        if (state === 'ghost') { btn.classList.add('dm-step-ghost'); return; }
        if (state !== 'full') {
            btn.classList.add('dm-step-prob');
            btn.dataset.prob = state.slice(1); // '75', '50', '25'
        }
    }

    function toggleStep(instrId, step) {
        const pat = patterns[currentPatternId];
        if (!pat) return;
        const on = pat.steps[instrId][step];
        pat.steps[instrId][step] = !on;
        if (!on) { pat.vel[instrId][step] = 1.0; pat.prob[instrId][step] = 100; }
        const stepsEl = document.getElementById('dm-steps-' + instrId);
        if (stepsEl) applyStepVisual(stepsEl.querySelectorAll('.dm-step-btn')[step], instrId, step, pat);
        saveState();
    }

    // Right-click cycles: off→full→ghost→p75→p50→p25→off
    function cycleStepState(instrId, step) {
        const pat = patterns[currentPatternId];
        if (!pat) return;
        const state = getStepState(pat, instrId, step);
        if (state === 'off') {
            pat.steps[instrId][step] = true; pat.vel[instrId][step] = 1.0; pat.prob[instrId][step] = 100;
        } else if (state === 'full') {
            pat.vel[instrId][step] = 0.4;
        } else if (state === 'ghost') {
            pat.vel[instrId][step] = 1.0; pat.prob[instrId][step] = 75;
        } else if (state === 'p75') {
            pat.prob[instrId][step] = 50;
        } else if (state === 'p50') {
            pat.prob[instrId][step] = 25;
        } else { // p25 → off
            pat.steps[instrId][step] = false; pat.vel[instrId][step] = 1.0; pat.prob[instrId][step] = 100;
        }
        const stepsEl = document.getElementById('dm-steps-' + instrId);
        if (stepsEl) applyStepVisual(stepsEl.querySelectorAll('.dm-step-btn')[step], instrId, step, pat);
        saveState();
    }

    function randomizeRow(instrId) {
        const pat = patterns[currentPatternId];
        if (!pat) return;
        const density = RAND_DENSITY[instrId] || 0.2;
        pat.steps[instrId] = Array.from({ length: stepsCount }, () => Math.random() < density);
        pat.vel[instrId]   = new Array(stepsCount).fill(1.0);
        pat.prob[instrId]  = new Array(stepsCount).fill(100);
        const stepsEl = document.getElementById('dm-steps-' + instrId);
        if (stepsEl) {
            stepsEl.querySelectorAll('.dm-step-btn').forEach((btn, i) => {
                applyStepVisual(btn, instrId, i, pat);
            });
        }
        saveState();
    }

    function generatePattern(styleId) {
        const pat = patterns[currentPatternId];
        if (!pat) return;
        const tmpl = STYLE_TEMPLATES[styleId];
        INSTRUMENTS.forEach(instr => {
            const probs = tmpl ? (tmpl[instr.id] || []) : null;
            pat.steps[instr.id] = Array.from({ length: stepsCount }, (_, i) => {
                const p = probs ? (probs[i % 16] || 0) : (RAND_DENSITY[instr.id] || 0.15);
                return Math.random() < p;
            });
            pat.vel[instr.id]  = new Array(stepsCount).fill(1.0);
            pat.prob[instr.id] = new Array(stepsCount).fill(100);
        });
        rebuildSequencerSteps();
        saveState();
    }

    function toggleMute(instrId) {
        mutedInstruments[mutedInstruments.has(instrId) ? 'delete' : 'add'](instrId);
        const row = document.querySelector('.dm-row[data-instrument="' + instrId + '"]');
        if (row) {
            row.classList.toggle('dm-row-muted', mutedInstruments.has(instrId));
            row.querySelector('.dm-mute-btn')?.classList.toggle('dm-muted', mutedInstruments.has(instrId));
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // UI Building
    // ══════════════════════════════════════════════════════════════════

    function buildSequencerUI() {
        const rows = document.getElementById('dm-sequencer-rows');
        if (!rows) return;
        rows.innerHTML = '';

        const nums = document.getElementById('dm-step-numbers');
        if (nums) {
            nums.innerHTML = '';
            for (let s = 0; s < stepsCount; s++) {
                const n = document.createElement('div');
                n.className = 'dm-step-num' + (s % 4 === 0 ? ' dm-beat-start' : '');
                n.textContent = s % 4 === 0 ? (s / 4 + 1) : '·';
                nums.appendChild(n);
            }
        }

        INSTRUMENTS.forEach(instr => {
            const row = document.createElement('div');
            row.className = 'dm-row' + (mutedInstruments.has(instr.id) ? ' dm-row-muted' : '');
            row.dataset.instrument = instr.id;

            // Label: [dot] [name] [M mute] [🎲 randomize]
            const label = document.createElement('div');
            label.className = 'dm-instrument-label';

            const dot = document.createElement('span');
            dot.className = 'dm-instr-dot'; dot.style.background = instr.color;

            const name = document.createElement('span');
            name.className = 'dm-instr-name'; name.textContent = instr.label;

            const muteBtn = document.createElement('button');
            muteBtn.className = 'dm-mute-btn' + (mutedInstruments.has(instr.id) ? ' dm-muted' : '');
            muteBtn.title = 'Mute'; muteBtn.textContent = 'M';
            muteBtn.addEventListener('click', () => toggleMute(instr.id));

            const randBtn = document.createElement('button');
            randBtn.className = 'dm-rand-btn'; randBtn.title = 'Randomize row';
            randBtn.textContent = '⚄';
            randBtn.addEventListener('click', () => randomizeRow(instr.id));

            label.appendChild(dot); label.appendChild(name); label.appendChild(muteBtn); label.appendChild(randBtn);

            // Steps
            const stepsEl = document.createElement('div');
            stepsEl.className = 'dm-steps'; stepsEl.id = 'dm-steps-' + instr.id;
            for (let s = 0; s < stepsCount; s++) {
                const btn = document.createElement('button');
                btn.className = 'dm-step-btn' + (s > 0 && s % 4 === 0 ? ' dm-group-start' : '');
                btn.dataset.step = s; btn.dataset.instrument = instr.id;
                btn.style.setProperty('--instr-color', instr.color);
                btn.addEventListener('click', function () { toggleStep(instr.id, parseInt(this.dataset.step)); });
                btn.addEventListener('contextmenu', function (e) {
                    e.preventDefault();
                    cycleStepState(instr.id, parseInt(this.dataset.step));
                });
                stepsEl.appendChild(btn);
            }

            // Volume
            const volWrap = document.createElement('div');
            volWrap.className = 'dm-row-vol';
            const vol = document.createElement('input');
            vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.01;
            vol.value = instrumentVolumes[instr.id]; vol.className = 'dm-vol-slider';
            vol.title = instr.label + ' volume';
            vol.addEventListener('input', function () { instrumentVolumes[instr.id] = parseFloat(this.value); });
            volWrap.appendChild(vol);

            row.appendChild(label); row.appendChild(stepsEl); row.appendChild(volWrap);
            rows.appendChild(row);
        });
    }

    function rebuildSequencerSteps() {
        const pat = patterns[currentPatternId];
        if (!pat) return;
        INSTRUMENTS.forEach(instr => {
            const stepsEl = document.getElementById('dm-steps-' + instr.id);
            if (!stepsEl) return;
            stepsEl.querySelectorAll('.dm-step-btn').forEach((btn, i) => {
                applyStepVisual(btn, instr.id, i, pat);
            });
        });
    }

    function updateStepHighlight(step) {
        document.querySelectorAll('.dm-step-btn.dm-playhead').forEach(el => el.classList.remove('dm-playhead'));
        if (step < 0 || step >= stepsCount) return;
        INSTRUMENTS.forEach(instr => {
            const stepsEl = document.getElementById('dm-steps-' + instr.id);
            if (!stepsEl) return;
            const btn = stepsEl.querySelectorAll('.dm-step-btn')[step];
            if (btn) btn.classList.add('dm-playhead');
        });
    }

    function updatePatternSelect() {
        const sel = document.getElementById('dm-pattern-select');
        if (!sel) return;
        sel.innerHTML = '';
        Object.values(patterns).forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id; opt.textContent = p.name; sel.appendChild(opt);
        });
        if (currentPatternId) sel.value = currentPatternId;
    }

    function renderTimeline() {
        const track = document.getElementById('dm-timeline-track');
        if (!track) return;
        track.innerHTML = '';
        const patIds = Object.keys(patterns);
        const patColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FF9F43', '#A29BFE', '#FD79A8', '#55EFC4', '#FDCB6E'];
        for (let i = 0; i < TIMELINE_SLOTS; i++) {
            const slot = document.createElement('div');
            slot.className = 'dm-timeline-slot';
            if (i === currentTimelineSlot) slot.classList.add('dm-timeline-slot-playing');
            const patId = timelineSlots[i];
            if (patId && patterns[patId]) {
                slot.classList.add('dm-timeline-slot-filled');
                slot.textContent = patterns[patId].name;
                const idx = patIds.indexOf(patId);
                slot.style.background = patColors[idx % patColors.length];
                slot.style.borderColor = patColors[idx % patColors.length];
                if (patId === currentPatternId) slot.classList.add('dm-timeline-slot-current-pat');
            } else {
                slot.textContent = (i + 1);
            }
            slot.dataset.slot = i;
            // Any click opens the picker
            slot.addEventListener('click', function (e) {
                e.stopPropagation();
                openSlotPicker(this, parseInt(this.dataset.slot));
            });
            track.appendChild(slot);
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // Transport
    // ══════════════════════════════════════════════════════════════════

    let playMode = null; // 'pattern' | 'timeline'

    function updateTransportButtons() {
        const patBtn  = document.getElementById('dm-play-pattern');
        const tlBtn   = document.getElementById('dm-play-timeline');
        const stopBtn = document.getElementById('dm-stop');
        if (patBtn)  { patBtn.classList.toggle('dm-active', playMode === 'pattern'); }
        if (tlBtn)   { tlBtn.classList.toggle('dm-active',  playMode === 'timeline'); }
        if (stopBtn) { stopBtn.disabled = !isPlaying; }
    }

    function play(mode) {
        if (mode === undefined) mode = playMode || 'pattern';
        // Pressing the already-active button while playing: no-op
        if (isPlaying && playMode === mode) return;
        // Switching mode while playing: hard-stop then restart
        if (isPlaying) {
            isPlaying = false;
            clearTimeout(schedulerTimer); schedulerTimer = null;
            currentStep = 0; currentTimelineSlot = -1;
            updateStepHighlight(-1);
        }
        initAudio();
        if (ctx.state === 'suspended') ctx.resume();
        playMode = mode;
        timelineLoopActive = (mode === 'timeline');
        isPlaying = true; currentStep = 0; nextNoteTime = ctx.currentTime + 0.05;
        if (timelineLoopActive) {
            const first = timelineSlots.findIndex(s => s !== null);
            if (first !== -1) { currentTimelineSlot = first; currentPatternId = timelineSlots[first]; rebuildSequencerSteps(); updatePatternSelect(); }
        }
        scheduler(); renderTimeline();
        updateTransportButtons();
    }

    function stop() {
        isPlaying = false; playMode = null;
        clearTimeout(schedulerTimer); schedulerTimer = null;
        currentStep = 0; currentTimelineSlot = -1;
        updateStepHighlight(-1); renderTimeline();
        updateTransportButtons();
    }

    // ══════════════════════════════════════════════════════════════════
    // Init
    // ══════════════════════════════════════════════════════════════════

    function syncUIToState() {
        const bpmDisplay  = document.getElementById('dm-bpm-display');
        const bpmSlider   = document.getElementById('dm-bpm-slider');
        const stepsSelect = document.getElementById('dm-steps-count');
        const swingSlider  = document.getElementById('dm-swing');
        const swingDisplay = document.getElementById('dm-swing-display');
        const kitSelect    = document.getElementById('dm-kit-select');
        if (bpmDisplay)   bpmDisplay.value  = bpm;
        if (bpmSlider)    bpmSlider.value   = bpm;
        if (stepsSelect)  stepsSelect.value = stepsCount;
        if (swingSlider)  swingSlider.value = Math.round(swingAmount * 100);
        if (swingDisplay) swingDisplay.textContent = Math.round(swingAmount * 100) + '%';
        if (kitSelect)    kitSelect.value   = currentKit;
        // FX controls
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        const setCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };
        setCheck('dm-comp-enable',    fx.comp.enabled);
        set('dm-comp-threshold',      fx.comp.threshold);    setText('dm-comp-thresh-val',  fx.comp.threshold);
        set('dm-comp-ratio',          fx.comp.ratio);        setText('dm-comp-ratio-val',   fx.comp.ratio);
        setCheck('dm-reverb-enable',  fx.reverb.enabled);
        set('dm-reverb-wet',          fx.reverb.wet);        setText('dm-reverb-wet-val',   fx.reverb.wet);
        set('dm-reverb-size',         fx.reverb.size);
        setCheck('dm-limiter-enable', fx.limiter.enabled);
        set('dm-limiter-threshold',   fx.limiter.threshold); setText('dm-limiter-ceil-val', fx.limiter.threshold);
    }

    function init() {
        const hadSavedState = loadState();

        if (!hadSavedState) {
            const id1 = createPattern('Pattern 1');
            [0, 4, 8, 12].forEach(s => { patterns[id1].steps.kick[s] = true; });
            [4, 12].forEach(s => { patterns[id1].steps.snare[s] = true; });
            [0, 2, 4, 6, 8, 10, 12, 14].forEach(s => { patterns[id1].steps.hihat[s] = true; });
            currentPatternId = id1;
        }

        buildSequencerUI();
        rebuildSequencerSteps();
        updatePatternSelect();
        renderTimeline();
        syncUIToState();

        // ── BPM ───────────────────────────────────────────────────────
        const bpmDisplay = document.getElementById('dm-bpm-display');
        const bpmSlider  = document.getElementById('dm-bpm-slider');
        if (bpmSlider) bpmSlider.addEventListener('input', function () {
            bpm = parseInt(this.value);
            if (bpmDisplay) bpmDisplay.value = bpm;
            saveState();
        });
        if (bpmDisplay) {
            // Update bpm live only when value is already in range; don't overwrite while typing
            bpmDisplay.addEventListener('input', function () {
                const v = parseInt(this.value);
                if (!isNaN(v) && v >= 40 && v <= 240) {
                    bpm = v;
                    if (bpmSlider) bpmSlider.value = v;
                    saveState();
                }
            });
            // Clamp + commit on blur or Enter
            const commitBPM = function () {
                const v = Math.max(40, Math.min(240, parseInt(this.value) || 120));
                bpm = v; this.value = v;
                if (bpmSlider) bpmSlider.value = v;
                saveState();
            };
            bpmDisplay.addEventListener('blur',    commitBPM);
            bpmDisplay.addEventListener('keydown', function (e) { if (e.key === 'Enter') this.blur(); });
        }

        // ── Tap ───────────────────────────────────────────────────────
        document.getElementById('dm-tap-tempo')?.addEventListener('click', handleTap);

        // ── Kit ───────────────────────────────────────────────────────
        document.getElementById('dm-kit-select')?.addEventListener('change', function () { switchKit(this.value); });

        // ── FX controls ───────────────────────────────────────────────
        const onFX = () => { applyFX(); saveState(); };

        document.getElementById('dm-comp-enable')?.addEventListener('change', function () { fx.comp.enabled = this.checked; onFX(); });
        document.getElementById('dm-comp-threshold')?.addEventListener('input', function () {
            fx.comp.threshold = parseInt(this.value);
            const el = document.getElementById('dm-comp-thresh-val'); if (el) el.textContent = this.value;
            onFX();
        });
        document.getElementById('dm-comp-ratio')?.addEventListener('input', function () {
            fx.comp.ratio = parseInt(this.value);
            const el = document.getElementById('dm-comp-ratio-val'); if (el) el.textContent = this.value;
            onFX();
        });

        document.getElementById('dm-reverb-enable')?.addEventListener('change', function () { fx.reverb.enabled = this.checked; onFX(); });
        document.getElementById('dm-reverb-wet')?.addEventListener('input', function () {
            fx.reverb.wet = parseInt(this.value);
            const el = document.getElementById('dm-reverb-wet-val'); if (el) el.textContent = this.value;
            onFX();
        });
        document.getElementById('dm-reverb-size')?.addEventListener('change', function () {
            fx.reverb.size = this.value;
            if (ctx) fxReverb.buffer = buildReverbIR(this.value);
            saveState();
        });

        document.getElementById('dm-limiter-enable')?.addEventListener('change', function () { fx.limiter.enabled = this.checked; onFX(); });
        document.getElementById('dm-limiter-threshold')?.addEventListener('input', function () {
            fx.limiter.threshold = parseFloat(this.value);
            const el = document.getElementById('dm-limiter-ceil-val'); if (el) el.textContent = this.value;
            onFX();
        });

        // ── Transport ─────────────────────────────────────────────────
        document.getElementById('dm-play-pattern')?.addEventListener('click', () => play('pattern'));
        document.getElementById('dm-play-timeline')?.addEventListener('click', () => play('timeline'));
        const stopBtn = document.getElementById('dm-stop');
        if (stopBtn) { stopBtn.addEventListener('click', stop); stopBtn.disabled = true; }

        document.addEventListener('keydown', function (e) {
            if (e.code !== 'Space') return;
            const dmPanel = document.getElementById('drum-machine-panel');
            if (!dmPanel || dmPanel.style.display === 'none') return;
            e.preventDefault();
            isPlaying ? stop() : play('pattern');
        });

        // ── Steps ─────────────────────────────────────────────────────
        document.getElementById('dm-steps-count')?.addEventListener('change', function () {
            const n = parseInt(this.value);
            if (n === stepsCount) return;
            if (isPlaying) stop();
            stepsCount = n;
            Object.values(patterns).forEach(p => {
                INSTRUMENTS.forEach(instr => {
                    const oldS = p.steps[instr.id] || [], oldV = p.vel[instr.id] || [], oldP = p.prob[instr.id] || [];
                    p.steps[instr.id] = Array.from({ length: stepsCount }, (_, i) => oldS[i] || false);
                    p.vel[instr.id]   = Array.from({ length: stepsCount }, (_, i) => oldV[i] != null ? oldV[i] : 1.0);
                    p.prob[instr.id]  = Array.from({ length: stepsCount }, (_, i) => oldP[i] != null ? oldP[i] : 100);
                });
            });
            buildSequencerUI(); rebuildSequencerSteps(); saveState();
        });

        // ── Swing ─────────────────────────────────────────────────────
        const swingSlider  = document.getElementById('dm-swing');
        const swingDisplay = document.getElementById('dm-swing-display');
        if (swingSlider) swingSlider.addEventListener('input', function () { swingAmount = parseInt(this.value) / 100; if (swingDisplay) swingDisplay.textContent = this.value + '%'; saveState(); });

        // ── Patterns ──────────────────────────────────────────────────
        document.getElementById('dm-pattern-select')?.addEventListener('change', function () { loadPattern(this.value); saveState(); });

        const patNameInput = document.getElementById('dm-pattern-name-input');
        if (patNameInput) {
            if (currentPatternId && patterns[currentPatternId]) patNameInput.value = patterns[currentPatternId].name;
            patNameInput.addEventListener('input', function () { if (patterns[currentPatternId]) { patterns[currentPatternId].name = this.value; updatePatternSelect(); renderTimeline(); saveState(); } });
        }

        // ── Generate ──────────────────────────────────────────────────
        document.getElementById('dm-generate-btn')?.addEventListener('click', function () {
            const styleId = document.getElementById('dm-style-select')?.value || 'house';
            generatePattern(styleId);
        });

        document.getElementById('dm-new-pattern')?.addEventListener('click', function () { const nid = createPattern('Pattern ' + patternCounter); updatePatternSelect(); loadPattern(nid); saveState(); });
        document.getElementById('dm-copy-pattern')?.addEventListener('click', function () {
            const src = patterns[currentPatternId]; if (!src) return;
            const nid = createPattern(src.name + ' Copy');
            INSTRUMENTS.forEach(instr => { patterns[nid].steps[instr.id] = [...src.steps[instr.id]]; patterns[nid].vel[instr.id] = [...src.vel[instr.id]]; patterns[nid].prob[instr.id] = [...src.prob[instr.id]]; });
            updatePatternSelect(); loadPattern(nid); saveState();
        });
        document.getElementById('dm-delete-pattern')?.addEventListener('click', function () {
            const ids = Object.keys(patterns); if (ids.length <= 1) return;
            const idx = ids.indexOf(currentPatternId); const dying = currentPatternId;
            delete patterns[dying]; timelineSlots = timelineSlots.map(s => (s === dying ? null : s));
            loadPattern(Object.keys(patterns)[Math.max(0, idx - 1)] || Object.keys(patterns)[0]);
            updatePatternSelect(); renderTimeline(); saveState();
        });

        // ── Timeline ──────────────────────────────────────────────────
        document.getElementById('dm-save-to-timeline')?.addEventListener('click', function () { const empty = timelineSlots.findIndex(s => s === null); if (empty !== -1) { timelineSlots[empty] = currentPatternId; renderTimeline(); saveState(); } });
        document.getElementById('dm-timeline-loop')?.addEventListener('change', function () { timelineLoopActive = this.checked; });
        document.getElementById('dm-timeline-clear')?.addEventListener('click', function () { timelineSlots.fill(null); renderTimeline(); saveState(); });

        // Close slot picker on outside click
        document.addEventListener('click', function (e) {
            const picker = document.getElementById('dm-slot-picker');
            if (picker && picker.style.display !== 'none' && !picker.contains(e.target)) closeSlotPicker();
        });

        // ── Tab switching ─────────────────────────────────────────────
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                const tab = this.dataset.tab;
                const thereminPanel = document.getElementById('theremin-panel');
                const drumPanel     = document.getElementById('drum-machine-panel');
                if (tab === 'theremin') {
                    if (thereminPanel) thereminPanel.style.display = '';
                    if (drumPanel)     drumPanel.style.display = 'none';
                } else {
                    if (thereminPanel) thereminPanel.style.display = 'none';
                    if (drumPanel)     drumPanel.style.display = '';
                }
            });
        });
    }

    return { init };

})();

DrumMachine.init();
