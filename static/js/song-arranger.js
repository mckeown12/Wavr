/* ════════════════════════════════════════════════════════════════════
   Song Arranger — chord progressions, sections, song arrangement
   ════════════════════════════════════════════════════════════════════ */
const SongArranger = (function () {

    // ── Note / Chord Math ─────────────────────────────────────────────
    const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

    const CHORD_INTERVALS = {
        'maj':  [0,4,7],       'min':  [0,3,7],
        '7':    [0,4,7,10],    'maj7': [0,4,7,11],    'min7': [0,3,7,10],
        'dim':  [0,3,6],       'aug':  [0,4,8],
        'sus2': [0,2,7],       'sus4': [0,5,7],
        'add9': [0,4,7,14],    'min9': [0,3,7,10,14], 'maj9': [0,4,7,11,14],
        '6':    [0,4,7,9],     'min6': [0,3,7,9],
        'dim7': [0,3,6,9],     'hdim7':[0,3,6,10],
    };

    const CHORD_DISPLAY = {
        'maj':'', 'min':'m', '7':'7', 'maj7':'maj7', 'min7':'m7',
        'dim':'°', 'aug':'+', 'sus2':'sus2', 'sus4':'sus4',
        'add9':'add9', 'min9':'m9', 'maj9':'maj9',
        '6':'6', 'min6':'m6', 'dim7':'°7', 'hdim7':'ø7',
    };

    const CHORD_TYPES_ORDERED = [
        'maj','min','7','maj7','min7','dim','aug','sus2','sus4','add9','min9','maj9','6','min6','dim7','hdim7'
    ];

    function midiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

    function getChordNotes(root, type, octave) {
        const ri = NOTE_NAMES.indexOf(root);
        if (ri === -1) return [];
        const base = (octave + 1) * 12 + ri;
        return (CHORD_INTERVALS[type] || CHORD_INTERVALS['maj']).map(i => base + i);
    }

    function chordLabel(root, type) {
        return root + (CHORD_DISPLAY[type] !== undefined ? CHORD_DISPLAY[type] : type);
    }

    // ── Preset Progressions ───────────────────────────────────────────
    const PRESETS = {
        'pop-major':    { name: 'Pop — I V vi IV',          chords: [{s:0,t:'maj',b:1},{s:7,t:'maj',b:1},{s:9,t:'min',b:1},{s:5,t:'maj',b:1}] },
        'pop-minor':    { name: 'Minor Pop — i VI III VII',  chords: [{s:0,t:'min',b:1},{s:8,t:'maj',b:1},{s:3,t:'maj',b:1},{s:10,t:'maj',b:1}] },
        'doo-wop':      { name: 'Doo-Wop — I vi IV V',       chords: [{s:0,t:'maj',b:1},{s:9,t:'min',b:1},{s:5,t:'maj',b:1},{s:7,t:'maj',b:1}] },
        'blues': { name: '12-Bar Blues', chords: [
            {s:0,t:'7',b:1},{s:0,t:'7',b:1},{s:0,t:'7',b:1},{s:0,t:'7',b:1},
            {s:5,t:'7',b:1},{s:5,t:'7',b:1},{s:0,t:'7',b:1},{s:0,t:'7',b:1},
            {s:7,t:'7',b:1},{s:5,t:'7',b:1},{s:0,t:'7',b:1},{s:7,t:'7',b:1}
        ]},
        'jazz-ii-V-I':  { name: 'Jazz — ii⁷ V⁷ Imaj7',      chords: [{s:2,t:'min7',b:2},{s:7,t:'7',b:2},{s:0,t:'maj7',b:4}] },
        'sad':          { name: 'Sad — i v VI III',           chords: [{s:0,t:'min',b:1},{s:7,t:'min',b:1},{s:8,t:'maj',b:1},{s:3,t:'maj',b:1}] },
        'flamenco':     { name: 'Flamenco — i VII VI V',      chords: [{s:0,t:'min',b:1},{s:10,t:'maj',b:1},{s:8,t:'maj',b:1},{s:7,t:'maj',b:1}] },
        'bossa':        { name: 'Bossa Nova',                 chords: [{s:2,t:'min7',b:2},{s:7,t:'7',b:2},{s:0,t:'maj7',b:2},{s:11,t:'min7b5',b:2}] },
        'andalusian':   { name: 'Andalusian Cadence',         chords: [{s:0,t:'min',b:2},{s:10,t:'maj',b:2},{s:8,t:'maj',b:2},{s:7,t:'7',b:2}] },
        'circle-of-5ths':{ name: 'Circle — I IV VII III',    chords: [{s:0,t:'maj7',b:2},{s:5,t:'maj7',b:2},{s:10,t:'7',b:2},{s:4,t:'min7',b:2}] },
    };

    const SECTION_COLORS = ['#4ECDC4','#FF6B6B','#A29BFE','#FF9F43','#55EFC4','#FD79A8','#74B9FF','#FDCB6E'];
    const SECTION_TYPES  = ['Verse','Chorus','Bridge','Intro','Outro','Pre-Chorus','Break','Solo','Interlude'];

    // ── SA Piano Roll Config + Voice Presets ──────────────────────────
    const SA_INSTR_CONFIG = {
        piano:   { label: 'Piano',   color: '#A29BFE', minPitch: 48, maxPitch: 71,
                   voices: [{id:'piano',   label:'Piano'}, {id:'rhodes',  label:'Rhodes'}] },
        guitar:  { label: 'Guitar',  color: '#FF9F43', minPitch: 40, maxPitch: 63,
                   voices: [{id:'guitar',  label:'Guitar'},{id:'pluck',   label:'Pluck'}] },
        bass:    { label: 'Bass',    color: '#FF6B6B', minPitch: 28, maxPitch: 51,
                   voices: [{id:'bass',    label:'Bass'},  {id:'punch',   label:'Punch'}] },
        pad:     { label: 'Pad',     color: '#45B7D1', minPitch: 36, maxPitch: 59,
                   voices: [{id:'pad',     label:'Pad'},   {id:'organ',   label:'Organ'}] },
        strings: { label: 'Strings', color: '#55EFC4', minPitch: 48, maxPitch: 71,
                   voices: [{id:'strings', label:'Strings'},{id:'pizz',   label:'Pizz'}] },
    };
    const SA_BLACK_KEYS   = new Set([1, 3, 6, 8, 10]);
    const MAJOR_SCALE_INT = [0, 2, 4, 5, 7, 9, 11];

    // Chord type → nearest named theremin scale
    const CHORD_TO_SCALE = {
        'maj':'major', 'min':'minor', '7':'mixolydian', 'maj7':'major',
        'min7':'dorian', 'dim':'pent_minor', 'aug':'whole_tone',
        'sus2':'major', 'sus4':'major', 'add9':'major', 'min9':'dorian',
        'maj9':'major', '6':'major', 'min6':'dorian', 'dim7':'pent_minor', 'hdim7':'minor',
    };

    // ── SA Piano Roll State ───────────────────────────────────────────
    const saPR = { instrId: null, secId: null, dragActive: false, dragState: null };
    const noteResize = { active: false, noteEl: null, pitch: -1, step: -1, startX: 0, startDur: 1 };
    let saCurrentNoteDur = 1;

    // ── Theremin Sync State ───────────────────────────────────────────
    let thereminSync     = false;  // whether to update AudioEngine scale on chord change
    let thereminSyncMode = 'chord'; // 'chord' = snap to chord tones | 'scale' = nearest named scale

    // ── App State ─────────────────────────────────────────────────────
    let bpm = 120;
    let rootKey = 'A';
    let progressions = {};
    let sections = {};
    let arrangement = [];
    let progCounter = 0;
    let secCounter  = 0;
    let currentSectionId = null;
    let pickerChordIdx   = null;

    // ── Audio ─────────────────────────────────────────────────────────
    let ctx = null;
    let masterGain = null;
    let killGain   = null;
    let killRestoreTimer = null;
    let isPlaying = false;
    let schedulerTimer = null;
    let nextBarTime = 0;
    let currentArrIdx = 0;
    let currentBarInSec = 0;

    const LOOKAHEAD_MS   = 25;
    const SCHEDULE_AHEAD = 0.2;

    function initAudio() {
        if (ctx) return;
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = ctx.createGain();
        masterGain.gain.value = 0.65;

        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.ratio.value = 3;
        comp.knee.value = 6; comp.attack.value = 0.005; comp.release.value = 0.25;
        const lim = ctx.createDynamicsCompressor();
        lim.threshold.value = -2; lim.ratio.value = 20;
        lim.knee.value = 0; lim.attack.value = 0.001; lim.release.value = 0.08;

        killGain = ctx.createGain();
        killGain.gain.value = 1.0;

        masterGain.connect(comp);
        comp.connect(lim);
        lim.connect(killGain);
        killGain.connect(ctx.destination);
    }

    // ── Instrument Synthesis ──────────────────────────────────────────

    function piano(notes, t, dur, vel) {
        notes.forEach(midi => {
            const f = midiToFreq(midi);
            const det = 1 + (Math.random() - 0.5) * 0.002; // slight random detune
            [[f*det,'triangle',1.0],[f*2*det,'sine',0.3],[f*0.5,'sine',0.12]].forEach(([freq, type, amp]) => {
                const osc = ctx.createOscillator();
                const g   = ctx.createGain();
                osc.type = type; osc.frequency.value = freq;
                g.gain.setValueAtTime(0, t);
                g.gain.linearRampToValueAtTime(vel * amp * 0.7, t + 0.008);
                g.gain.exponentialRampToValueAtTime(vel * amp * 0.28, t + 0.35);
                g.gain.setValueAtTime(vel * amp * 0.28, t + dur - 0.08);
                g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.12);
                osc.connect(g); g.connect(masterGain);
                osc.start(t); osc.stop(t + dur + 0.2);
            });
        });
    }

    function rhodesKeys(notes, t, dur, vel) {
        // FM-based electric piano (Rhodes/Wurlitzer character)
        notes.forEach(midi => {
            const f = midiToFreq(midi);
            const osc     = ctx.createOscillator();
            const mod     = ctx.createOscillator();
            const modGain = ctx.createGain();
            const g       = ctx.createGain();
            osc.type = 'sine'; osc.frequency.value = f;
            mod.type = 'sine'; mod.frequency.value = f * 7;
            modGain.gain.setValueAtTime(vel * 60, t);
            modGain.gain.exponentialRampToValueAtTime(vel * 4, t + 0.45);
            modGain.gain.linearRampToValueAtTime(0.0001, t + dur + 0.3);
            mod.connect(modGain); modGain.connect(osc.frequency);
            g.gain.setValueAtTime(vel * 0.7, t);
            g.gain.exponentialRampToValueAtTime(vel * 0.22, t + 0.5);
            g.gain.setValueAtTime(vel * 0.22, t + dur - 0.08);
            g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.2);
            osc.connect(g); g.connect(masterGain);
            mod.start(t); osc.start(t);
            mod.stop(t + dur + 0.35); osc.stop(t + dur + 0.35);
        });
    }

    function guitar(notes, t, dur, vel) {
        notes.forEach((midi, i) => {
            const f  = midiToFreq(midi);
            const td = t + i * 0.018;
            const osc = ctx.createOscillator();
            const flt = ctx.createBiquadFilter();
            const g   = ctx.createGain();
            osc.type = 'sawtooth'; osc.frequency.value = f;
            flt.type = 'lowpass'; flt.frequency.value = 2400; flt.Q.value = 0.8;
            g.gain.setValueAtTime(0, td);
            g.gain.linearRampToValueAtTime(vel * 0.45, td + 0.018);
            g.gain.exponentialRampToValueAtTime(vel * 0.12, td + 0.28);
            g.gain.setValueAtTime(vel * 0.12, td + dur - 0.08);
            g.gain.linearRampToValueAtTime(0.0001, td + dur + 0.05);
            osc.connect(flt); flt.connect(g); g.connect(masterGain);
            osc.start(td); osc.stop(td + dur + 0.1);
        });
    }

    function guitarMuted(notes, t, dur, vel) {
        // Pluck / muted guitar — bright attack with fast exponential decay
        notes.forEach((midi, i) => {
            const f  = midiToFreq(midi);
            const td = t + i * 0.012;
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const flt  = ctx.createBiquadFilter();
            const g    = ctx.createGain();
            osc1.type = 'sawtooth'; osc1.frequency.value = f;
            osc2.type = 'square';   osc2.frequency.value = f * 2;
            flt.type = 'lowpass';
            flt.frequency.setValueAtTime(f * 14, td);
            flt.frequency.exponentialRampToValueAtTime(f * 2.5, td + 0.08);
            flt.Q.value = 1.2;
            g.gain.setValueAtTime(vel * 0.85, td);
            g.gain.exponentialRampToValueAtTime(0.0001, td + Math.min(0.35, dur));
            osc1.connect(flt); osc2.connect(flt); flt.connect(g); g.connect(masterGain);
            osc1.start(td); osc2.start(td);
            osc1.stop(td + 0.45); osc2.stop(td + 0.45);
        });
    }

    function bass(root, t, dur, vel) {
        const f = midiToFreq(root);
        const beat = (60 / bpm);
        [[0, f],[2*beat, midiToFreq(root + 7)]].forEach(([offset, freq]) => {
            if (offset >= dur) return;
            const osc = ctx.createOscillator();
            const sub = ctx.createOscillator();
            const g   = ctx.createGain();
            osc.type = 'triangle'; osc.frequency.value = freq;
            sub.type = 'sine';     sub.frequency.value = freq * 0.5;
            g.gain.setValueAtTime(vel * 0.85, t + offset);
            g.gain.exponentialRampToValueAtTime(0.0001, t + offset + Math.min(beat * 1.8, dur - offset));
            osc.connect(g); sub.connect(g); g.connect(masterGain);
            const end = t + offset + Math.min(beat * 1.8, dur - offset) + 0.05;
            osc.start(t + offset); osc.stop(end);
            sub.start(t + offset); sub.stop(end);
        });
    }

    function bassPunch(root, t, dur, vel) {
        // Synth bass: square + filter envelope, walking pattern
        const beat = 60 / bpm;
        [[0, root],[2*beat, root + 7]].forEach(([offset, midi]) => {
            if (offset >= dur) return;
            const f   = midiToFreq(midi);
            const osc = ctx.createOscillator();
            const flt = ctx.createBiquadFilter();
            const g   = ctx.createGain();
            osc.type = 'square'; osc.frequency.value = f;
            flt.type = 'lowpass';
            flt.frequency.setValueAtTime(f * 10, t + offset);
            flt.frequency.exponentialRampToValueAtTime(f * 1.8, t + offset + 0.09);
            flt.Q.value = 2.5;
            g.gain.setValueAtTime(vel * 0.9, t + offset);
            g.gain.exponentialRampToValueAtTime(vel * 0.15, t + offset + 0.18);
            g.gain.exponentialRampToValueAtTime(0.0001, t + offset + Math.min(beat * 1.5, dur - offset));
            osc.connect(flt); flt.connect(g); g.connect(masterGain);
            const end = t + offset + Math.min(beat * 1.5, dur - offset) + 0.05;
            osc.start(t + offset); osc.stop(end);
        });
    }

    function pad(notes, t, dur, vel) {
        notes.slice(0, 4).forEach(midi => {
            [0.993, 1.000, 1.007].forEach(detune => {
                const osc = ctx.createOscillator();
                const flt = ctx.createBiquadFilter();
                const g   = ctx.createGain();
                osc.type = 'sawtooth'; osc.frequency.value = midiToFreq(midi) * detune;
                flt.type = 'lowpass';  flt.frequency.value = 900; flt.Q.value = 0.4;
                g.gain.setValueAtTime(0, t);
                g.gain.linearRampToValueAtTime(vel * 0.22, t + 0.7);
                g.gain.setValueAtTime(vel * 0.22, t + dur - 0.4);
                g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
                osc.connect(flt); flt.connect(g); g.connect(masterGain);
                osc.start(t); osc.stop(t + dur + 0.8);
            });
        });
    }

    function organKeys(notes, t, dur, vel) {
        // Hammond-style additive organ — no attack/release envelope (just click)
        notes.slice(0, 4).forEach(midi => {
            const f = midiToFreq(midi);
            [1, 2, 3, 4, 5, 6, 8].forEach((harm, i) => {
                const amps = [0.8, 0.65, 0.5, 0.32, 0.18, 0.12, 0.08];
                const osc = ctx.createOscillator();
                const g   = ctx.createGain();
                osc.type = 'sine'; osc.frequency.value = f * harm;
                g.gain.setValueAtTime(0, t);
                g.gain.linearRampToValueAtTime(vel * amps[i] * 0.28, t + 0.005);
                g.gain.setValueAtTime(vel * amps[i] * 0.28, t + dur - 0.008);
                g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.015);
                osc.connect(g); g.connect(masterGain);
                osc.start(t); osc.stop(t + dur + 0.04);
            });
        });
    }

    function strings(notes, t, dur, vel) {
        notes.forEach(midi => {
            const f = midiToFreq(midi);
            [0, 12].forEach(oct => {
                const osc = ctx.createOscillator();
                const flt = ctx.createBiquadFilter();
                const g   = ctx.createGain();
                osc.type = 'sawtooth'; osc.frequency.value = f * Math.pow(2, oct/12);
                flt.type = 'lowpass';  flt.frequency.value = 1600; flt.Q.value = 0.3;
                g.gain.setValueAtTime(0, t);
                g.gain.linearRampToValueAtTime(vel * 0.18, t + 1.2);
                g.gain.setValueAtTime(vel * 0.18, t + dur - 0.6);
                g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.8);
                osc.connect(flt); flt.connect(g); g.connect(masterGain);
                osc.start(t); osc.stop(t + dur + 1.0);
            });
        });
    }

    function pizzicato(notes, t, dur, vel) {
        // Short, plucked strings
        notes.forEach(midi => {
            const f = midiToFreq(midi);
            const osc = ctx.createOscillator();
            const flt = ctx.createBiquadFilter();
            const g   = ctx.createGain();
            osc.type = 'sawtooth'; osc.frequency.value = f;
            flt.type = 'lowpass'; flt.frequency.value = f * 3.5; flt.Q.value = 0.7;
            const pizzDur = Math.min(0.08 + 55 / f, 0.45);
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(vel * 0.65, t + 0.005);
            g.gain.exponentialRampToValueAtTime(0.0001, t + pizzDur);
            osc.connect(flt); flt.connect(g); g.connect(masterGain);
            osc.start(t); osc.stop(t + pizzDur + 0.06);
        });
    }

    // ── Voice dispatcher (routes to synthesis fn based on voice id) ──

    function callChordVoice(instrId, notes, t, dur, vel, voice) {
        switch (instrId) {
            case 'piano':   (voice === 'rhodes' ? rhodesKeys : piano)(notes, t, dur, vel); break;
            case 'guitar':  (voice === 'pluck'  ? guitarMuted : guitar)(notes, t, dur, vel); break;
            case 'pad':     (voice === 'organ'  ? organKeys  : pad)(notes, t, dur, vel); break;
            case 'strings': (voice === 'pizz'   ? pizzicato  : strings)(notes, t, dur, vel); break;
        }
    }

    // Single-note playback for piano roll patterns
    function playSingleNote(instrId, pitch, t, dur, vel, voice) {
        if (!ctx) return;
        switch (instrId) {
            case 'piano':   callChordVoice('piano',   [pitch], t, dur, vel, voice); break;
            case 'guitar':  callChordVoice('guitar',  [pitch], t, dur, vel, voice); break;
            case 'pad':     callChordVoice('pad',     [pitch], t, dur, vel, voice); break;
            case 'strings': callChordVoice('strings', [pitch], t, dur, vel, voice); break;
            case 'bass': {
                const f = midiToFreq(pitch);
                if (voice === 'punch') {
                    const osc = ctx.createOscillator();
                    const flt = ctx.createBiquadFilter();
                    const g   = ctx.createGain();
                    osc.type = 'square'; osc.frequency.value = f;
                    flt.type = 'lowpass';
                    flt.frequency.setValueAtTime(f * 10, t);
                    flt.frequency.exponentialRampToValueAtTime(f * 1.8, t + 0.08);
                    flt.Q.value = 2.5;
                    g.gain.setValueAtTime(vel, t);
                    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
                    osc.connect(flt); flt.connect(g); g.connect(masterGain);
                    osc.start(t); osc.stop(t + dur + 0.08);
                } else {
                    const osc = ctx.createOscillator();
                    const sub = ctx.createOscillator();
                    const g   = ctx.createGain();
                    osc.type = 'triangle'; osc.frequency.value = f;
                    sub.type = 'sine';     sub.frequency.value = f * 0.5;
                    g.gain.setValueAtTime(vel, t);
                    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
                    osc.connect(g); sub.connect(g); g.connect(masterGain);
                    osc.start(t); osc.stop(t + dur + 0.08);
                    sub.start(t); sub.stop(t + dur + 0.08);
                }
                break;
            }
        }
    }

    // ── Note pitch / range helpers ────────────────────────────────────

    function adjustToRange(pitch, cfg) {
        while (pitch < cfg.minPitch) pitch += 12;
        while (pitch > cfg.maxPitch) pitch -= 12;
        return (pitch >= cfg.minPitch && pitch <= cfg.maxPitch) ? pitch : null;
    }

    // ── Theremin sync helpers ─────────────────────────────────────────

    function chordRootToMidi(root) {
        const idx = NOTE_NAMES.indexOf(root);
        return idx !== -1 ? 60 + idx : 60; // C4 baseline
    }

    function updateThereminScale(chord) {
        if (!chord || !thereminSync || typeof AudioEngine === 'undefined') return;
        if (thereminSyncMode === 'chord') {
            // Snap to chord tones only (e.g. Am → pitch classes 9, 0, 4)
            const rootIdx  = NOTE_NAMES.indexOf(chord.root);
            const intervals = CHORD_INTERVALS[chord.type] || CHORD_INTERVALS['maj'];
            const pitchClasses = intervals.map(i => (rootIdx + i) % 12);
            AudioEngine.setCustomScaleNotes(pitchClasses);
            AudioEngine.setRootNote(chordRootToMidi(chord.root));
        } else {
            // 'scale' mode: map chord quality to nearest named scale
            AudioEngine.setScale(CHORD_TO_SCALE[chord.type] || 'major');
            AudioEngine.setRootNote(chordRootToMidi(chord.root));
        }
    }

    // ── SA Piano Roll pixel helpers ───────────────────────────────────

    function stepToX(step) { return step * 14 + Math.floor(step / 16) * 4; }

    function durToWidth(startStep, dur) {
        return Math.max(10, stepToX(startStep + dur) - stepToX(startStep) - 2);
    }

    function renderNoteBlock(note, color) {
        const el = document.createElement('div');
        el.className = 'sa-pr-note-block';
        el.dataset.pitch = note.pitch;
        el.dataset.step  = note.step;
        el.dataset.dur   = note.dur || 1;
        el.style.setProperty('--instr-color', color);
        el.style.left  = stepToX(note.step) + 'px';
        el.style.width = durToWidth(note.step, note.dur || 1) + 'px';
        const rh = document.createElement('div');
        rh.className = 'sa-pr-note-resize';
        el.appendChild(rh);
        return el;
    }

    // ── Scheduling ────────────────────────────────────────────────────

    function getBarDuration() { return (60 / bpm) * 4; }

    function getTotalBarsInSection(sec) {
        const prog = progressions[sec.progressionId];
        if (!prog) return 4;
        return prog.chords.reduce((s, c) => s + (c.bars || 1), 0);
    }

    function getChordAtBar(sec, barIdx) {
        const prog = progressions[sec.progressionId];
        if (!prog || !prog.chords.length) return null;
        const totalBars = getTotalBarsInSection(sec);
        const wrapped = barIdx % totalBars;
        let acc = 0;
        for (const chord of prog.chords) {
            acc += (chord.bars || 1);
            if (wrapped < acc) return chord;
        }
        return prog.chords[0];
    }

    function scheduleChords(sec, chord, barIdx, t, barDur) {
        if (!chord) return;
        const inst      = sec.instruments || {};
        const stepDur   = barDur / 16;
        const totalBars = getTotalBarsInSection(sec);
        const patBar    = barIdx % totalBars;
        const stepStart = patBar * 16;

        function tryPattern(instrId, defaultFn) {
            const instr = inst[instrId];
            if (!instr?.enabled) return;
            const pat   = instr.notePattern;
            const voice = instr.voice || 'default';
            if (pat?.active && pat.steps?.length) {
                pat.steps.forEach(({ pitch, step, dur: noteDur, vel: nv }) => {
                    if (step >= stepStart && step < stepStart + 16) {
                        playSingleNote(instrId, pitch,
                            t + (step - stepStart) * stepDur,
                            (noteDur || 1) * stepDur * 0.96,
                            (nv ?? 1.0) * (instr.vel ?? 0.7),
                            voice);
                    }
                });
            } else {
                defaultFn(voice);
            }
        }

        const rootMidi = 5 * 12 + NOTE_NAMES.indexOf(chord.root);
        tryPattern('piano',   (v) => callChordVoice('piano',   getChordNotes(chord.root, chord.type, 4), t, barDur, inst.piano?.vel   ?? 0.65, v));
        tryPattern('guitar',  (v) => callChordVoice('guitar',  getChordNotes(chord.root, chord.type, 4), t, barDur, inst.guitar?.vel  ?? 0.55, v));
        tryPattern('bass',    (v) => (v === 'punch' ? bassPunch : bass)(rootMidi - 24, t, barDur, inst.bass?.vel ?? 0.75));
        tryPattern('pad',     (v) => callChordVoice('pad',     getChordNotes(chord.root, chord.type, 3), t, barDur, inst.pad?.vel     ?? 0.45, v));
        tryPattern('strings', (v) => callChordVoice('strings', getChordNotes(chord.root, chord.type, 4), t, barDur, inst.strings?.vel ?? 0.35, v));

        // ── Drum Machine integration ──────────────────────────────────
        if (sec.drumPatternId && typeof DrumMachine !== 'undefined' && DrumMachine.schedulePatternBar) {
            // Use performance.now() as shared wall-clock reference across both AudioContexts
            const wallClockMs = performance.now() + (t - ctx.currentTime) * 1000;
            DrumMachine.schedulePatternBar(sec.drumPatternId, wallClockMs, bpm);
        }
    }

    function scheduler() {
        while (nextBarTime < ctx.currentTime + SCHEDULE_AHEAD) {
            if (currentArrIdx >= arrangement.length) {
                currentArrIdx = 0;
                currentBarInSec = 0;
            }
            const secId = arrangement[currentArrIdx];
            const sec   = sections[secId];
            if (sec) {
                const chord = getChordAtBar(sec, currentBarInSec);
                scheduleChords(sec, chord, currentBarInSec, nextBarTime, getBarDuration());

                const delay = Math.max(0, (nextBarTime - ctx.currentTime) * 1000);
                const ai = currentArrIdx, bi = currentBarInSec;
                const snapChord = chord; // capture for closure
                setTimeout(() => {
                    if (isPlaying) {
                        updatePlayPosition(ai, bi);
                        updateThereminScale(snapChord); // sync theremin to current chord
                    }
                }, delay);
            }

            nextBarTime += getBarDuration();
            currentBarInSec++;

            if (sec && currentBarInSec >= getTotalBarsInSection(sec)) {
                currentBarInSec = 0;
                currentArrIdx++;
            }
        }
        schedulerTimer = setTimeout(scheduler, LOOKAHEAD_MS);
    }

    // ── Transport ─────────────────────────────────────────────────────

    function play() {
        if (isPlaying || arrangement.length === 0) return;
        initAudio();
        if (ctx.state === 'suspended') ctx.resume();
        // Ensure DM audio is ready for linked patterns
        if (typeof DrumMachine !== 'undefined' && DrumMachine.ensureAudio) DrumMachine.ensureAudio();
        clearTimeout(killRestoreTimer);
        if (killGain) {
            killGain.gain.cancelScheduledValues(ctx.currentTime);
            killGain.gain.setValueAtTime(1.0, ctx.currentTime);
        }
        isPlaying = true;
        currentArrIdx = 0;
        currentBarInSec = 0;
        nextBarTime = ctx.currentTime + 0.05;
        scheduler();
        updateTransport();
    }

    function stop() {
        isPlaying = false;
        clearTimeout(schedulerTimer);
        schedulerTimer = null;
        clearTimeout(killRestoreTimer);
        if (killGain && ctx) {
            killGain.gain.cancelScheduledValues(ctx.currentTime);
            killGain.gain.setValueAtTime(killGain.gain.value, ctx.currentTime);
            killGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.04);
            killRestoreTimer = setTimeout(() => {
                if (!isPlaying && killGain && ctx) killGain.gain.setValueAtTime(1.0, ctx.currentTime);
            }, 500);
        }
        updatePlayPosition(-1, -1);
        updateTransport();
    }

    function updateTransport() {
        const playBtn = document.getElementById('sa-play');
        const stopBtn = document.getElementById('sa-stop');
        if (playBtn) {
            playBtn.classList.toggle('sa-active', isPlaying);
            playBtn.textContent = isPlaying ? '▶ Playing' : '▶ Play Song';
        }
        if (stopBtn) stopBtn.disabled = !isPlaying;
    }

    // ── Data CRUD ─────────────────────────────────────────────────────

    function createProgression() {
        const id = 'prog-' + (++progCounter);
        progressions[id] = { id, chords: [
            { root: rootKey, type: 'min', bars: 1 },
            { root: 'F',    type: 'maj', bars: 1 },
            { root: 'C',    type: 'maj', bars: 1 },
            { root: 'G',    type: 'maj', bars: 1 },
        ]};
        return id;
    }

    function createSection(name, color) {
        const progId = createProgression();
        const id = 'sec-' + (++secCounter);
        sections[id] = {
            id, name: name || ('Section ' + secCounter),
            color: color || SECTION_COLORS[(secCounter - 1) % SECTION_COLORS.length],
            progressionId: progId,
            drumPatternId: null,
            instruments: {
                piano:   { enabled: true,  vel: 0.65, notePattern: null, voice: 'piano'   },
                guitar:  { enabled: false, vel: 0.55, notePattern: null, voice: 'guitar'  },
                bass:    { enabled: true,  vel: 0.75, notePattern: null, voice: 'bass'    },
                pad:     { enabled: false, vel: 0.45, notePattern: null, voice: 'pad'     },
                strings: { enabled: false, vel: 0.35, notePattern: null, voice: 'strings' },
            }
        };
        return id;
    }

    function applyPreset(presetId) {
        if (!currentSectionId) return;
        const preset = PRESETS[presetId];
        if (!preset) return;
        const sec  = sections[currentSectionId];
        const prog = progressions[sec.progressionId];
        const rootIdx = NOTE_NAMES.indexOf(rootKey);
        prog.chords = preset.chords.map(c => ({
            root: NOTE_NAMES[(rootIdx + c.s) % 12],
            type: c.t,
            bars: c.b,
        }));
        renderChordEditor();
        saveState();
    }

    // ── localStorage ──────────────────────────────────────────────────
    const STORAGE_KEY = 'wavr-song-arranger-v1';

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                bpm, rootKey, progCounter, secCounter,
                currentSectionId, arrangement,
                progressions, sections,
            }));
        } catch (e) {}
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            const d = JSON.parse(raw);
            bpm = d.bpm || 120;
            rootKey = d.rootKey || 'A';
            progCounter = d.progCounter || 0;
            secCounter  = d.secCounter  || 0;
            currentSectionId = d.currentSectionId || null;
            arrangement = d.arrangement || [];
            Object.assign(progressions, d.progressions || {});
            Object.entries(d.sections || {}).forEach(([id, sec]) => {
                sections[id] = sec;
                if (!('drumPatternId' in sec)) sec.drumPatternId = null;
                const defs = ['piano','guitar','bass','pad','strings'];
                defs.forEach(instrId => {
                    if (!sec.instruments[instrId]) {
                        sec.instruments[instrId] = { enabled: false, vel: 0.5, notePattern: null, voice: instrId };
                    } else {
                        if (!('notePattern' in sec.instruments[instrId])) sec.instruments[instrId].notePattern = null;
                        if (!('voice'       in sec.instruments[instrId])) sec.instruments[instrId].voice       = instrId;
                        const steps = sec.instruments[instrId].notePattern?.steps;
                        if (steps) steps.forEach(n => { if (!('dur' in n)) n.dur = 1; });
                    }
                });
            });
            return Object.keys(sections).length > 0;
        } catch (e) { return false; }
    }

    // ── UI Rendering ──────────────────────────────────────────────────

    function renderSectionList() {
        const list = document.getElementById('sa-section-list');
        if (!list) return;
        list.innerHTML = '';
        Object.values(sections).forEach(sec => {
            const item = document.createElement('div');
            item.className = 'sa-section-item' + (sec.id === currentSectionId ? ' sa-section-active' : '');
            item.dataset.secId = sec.id;

            const dot = document.createElement('span');
            dot.className = 'sa-section-dot';
            dot.style.background = sec.color;

            const name = document.createElement('span');
            name.className = 'sa-section-name';
            name.textContent = sec.name;
            name.contentEditable = true;
            name.spellcheck = false;
            name.addEventListener('input', function () { sec.name = this.textContent.trim() || 'Section'; renderArrangement(); saveState(); });
            name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });

            const addBtn = document.createElement('button');
            addBtn.className = 'sa-section-add-btn';
            addBtn.title = 'Add to arrangement';
            addBtn.textContent = '+';
            addBtn.addEventListener('click', (e) => { e.stopPropagation(); arrangement.push(sec.id); renderArrangement(); saveState(); });

            const delBtn = document.createElement('button');
            delBtn.className = 'sa-section-del-btn';
            delBtn.title = 'Delete section';
            delBtn.textContent = '×';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (Object.keys(sections).length <= 1) return;
                delete sections[sec.id]; delete progressions[sec.progressionId];
                arrangement = arrangement.filter(id => id !== sec.id);
                if (currentSectionId === sec.id) currentSectionId = Object.keys(sections)[0] || null;
                renderAll(); saveState();
            });

            item.appendChild(dot); item.appendChild(name); item.appendChild(addBtn); item.appendChild(delBtn);
            item.addEventListener('click', function () {
                currentSectionId = sec.id;
                renderSectionList(); renderChordEditor(); renderInstruments(); saveState();
            });
            list.appendChild(item);
        });
    }

    function renderChordEditor() {
        const editor = document.getElementById('sa-chord-editor');
        if (!editor || !currentSectionId) return;
        const sec  = sections[currentSectionId];
        const prog = progressions[sec.progressionId];
        if (!prog) return;

        const label = document.getElementById('sa-editing-label');
        if (label) label.textContent = 'Editing: ' + sec.name;

        editor.innerHTML = '';
        prog.chords.forEach((chord, idx) => {
            const block = document.createElement('div');
            block.className = 'sa-chord-block';
            block.style.setProperty('--bars', chord.bars || 1);

            const top = document.createElement('div');
            top.className = 'sa-chord-top';
            const nameEl = document.createElement('span');
            nameEl.className = 'sa-chord-name';
            nameEl.textContent = chordLabel(chord.root, chord.type);
            const delBtn = document.createElement('button');
            delBtn.className = 'sa-chord-del';
            delBtn.textContent = '×';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (prog.chords.length <= 1) return;
                prog.chords.splice(idx, 1);
                renderChordEditor(); saveState();
            });
            top.appendChild(nameEl); top.appendChild(delBtn);

            const barsRow = document.createElement('div');
            barsRow.className = 'sa-chord-bars-row';
            const barsLabel = document.createElement('span');
            barsLabel.className = 'sa-chord-bars-label';
            barsLabel.textContent = (chord.bars || 1) + 'b';
            const barsSlider = document.createElement('input');
            barsSlider.type = 'range'; barsSlider.min = 1; barsSlider.max = 8; barsSlider.value = chord.bars || 1;
            barsSlider.className = 'sa-chord-bars-slider';
            barsSlider.addEventListener('input', function () {
                chord.bars = parseInt(this.value);
                block.style.setProperty('--bars', chord.bars);
                barsLabel.textContent = chord.bars + 'b';
                saveState();
            });
            barsRow.appendChild(barsLabel); barsRow.appendChild(barsSlider);

            block.appendChild(top); block.appendChild(barsRow);
            block.addEventListener('click', function () { openChordPicker(idx, this); });
            editor.appendChild(block);
        });

        const addBtn = document.createElement('button');
        addBtn.className = 'sa-chord-add';
        addBtn.textContent = '+ Chord';
        addBtn.addEventListener('click', () => {
            const last = prog.chords[prog.chords.length - 1];
            prog.chords.push({ root: last?.root || rootKey, type: last?.type || 'maj', bars: 1 });
            renderChordEditor(); saveState();
        });
        editor.appendChild(addBtn);
    }

    function renderInstruments() {
        const row = document.getElementById('sa-instr-toggles');
        if (!row || !currentSectionId) return;
        const sec = sections[currentSectionId];
        row.innerHTML = '';

        const instrDefs = [
            { id: 'piano',   label: 'Piano',   color: '#A29BFE' },
            { id: 'guitar',  label: 'Guitar',  color: '#FF9F43' },
            { id: 'bass',    label: 'Bass',    color: '#FF6B6B' },
            { id: 'pad',     label: 'Pad',     color: '#45B7D1' },
            { id: 'strings', label: 'Strings', color: '#55EFC4' },
        ];

        instrDefs.forEach(({ id, label, color }) => {
            const instr = sec.instruments[id] ||
                (sec.instruments[id] = { enabled: false, vel: 0.5, notePattern: null, voice: id });
            const wrap = document.createElement('div');
            wrap.className = 'sa-instr-item';

            // ── Top row: enable checkbox + piano roll button ──────────
            const topRow = document.createElement('div');
            topRow.className = 'sa-instr-top-row';

            const toggle = document.createElement('label');
            toggle.className = 'sa-instr-toggle';
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.checked = instr.enabled;
            cb.style.accentColor = color;
            const span = document.createElement('span');
            span.style.color = instr.enabled ? color : '#aaa';
            span.textContent = label;
            cb.addEventListener('change', () => { instr.enabled = cb.checked; span.style.color = cb.checked ? color : '#aaa'; saveState(); });
            toggle.appendChild(cb); toggle.appendChild(span);

            const prBtn = document.createElement('button');
            const hasPattern = instr.notePattern?.active && instr.notePattern?.steps?.length > 0;
            prBtn.className = 'sa-pr-open-btn' + (hasPattern ? ' sa-pr-btn-active' : '');
            prBtn.title = 'Open Piano Roll';
            prBtn.textContent = '🎹';
            prBtn.style.setProperty('--pr-color', color);
            prBtn.addEventListener('click', (e) => { e.stopPropagation(); openSAPianoRoll(id); });

            topRow.appendChild(toggle); topRow.appendChild(prBtn);

            // ── Voice selector ────────────────────────────────────────
            const vcfg = SA_INSTR_CONFIG[id];
            const voiceRow = document.createElement('div');
            voiceRow.className = 'sa-voice-row';
            vcfg.voices.forEach(v => {
                const btn = document.createElement('button');
                const isActive = (instr.voice || vcfg.voices[0].id) === v.id;
                btn.className = 'sa-voice-btn' + (isActive ? ' active' : '');
                btn.textContent = v.label;
                btn.style.setProperty('--vc', color);
                btn.title = v.label + ' voice';
                btn.addEventListener('click', () => {
                    instr.voice = v.id;
                    voiceRow.querySelectorAll('.sa-voice-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    saveState();
                });
                voiceRow.appendChild(btn);
            });

            const vol = document.createElement('input');
            vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.05;
            vol.value = instr.vel ?? 0.5;
            vol.className = 'sa-instr-vol';
            vol.title = label + ' volume';
            vol.addEventListener('input', () => { instr.vel = parseFloat(vol.value); saveState(); });

            wrap.appendChild(topRow); wrap.appendChild(voiceRow); wrap.appendChild(vol);
            row.appendChild(wrap);
        });

        // ── Drum Machine link ─────────────────────────────────────────
        const dmPatterns = (typeof DrumMachine !== 'undefined' && DrumMachine.getPatternList)
            ? getDMPatternsSafe() : [];

        const drumRow = document.createElement('div');
        drumRow.className = 'sa-drum-link-row';
        const drumLabel = document.createElement('span');
        drumLabel.className = 'dm-label';
        drumLabel.textContent = 'Drums';

        const drumSel = document.createElement('select');
        drumSel.className = 'dm-select sa-drum-link-select';
        drumSel.title = 'Link a drum machine pattern to this section';
        const noneOpt = document.createElement('option');
        noneOpt.value = ''; noneOpt.textContent = 'No drums';
        drumSel.appendChild(noneOpt);

        dmPatterns.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id; opt.textContent = p.name;
            drumSel.appendChild(opt);
        });
        drumSel.value = sec.drumPatternId || '';
        drumSel.addEventListener('change', function () {
            sec.drumPatternId = this.value || null;
            saveState();
        });

        drumRow.appendChild(drumLabel); drumRow.appendChild(drumSel);
        row.appendChild(drumRow);
    }

    function getDMPatternsSafe() {
        try { return DrumMachine.getPatternList() || []; } catch(e) { return []; }
    }

    function renderArrangement() {
        const track = document.getElementById('sa-arrangement-track');
        if (!track) return;
        track.innerHTML = '';
        arrangement.forEach((secId, idx) => {
            const sec = sections[secId];
            if (!sec) return;
            const block = document.createElement('div');
            block.className = 'sa-arr-block';
            block.dataset.idx = idx;
            const bars = getTotalBarsInSection(sec);
            block.style.setProperty('--arr-bars', bars);
            block.style.background = sec.color;
            block.style.borderColor = sec.color;

            const nameEl = document.createElement('span');
            nameEl.className = 'sa-arr-block-name';
            nameEl.textContent = sec.name;

            const barsEl = document.createElement('span');
            barsEl.className = 'sa-arr-block-bars';
            barsEl.textContent = bars + ' bar' + (bars !== 1 ? 's' : '');

            if (sec.drumPatternId) {
                const di = document.createElement('span');
                di.className = 'sa-arr-drum-indicator';
                di.textContent = '🥁';
                di.title = 'Drum pattern linked';
                barsEl.appendChild(di);
            }

            const del = document.createElement('button');
            del.className = 'sa-arr-block-del';
            del.textContent = '×';
            del.addEventListener('click', e => { e.stopPropagation(); arrangement.splice(idx, 1); renderArrangement(); saveState(); });

            block.appendChild(nameEl); block.appendChild(barsEl); block.appendChild(del);
            block.addEventListener('click', function () {
                currentSectionId = secId;
                renderSectionList(); renderChordEditor(); renderInstruments();
            });
            track.appendChild(block);
        });
        if (arrangement.length === 0) {
            const hint = document.createElement('div');
            hint.className = 'sa-arr-empty';
            hint.textContent = 'No sections yet — click + on a section to add it here';
            track.appendChild(hint);
        }
    }

    function updatePlayPosition(arrIdx) {
        document.querySelectorAll('.sa-arr-block').forEach((el, i) => {
            el.classList.toggle('sa-arr-playing', i === arrIdx);
        });
    }

    function renderAll() {
        renderSectionList();
        renderChordEditor();
        renderInstruments();
        renderArrangement();
    }

    // ── Chord Picker ──────────────────────────────────────────────────

    function openChordPicker(chordIdx, anchorEl) {
        pickerChordIdx = chordIdx;
        const picker = document.getElementById('sa-chord-picker');
        if (!picker || !currentSectionId) return;
        const sec   = sections[currentSectionId];
        const prog  = progressions[sec.progressionId];
        const chord = prog.chords[chordIdx];

        const rootsEl = document.getElementById('sa-picker-roots');
        if (rootsEl) {
            rootsEl.innerHTML = '';
            NOTE_NAMES.forEach(note => {
                const btn = document.createElement('button');
                btn.className = 'sa-picker-btn' + (note === chord.root ? ' sa-picker-active' : '');
                btn.textContent = note;
                btn.addEventListener('click', () => {
                    chord.root = note;
                    rootsEl.querySelectorAll('.sa-picker-btn').forEach(b => b.classList.remove('sa-picker-active'));
                    btn.classList.add('sa-picker-active');
                    renderChordEditor(); saveState();
                });
                rootsEl.appendChild(btn);
            });
        }

        const typesEl = document.getElementById('sa-picker-types');
        if (typesEl) {
            typesEl.innerHTML = '';
            CHORD_TYPES_ORDERED.forEach(type => {
                const btn = document.createElement('button');
                btn.className = 'sa-picker-btn sa-picker-type-btn' + (type === chord.type ? ' sa-picker-active' : '');
                btn.textContent = CHORD_DISPLAY[type] || type || 'maj';
                btn.title = type;
                btn.addEventListener('click', () => {
                    chord.type = type;
                    typesEl.querySelectorAll('.sa-picker-btn').forEach(b => b.classList.remove('sa-picker-active'));
                    btn.classList.add('sa-picker-active');
                    renderChordEditor(); saveState();
                });
                typesEl.appendChild(btn);
            });
        }

        const rect = anchorEl.getBoundingClientRect();
        picker.style.display = 'block';
        let top  = rect.bottom + window.scrollY + 6;
        let left = rect.left  + window.scrollX;
        if (left + 260 > window.innerWidth) left = window.innerWidth - 268;
        if (top + 200 > window.scrollY + window.innerHeight) top = rect.top + window.scrollY - 210;
        picker.style.top  = top + 'px';
        picker.style.left = left + 'px';
    }

    function closeChordPicker() {
        const picker = document.getElementById('sa-chord-picker');
        if (picker) picker.style.display = 'none';
        pickerChordIdx = null;
    }

    // ── SA Piano Roll ─────────────────────────────────────────────────

    function openSAPianoRoll(instrId) {
        if (!currentSectionId) return;
        saPR.instrId = instrId;
        saPR.secId   = currentSectionId;
        const modal = document.getElementById('sa-pr-modal');
        if (modal) modal.classList.add('sa-pr-open');
        renderSAPianoRoll(instrId);
    }

    function closeSAPianoRoll() {
        saPR.instrId = null;
        saPR.secId   = null;
        saPR.dragActive = false;
        noteResize.active = false;
        const modal = document.getElementById('sa-pr-modal');
        if (modal) modal.classList.remove('sa-pr-open');
    }

    function renderSAPianoRoll(instrId) {
        const sec = sections[saPR.secId];
        if (!sec) return;
        const cfg  = SA_INSTR_CONFIG[instrId];
        if (!cfg) return;
        const prog  = progressions[sec.progressionId];
        const instr = sec.instruments[instrId] || {};
        const pat   = instr.notePattern;

        const dot    = document.getElementById('sa-pr-dot');
        const nameEl = document.getElementById('sa-pr-name');
        const toggle = document.getElementById('sa-pr-mode-toggle');
        if (dot)    dot.style.background = cfg.color;
        if (nameEl) nameEl.textContent   = cfg.label;
        if (toggle) toggle.checked       = pat?.active ?? false;

        const notesByPitch = {};
        (pat?.steps || []).forEach(n => {
            (notesByPitch[n.pitch] = notesByPitch[n.pitch] || []).push(n);
        });

        const grid = document.getElementById('sa-pr-grid');
        if (!grid) return;
        grid.innerHTML = '';

        // Header row
        const hdr = document.createElement('div');
        hdr.className = 'sa-pr-row sa-pr-header-row';
        const hKey = document.createElement('div');
        hKey.className = 'sa-pr-key-label sa-pr-hdr-key';
        hKey.textContent = 'Note';
        hdr.appendChild(hKey);

        const hdrStepArea = document.createElement('div');
        hdrStepArea.className = 'sa-pr-step-area';
        let globalHdrStep = 0;
        (prog?.chords || []).forEach((chord) => {
            for (let b = 0; b < (chord.bars || 1); b++) {
                if (globalHdrStep > 0) { const sep = document.createElement('div'); sep.className = 'sa-pr-bar-sep'; hdrStepArea.appendChild(sep); }
                for (let s = 0; s < 16; s++) {
                    const cell = document.createElement('div');
                    cell.className = 'sa-pr-hdr-cell';
                    if (s === 0) { cell.textContent = chordLabel(chord.root, chord.type); cell.style.color = cfg.color; }
                    else if (s % 4 === 0) { cell.textContent = (s / 4 + 1); }
                    hdrStepArea.appendChild(cell);
                    globalHdrStep++;
                }
            }
        });
        hdr.appendChild(hdrStepArea);
        grid.appendChild(hdr);

        // Pitch rows
        for (let p = cfg.maxPitch; p >= cfg.minPitch; p--) {
            const isBlack  = SA_BLACK_KEYS.has(p % 12);
            const isC      = (p % 12 === 0);
            const noteName = NOTE_NAMES[p % 12];
            const octave   = Math.floor(p / 12) - 1;

            const row = document.createElement('div');
            row.className = 'sa-pr-row' + (isBlack ? ' sa-pr-row-black' : '') + (isC ? ' sa-pr-row-c' : '');
            row.dataset.pitch = p;

            const keyLabel = document.createElement('div');
            keyLabel.className = 'sa-pr-key-label' + (isBlack ? ' sa-pr-key-black' : '');
            keyLabel.textContent = isC ? noteName + octave : (isBlack ? '' : noteName);
            row.appendChild(keyLabel);

            const stepArea = document.createElement('div');
            stepArea.className = 'sa-pr-step-area';

            let globalStep = 0;
            (prog?.chords || []).forEach((chord) => {
                for (let b = 0; b < (chord.bars || 1); b++) {
                    if (globalStep > 0) { const sep = document.createElement('div'); sep.className = 'sa-pr-bar-sep'; stepArea.appendChild(sep); }
                    for (let s = 0; s < 16; s++) {
                        const cell = document.createElement('div');
                        cell.className = 'sa-pr-cell' + (s % 4 === 0 ? ' sa-pr-beat-start' : '');
                        cell.dataset.step = globalStep;
                        stepArea.appendChild(cell);
                        globalStep++;
                    }
                }
            });

            (notesByPitch[p] || []).forEach(note => stepArea.appendChild(renderNoteBlock(note, cfg.color)));
            row.appendChild(stepArea);
            grid.appendChild(row);
        }
    }

    function refreshNoteBlocksForPitch(pitch) {
        const sec = sections[saPR.secId];
        if (!sec) return;
        const cfg   = SA_INSTR_CONFIG[saPR.instrId];
        if (!cfg) return;
        const instr    = sec.instruments[saPR.instrId];
        const stepArea = document.querySelector(`#sa-pr-grid .sa-pr-row[data-pitch="${pitch}"] .sa-pr-step-area`);
        if (!stepArea) return;
        stepArea.querySelectorAll('.sa-pr-note-block').forEach(el => el.remove());
        (instr.notePattern?.steps || [])
            .filter(n => n.pitch === pitch)
            .forEach(note => stepArea.appendChild(renderNoteBlock(note, cfg.color)));
    }

    function toggleSAPRNote(pitch, step, targetActive) {
        const sec   = sections[saPR.secId];
        if (!sec) return;
        const instr = sec.instruments[saPR.instrId];
        if (!instr) return;
        if (!instr.notePattern) instr.notePattern = { active: true, steps: [] };

        const steps = instr.notePattern.steps;
        const idx   = steps.findIndex(n => n.pitch === pitch && n.step === step);
        if (targetActive && idx === -1) {
            steps.push({ pitch, step, dur: saCurrentNoteDur, vel: 1.0 });
        } else if (!targetActive && idx !== -1) {
            steps.splice(idx, 1);
        } else {
            return;
        }

        refreshNoteBlocksForPitch(pitch);
        saveState();
    }

    // ── Fill from Chords ──────────────────────────────────────────────

    function fillSAFromChord(instrId) {
        const sec = sections[saPR.secId];
        if (!sec) return;
        const prog = progressions[sec.progressionId];
        if (!prog) return;
        const cfg   = SA_INSTR_CONFIG[instrId];
        const instr = sec.instruments[instrId];

        const style = document.getElementById('sa-pr-fill-style')?.value || 'block';
        const color = parseInt(document.getElementById('sa-pr-fill-color')?.value ?? 30) / 100;

        if (!instr.notePattern) instr.notePattern = { active: true, steps: [] };
        instr.notePattern.steps  = [];
        instr.notePattern.active = true;

        const rootIdx = NOTE_NAMES.indexOf(rootKey);

        function adjRange(pitch) { return adjustToRange(pitch, cfg); }

        function getNotesInRange(chord, oct) {
            const raw = getChordNotes(chord.root, chord.type, oct);
            const adj = raw.map(adjRange).filter(n => n !== null);
            return [...new Set(adj)];
        }

        function addNote(pitch, step, dur, vel) {
            if (pitch < cfg.minPitch || pitch > cfg.maxPitch) return;
            if (instr.notePattern.steps.some(n => n.pitch === pitch && n.step === step)) return;
            instr.notePattern.steps.push({ pitch, step: Math.max(0, step), dur: Math.max(1, dur), vel: Math.max(0.1, Math.min(1.0, vel)) });
        }

        const oct = instrId === 'pad' ? 3 : instrId === 'bass' ? 2 : 4;

        let barOffset = 0;
        prog.chords.forEach((chord, ci) => {
            const bars  = chord.bars || 1;
            let notes;
            if (instrId === 'bass') {
                const root = adjRange(NOTE_NAMES.indexOf(chord.root) + 3 * 12);
                notes = root !== null ? [root] : [];
            } else {
                notes = getNotesInRange(chord, oct);
            }
            if (notes.length === 0) { barOffset += bars; return; }

            for (let b = 0; b < bars; b++) {
                const bs = (barOffset + b) * 16;

                switch (style) {
                    case 'block':
                        notes.forEach(p => addNote(p, bs, 16, 0.82 + Math.random() * 0.1));
                        break;
                    case 'arp-up':
                        notes.forEach((p, i) => addNote(p, bs + i * 2, 2, 0.75 + (i === 0 ? 0.12 : 0) + Math.random() * 0.08));
                        for (let s = notes.length * 2; s + 2 <= 16; s += 2) {
                            if (Math.random() < 0.6 + color * 0.3)
                                addNote(notes[Math.floor(s/2) % notes.length], bs + s, 2, 0.6 + Math.random() * 0.2);
                        }
                        break;
                    case 'arp-down': {
                        const rev = [...notes].reverse();
                        rev.forEach((p, i) => addNote(p, bs + i * 2, 2, 0.75 + (i === 0 ? 0.12 : 0) + Math.random() * 0.08));
                        for (let s = rev.length * 2; s + 2 <= 16; s += 2) {
                            if (Math.random() < 0.6 + color * 0.3)
                                addNote(rev[Math.floor(s/2) % rev.length], bs + s, 2, 0.6 + Math.random() * 0.2);
                        }
                        break;
                    }
                    case 'sparse':
                        addNote(notes[0], bs, 8, 0.85);
                        if (notes.length > 1 && Math.random() < 0.5 + color * 0.3)
                            addNote(notes[1], bs + 8, 8, 0.7 + Math.random() * 0.15);
                        break;
                    case 'rhythm': {
                        const RHYTHM = [0, 3, 6, 10, 12, 14];
                        RHYTHM.forEach((rs) => {
                            if (Math.random() < 0.7 + color * 0.25)
                                addNote(notes[Math.floor(Math.random() * notes.length)], bs + rs, 1 + Math.floor(Math.random() * 3), 0.6 + Math.random() * 0.35);
                        });
                        break;
                    }
                }

                if (color > 0.25 && style !== 'block') {
                    const nextChord = prog.chords[(ci + 1) % prog.chords.length];
                    const nextNotes = instrId === 'bass'
                        ? ([adjRange(NOTE_NAMES.indexOf(nextChord.root) + 3 * 12)].filter(n => n !== null))
                        : getNotesInRange(nextChord, oct);
                    if (b === bars - 1 && nextNotes.length > 0 && notes.length > 0 && Math.random() < color) {
                        const target = nextNotes[0];
                        let approach = target - 2;
                        const semitone = (target % 12 - rootIdx + 12) % 12;
                        if (MAJOR_SCALE_INT.includes((semitone - 2 + 12) % 12)) approach = target - 2;
                        else if (MAJOR_SCALE_INT.includes((semitone - 1 + 12) % 12)) approach = target - 1;
                        const adj = adjRange(approach);
                        if (adj !== null && adj !== notes[0]) addNote(adj, bs + 14, 1, 0.45 + Math.random() * 0.15);
                    }
                }

                if (color > 0.55) {
                    const intervals = CHORD_INTERVALS[chord.type] || [];
                    const rootMidi  = NOTE_NAMES.indexOf(chord.root);
                    const baseOct   = Math.floor((notes[0] || cfg.minPitch) / 12);
                    const seventhInt = intervals.find(i => i >= 9 && i <= 11);
                    if (seventhInt !== undefined && Math.random() < color - 0.3) {
                        const sp = adjRange(baseOct * 12 + rootMidi + seventhInt);
                        if (sp !== null && !notes.includes(sp))
                            addNote(sp, bs + (style === 'block' ? 8 : 4 + Math.floor(Math.random() * 4)), style === 'block' ? 8 : 2, 0.4 + color * 0.25);
                    }
                    if (color > 0.75 && Math.random() < color - 0.55) {
                        const ninthPitch = adjRange(baseOct * 12 + rootMidi + 14);
                        if (ninthPitch !== null && !notes.includes(ninthPitch))
                            addNote(ninthPitch, bs + 2, 2, 0.35 + color * 0.2);
                    }
                }

                if (color > 0.8 && style !== 'block' && style !== 'sparse' && Math.random() < (color - 0.8) * 3) {
                    const base     = notes[Math.floor(Math.random() * notes.length)];
                    const neighbor = adjRange(base + (Math.random() < 0.5 ? 1 : -1));
                    if (neighbor !== null && !notes.includes(neighbor))
                        addNote(neighbor, bs + Math.floor(Math.random() * 12) + 1, 1, 0.3 + Math.random() * 0.2);
                }
            }

            barOffset += bars;
        });

        instr.notePattern.steps.sort((a, b) => a.step - b.step || a.pitch - b.pitch);

        const toggle = document.getElementById('sa-pr-mode-toggle');
        if (toggle) toggle.checked = true;
        renderSAPianoRoll(instrId);
        renderInstruments();
        saveState();
    }

    // ── Init ──────────────────────────────────────────────────────────

    function syncUI() {
        const keyEl = document.getElementById('sa-key');
        const bpmEl = document.getElementById('sa-bpm');
        if (keyEl) keyEl.value = rootKey;
        if (bpmEl) bpmEl.value = bpm;
    }

    function init() {
        const hadState = loadState();
        if (!hadState) {
            const v = createSection('Verse');
            sections[v].instruments.piano.enabled  = true;
            sections[v].instruments.bass.enabled   = true;
            sections[v].instruments.pad.enabled    = true;

            const c = createSection('Chorus');
            sections[c].color = '#FF6B6B';
            sections[c].instruments.piano.enabled  = true;
            sections[c].instruments.guitar.enabled = true;
            sections[c].instruments.bass.enabled   = true;

            const vProg = progressions[sections[v].progressionId];
            vProg.chords = [
                { root: 'A', type: 'min', bars: 2 },
                { root: 'F', type: 'maj', bars: 2 },
                { root: 'C', type: 'maj', bars: 2 },
                { root: 'G', type: 'maj', bars: 2 },
            ];
            const cProg = progressions[sections[c].progressionId];
            cProg.chords = [
                { root: 'F', type: 'maj', bars: 2 },
                { root: 'C', type: 'maj', bars: 2 },
                { root: 'G', type: 'maj', bars: 2 },
                { root: 'A', type: 'min', bars: 2 },
            ];
            arrangement = [v, v, c, v, c];
            currentSectionId = v;
        }

        renderAll();
        syncUI();

        // ── Transport ──────────────────────────────────────────────────
        document.getElementById('sa-play')?.addEventListener('click', play);
        document.getElementById('sa-stop')?.addEventListener('click', stop);

        // ── BPM ────────────────────────────────────────────────────────
        const bpmEl  = document.getElementById('sa-bpm');
        const bpmSld = document.getElementById('sa-bpm-slider');
        if (bpmSld) bpmSld.addEventListener('input', function () {
            bpm = parseInt(this.value); if (bpmEl) bpmEl.value = bpm; saveState();
        });
        if (bpmEl) {
            bpmEl.addEventListener('input', function () {
                const v = parseInt(this.value);
                if (!isNaN(v) && v >= 20 && v <= 300) { bpm = v; if (bpmSld) bpmSld.value = v; saveState(); }
            });
            bpmEl.addEventListener('blur', function () {
                const v = Math.max(20, Math.min(300, parseInt(this.value) || 120));
                bpm = v; this.value = v; if (bpmSld) bpmSld.value = v; saveState();
            });
            bpmEl.addEventListener('keydown', e => { if (e.key === 'Enter') bpmEl.blur(); });
        }

        // ── Key ────────────────────────────────────────────────────────
        document.getElementById('sa-key')?.addEventListener('change', function () {
            rootKey = this.value; saveState();
        });

        // ── Clear arrangement ─────────────────────────────────────────
        document.getElementById('sa-arrangement-clear')?.addEventListener('click', function () {
            arrangement = []; renderArrangement(); saveState();
        });

        // ── Add section ────────────────────────────────────────────────
        document.getElementById('sa-add-section')?.addEventListener('click', function () {
            const typeIdx = Object.keys(sections).length % SECTION_TYPES.length;
            const id = createSection(SECTION_TYPES[typeIdx]);
            currentSectionId = id;
            renderAll(); saveState();
        });

        // ── Preset ────────────────────────────────────────────────────
        const presetSel = document.getElementById('sa-preset-select');
        if (presetSel) presetSel.addEventListener('change', function () {
            if (!this.value) return;
            applyPreset(this.value);
            this.value = '';
        });

        // ── Theremin Sync ──────────────────────────────────────────────
        const syncToggle = document.getElementById('sa-theremin-sync');
        const syncMode   = document.getElementById('sa-theremin-sync-mode');
        if (syncToggle) syncToggle.addEventListener('change', function () {
            thereminSync = this.checked;
            if (syncMode) syncMode.style.display = this.checked ? '' : 'none';
        });
        if (syncMode) {
            syncMode.addEventListener('change', function () { thereminSyncMode = this.value; });
            syncMode.style.display = 'none'; // hidden until sync is on
        }

        // ── Close chord picker on outside click ───────────────────────
        document.addEventListener('click', function (e) {
            const picker = document.getElementById('sa-chord-picker');
            if (picker && picker.style.display !== 'none' &&
                !picker.contains(e.target) && !e.target.closest('.sa-chord-block')) {
                closeChordPicker();
            }
        });

        // ── SA Piano Roll ──────────────────────────────────────────────
        document.getElementById('sa-pr-close')?.addEventListener('click', closeSAPianoRoll);
        document.getElementById('sa-pr-modal')?.addEventListener('click', function (e) {
            if (e.target === this) closeSAPianoRoll();
        });

        document.querySelectorAll('.sa-pr-dur-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                saCurrentNoteDur = parseInt(this.dataset.dur) || 1;
                document.querySelectorAll('.sa-pr-dur-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
            });
        });

        document.getElementById('sa-pr-mode-toggle')?.addEventListener('change', function () {
            const sec = sections[saPR.secId];
            if (!sec || !saPR.instrId) return;
            const instr = sec.instruments[saPR.instrId];
            if (!instr.notePattern) instr.notePattern = { active: false, steps: [] };
            instr.notePattern.active = this.checked;
            renderInstruments();
            saveState();
        });

        document.getElementById('sa-pr-fill')?.addEventListener('click', function () {
            if (saPR.instrId) fillSAFromChord(saPR.instrId);
        });

        document.getElementById('sa-pr-fill-color')?.addEventListener('input', function () {
            const el = document.getElementById('sa-pr-fill-color-val');
            if (el) el.textContent = this.value + '%';
        });

        document.getElementById('sa-pr-clear')?.addEventListener('click', function () {
            const sec = sections[saPR.secId];
            if (!sec || !saPR.instrId) return;
            const instr = sec.instruments[saPR.instrId];
            if (instr.notePattern) instr.notePattern.steps = [];
            renderSAPianoRoll(saPR.instrId);
            renderInstruments();
            saveState();
        });

        // ── Grid interactions: add/remove notes + resize ──────────────
        const saPRGrid = document.getElementById('sa-pr-grid');
        if (saPRGrid) {
            saPRGrid.addEventListener('mousedown', function (e) {
                const rh   = e.target.closest('.sa-pr-note-resize');
                const nb   = e.target.closest('.sa-pr-note-block');
                const cell = e.target.closest('.sa-pr-cell');
                const sa   = e.target.closest('.sa-pr-step-area');

                if (rh && nb) {
                    noteResize.active   = true;
                    noteResize.noteEl   = nb;
                    noteResize.pitch    = parseInt(nb.dataset.pitch);
                    noteResize.step     = parseInt(nb.dataset.step);
                    noteResize.startX   = e.clientX;
                    noteResize.startDur = parseInt(nb.dataset.dur) || 1;
                    e.preventDefault(); e.stopPropagation();
                } else if (nb) {
                    toggleSAPRNote(parseInt(nb.dataset.pitch), parseInt(nb.dataset.step), false);
                    e.preventDefault(); e.stopPropagation();
                } else if (cell && sa) {
                    const rowEl = sa.closest('.sa-pr-row[data-pitch]');
                    if (!rowEl) return;
                    toggleSAPRNote(parseInt(rowEl.dataset.pitch), parseInt(cell.dataset.step), true);
                    saPR.dragActive = true;
                    saPR.dragState  = 'add';
                    e.preventDefault();
                }
            });

            saPRGrid.addEventListener('mouseover', function (e) {
                if (!saPR.dragActive) return;
                const cell  = e.target.closest('.sa-pr-cell');
                const sa    = e.target.closest('.sa-pr-step-area');
                const rowEl = sa?.closest('.sa-pr-row[data-pitch]');
                if (!cell || !rowEl) return;
                const pitch = parseInt(rowEl.dataset.pitch);
                const step  = parseInt(cell.dataset.step);
                const instr = sections[saPR.secId]?.instruments[saPR.instrId];
                if (!instr?.notePattern?.steps.some(n => n.pitch === pitch && n.step === step))
                    toggleSAPRNote(pitch, step, true);
            });
        }

        document.addEventListener('mousemove', function (e) {
            if (!noteResize.active) return;
            const newDur = Math.max(1, noteResize.startDur + Math.round((e.clientX - noteResize.startX) / 14));
            noteResize.noteEl.dataset.dur = newDur;
            noteResize.noteEl.style.width = durToWidth(noteResize.step, newDur) + 'px';
        });

        document.addEventListener('mouseup', function () {
            if (noteResize.active) {
                const dur  = parseInt(noteResize.noteEl.dataset.dur) || 1;
                const sec  = sections[saPR.secId];
                if (sec && saPR.instrId) {
                    const note = sec.instruments[saPR.instrId]?.notePattern?.steps
                        .find(n => n.pitch === noteResize.pitch && n.step === noteResize.step);
                    if (note) { note.dur = dur; saveState(); }
                }
                noteResize.active = false;
                noteResize.noteEl = null;
            }
            saPR.dragActive = false;
        });

        // ── Tab switching ──────────────────────────────────────────────
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                const tab = this.dataset.tab;
                const thereminEl = document.getElementById('theremin-panel');
                const drumEl     = document.getElementById('drum-machine-panel');
                const songEl     = document.getElementById('song-panel');
                if (thereminEl) thereminEl.style.display = tab === 'theremin'     ? '' : 'none';
                if (drumEl)     drumEl.style.display     = tab === 'drum-machine' ? '' : 'none';
                if (songEl)     songEl.style.display     = tab === 'song'         ? '' : 'none';
            });
        });

        // ── Spacebar play/stop ─────────────────────────────────────────
        document.addEventListener('keydown', function (e) {
            if (e.code !== 'Space') return;
            const songEl = document.getElementById('song-panel');
            if (!songEl || songEl.style.display === 'none') return;
            e.preventDefault();
            isPlaying ? stop() : play();
        });
    }

    return { init };
})();

SongArranger.init();
