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

    // ── Preset Progressions (semitone offsets from root) ──────────────
    const PRESETS = {
        'pop-major': {
            name: 'Pop — I V vi IV',
            chords: [{s:0,t:'maj',b:1},{s:7,t:'maj',b:1},{s:9,t:'min',b:1},{s:5,t:'maj',b:1}]
        },
        'pop-minor': {
            name: 'Minor Pop — i VI III VII',
            chords: [{s:0,t:'min',b:1},{s:8,t:'maj',b:1},{s:3,t:'maj',b:1},{s:10,t:'maj',b:1}]
        },
        'doo-wop': {
            name: 'Doo-Wop — I vi IV V',
            chords: [{s:0,t:'maj',b:1},{s:9,t:'min',b:1},{s:5,t:'maj',b:1},{s:7,t:'maj',b:1}]
        },
        'blues': {
            name: '12-Bar Blues',
            chords: [
                {s:0,t:'7',b:1},{s:0,t:'7',b:1},{s:0,t:'7',b:1},{s:0,t:'7',b:1},
                {s:5,t:'7',b:1},{s:5,t:'7',b:1},{s:0,t:'7',b:1},{s:0,t:'7',b:1},
                {s:7,t:'7',b:1},{s:5,t:'7',b:1},{s:0,t:'7',b:1},{s:7,t:'7',b:1}
            ]
        },
        'jazz-ii-V-I': {
            name: 'Jazz — ii⁷ V⁷ Imaj7',
            chords: [{s:2,t:'min7',b:2},{s:7,t:'7',b:2},{s:0,t:'maj7',b:4}]
        },
        'sad': {
            name: 'Sad — i v VI III',
            chords: [{s:0,t:'min',b:1},{s:7,t:'min',b:1},{s:8,t:'maj',b:1},{s:3,t:'maj',b:1}]
        },
        'flamenco': {
            name: 'Flamenco — i VII VI V',
            chords: [{s:0,t:'min',b:1},{s:10,t:'maj',b:1},{s:8,t:'maj',b:1},{s:7,t:'maj',b:1}]
        },
        'bossa': {
            name: 'Bossa Nova — IIm7 V7 Imaj7 viim7',
            chords: [{s:2,t:'min7',b:2},{s:7,t:'7',b:2},{s:0,t:'maj7',b:2},{s:11,t:'min7b5',b:2}]
        },
        'andalusian': {
            name: 'Andalusian Cadence — i VII VI V',
            chords: [{s:0,t:'min',b:2},{s:10,t:'maj',b:2},{s:8,t:'maj',b:2},{s:7,t:'7',b:2}]
        },
        'circle-of-5ths': {
            name: 'Circle — I IV VII III',
            chords: [{s:0,t:'maj7',b:2},{s:5,t:'maj7',b:2},{s:10,t:'7',b:2},{s:4,t:'min7',b:2}]
        },
    };

    // ── Section Colors ────────────────────────────────────────────────
    const SECTION_COLORS = [
        '#4ECDC4','#FF6B6B','#A29BFE','#FF9F43',
        '#55EFC4','#FD79A8','#74B9FF','#FDCB6E',
    ];
    const SECTION_TYPES = ['Verse','Chorus','Bridge','Intro','Outro','Pre-Chorus','Break','Solo','Interlude'];

    // ── State ─────────────────────────────────────────────────────────
    let bpm = 120;
    let rootKey = 'A';
    let progressions = {};   // id → { id, chords: [{root, type, bars}] }
    let sections = {};       // id → { id, name, color, progressionId, instruments }
    let arrangement = [];    // array of section IDs
    let progCounter = 0;
    let secCounter  = 0;
    let currentSectionId = null;   // which section is open in editor
    let pickerChordIdx   = null;   // which chord block the picker is editing

    // ── Audio ─────────────────────────────────────────────────────────
    let ctx = null;
    let masterGain = null;
    let isPlaying = false;
    let schedulerTimer = null;
    let nextBarTime = 0;
    let currentArrIdx = 0;   // index in arrangement[]
    let currentBarInSec = 0; // bar within current section's progression

    const LOOKAHEAD_MS   = 25;
    const SCHEDULE_AHEAD = 0.2;  // schedule a bit further ahead for chords (heavier notes)

    function initAudio() {
        if (ctx) return;
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = ctx.createGain();
        masterGain.gain.value = 0.65;

        // Light compressor + limiter for the chord engine
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.ratio.value = 3;
        comp.knee.value = 6; comp.attack.value = 0.005; comp.release.value = 0.25;
        const lim = ctx.createDynamicsCompressor();
        lim.threshold.value = -2; lim.ratio.value = 20;
        lim.knee.value = 0; lim.attack.value = 0.001; lim.release.value = 0.08;

        masterGain.connect(comp);
        comp.connect(lim);
        lim.connect(ctx.destination);
    }

    // ── Instrument Synthesis ──────────────────────────────────────────

    function piano(notes, t, dur, vel) {
        notes.forEach(midi => {
            const f = midiToFreq(midi);
            [[f, 'triangle', 1.0],[f*2, 'sine', 0.3],[f*0.5, 'sine', 0.15]].forEach(([freq, type, amp]) => {
                const osc = ctx.createOscillator();
                const g   = ctx.createGain();
                osc.type = type; osc.frequency.value = freq;
                g.gain.setValueAtTime(0, t);
                g.gain.linearRampToValueAtTime(vel * amp * 0.7, t + 0.01);
                g.gain.exponentialRampToValueAtTime(vel * amp * 0.28, t + 0.4);
                g.gain.setValueAtTime(vel * amp * 0.28, t + dur - 0.08);
                g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.12);
                osc.connect(g); g.connect(masterGain);
                osc.start(t); osc.stop(t + dur + 0.2);
            });
        });
    }

    function guitar(notes, t, dur, vel) {
        notes.forEach((midi, i) => {
            const f  = midiToFreq(midi);
            const td = t + i * 0.018; // strum delay
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

    function bass(root, t, dur, vel) {
        const f = midiToFreq(root);
        const beat = (60 / bpm);
        // Root on beat 1, fifth on beat 3 (walking bass feel)
        [[0, f],[2*beat, midiToFreq(root + 7)]].forEach(([offset, freq]) => {
            if (offset >= dur) return;
            const osc  = ctx.createOscillator();
            const sub  = ctx.createOscillator();
            const g    = ctx.createGain();
            osc.type  = 'triangle';  osc.frequency.value = freq;
            sub.type  = 'sine';      sub.frequency.value = freq * 0.5;
            g.gain.setValueAtTime(vel * 0.85, t + offset);
            g.gain.exponentialRampToValueAtTime(0.0001, t + offset + Math.min(beat * 1.8, dur - offset));
            osc.connect(g); sub.connect(g); g.connect(masterGain);
            const end = t + offset + Math.min(beat * 1.8, dur - offset) + 0.05;
            osc.start(t + offset); osc.stop(end);
            sub.start(t + offset); sub.stop(end);
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

    function scheduleChords(sec, chord, t, barDur) {
        if (!chord) return;
        const inst = sec.instruments || {};
        const rootMidi = (5) * 12 + NOTE_NAMES.indexOf(chord.root); // octave 4 for piano

        if (inst.piano?.enabled)   piano(getChordNotes(chord.root, chord.type, 4), t, barDur, inst.piano.vel ?? 0.65);
        if (inst.guitar?.enabled)  guitar(getChordNotes(chord.root, chord.type, 4), t, barDur, inst.guitar.vel ?? 0.55);
        if (inst.bass?.enabled)    bass(rootMidi - 24, t, barDur, inst.bass.vel ?? 0.75);   // 2 octaves down
        if (inst.pad?.enabled)     pad(getChordNotes(chord.root, chord.type, 3), t, barDur, inst.pad.vel ?? 0.45);
        if (inst.strings?.enabled) strings(getChordNotes(chord.root, chord.type, 4), t, barDur, inst.strings.vel ?? 0.35);
    }

    function scheduler() {
        while (nextBarTime < ctx.currentTime + SCHEDULE_AHEAD) {
            if (currentArrIdx >= arrangement.length) {
                // Loop arrangement
                currentArrIdx = 0;
                currentBarInSec = 0;
            }
            const secId = arrangement[currentArrIdx];
            const sec   = sections[secId];
            if (sec) {
                const chord = getChordAtBar(sec, currentBarInSec);
                scheduleChords(sec, chord, nextBarTime, getBarDuration());

                // Visual update
                const delay = Math.max(0, (nextBarTime - ctx.currentTime) * 1000);
                const ai = currentArrIdx, bi = currentBarInSec;
                setTimeout(() => { if (isPlaying) updatePlayPosition(ai, bi); }, delay);
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
            instruments: {
                piano:   { enabled: true,  vel: 0.65 },
                guitar:  { enabled: false, vel: 0.55 },
                bass:    { enabled: true,  vel: 0.75 },
                pad:     { enabled: false, vel: 0.45 },
                strings: { enabled: false, vel: 0.35 },
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
            Object.assign(sections, d.sections || {});
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
            name.addEventListener('input', function () {
                sec.name = this.textContent.trim() || 'Section';
                renderArrangement();
                saveState();
            });
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
                delete sections[sec.id];
                delete progressions[sec.progressionId];
                arrangement = arrangement.filter(id => id !== sec.id);
                if (currentSectionId === sec.id) {
                    currentSectionId = Object.keys(sections)[0] || null;
                }
                renderAll(); saveState();
            });

            item.appendChild(dot); item.appendChild(name); item.appendChild(addBtn); item.appendChild(delBtn);
            item.addEventListener('click', function () {
                currentSectionId = sec.id;
                renderSectionList();
                renderChordEditor();
                renderInstruments();
                saveState();
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

        // Update editing label
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
            const instr = sec.instruments[id] || (sec.instruments[id] = { enabled: false, vel: 0.5 });
            const wrap = document.createElement('div');
            wrap.className = 'sa-instr-item';

            const toggle = document.createElement('label');
            toggle.className = 'sa-instr-toggle';
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.checked = instr.enabled;
            cb.style.accentColor = color;
            cb.addEventListener('change', () => { instr.enabled = cb.checked; saveState(); });
            const span = document.createElement('span');
            span.style.color = instr.enabled ? color : '#aaa';
            span.textContent = label;
            cb.addEventListener('change', () => { span.style.color = cb.checked ? color : '#aaa'; });
            toggle.appendChild(cb); toggle.appendChild(span);

            const vol = document.createElement('input');
            vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.05;
            vol.value = instr.vel ?? 0.5;
            vol.className = 'sa-instr-vol';
            vol.title = label + ' volume';
            vol.addEventListener('input', () => { instr.vel = parseFloat(vol.value); saveState(); });

            wrap.appendChild(toggle); wrap.appendChild(vol);
            row.appendChild(wrap);
        });
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

            const del = document.createElement('button');
            del.className = 'sa-arr-block-del';
            del.textContent = '×';
            del.addEventListener('click', e => {
                e.stopPropagation();
                arrangement.splice(idx, 1);
                renderArrangement(); saveState();
            });

            block.appendChild(nameEl); block.appendChild(barsEl); block.appendChild(del);
            block.addEventListener('click', function () {
                currentSectionId = secId;
                renderSectionList(); renderChordEditor(); renderInstruments();
            });
            track.appendChild(block);
        });
        // Empty slots hint
        if (arrangement.length === 0) {
            const hint = document.createElement('div');
            hint.className = 'sa-arr-empty';
            hint.textContent = 'No sections yet — click + on a section to add it here';
            track.appendChild(hint);
        }
    }

    function updatePlayPosition(arrIdx, barInSec) {
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
        const sec  = sections[currentSectionId];
        const prog = progressions[sec.progressionId];
        const chord = prog.chords[chordIdx];

        // Roots
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

        // Types
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

        // Position picker
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
            // Default song: Verse + Chorus
            const v = createSection('Verse');
            sections[v].instruments.piano.enabled  = true;
            sections[v].instruments.bass.enabled   = true;
            sections[v].instruments.pad.enabled    = true;

            const c = createSection('Chorus');
            sections[c].color = '#FF6B6B';
            sections[c].instruments.piano.enabled  = true;
            sections[c].instruments.guitar.enabled = true;
            sections[c].instruments.bass.enabled   = true;

            // Verse: Am-F-C-G, Chorus: F-C-G-Am
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

        // ── Close chord picker on outside click ───────────────────────
        document.addEventListener('click', function (e) {
            const picker = document.getElementById('sa-chord-picker');
            if (picker && picker.style.display !== 'none' && !picker.contains(e.target) && !e.target.closest('.sa-chord-block')) {
                closeChordPicker();
            }
        });

        // ── Tab switching (also handles theremin/dm tabs) ──────────────
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                const tab = this.dataset.tab;
                const thereminEl  = document.getElementById('theremin-panel');
                const drumEl      = document.getElementById('drum-machine-panel');
                const songEl      = document.getElementById('song-panel');
                if (thereminEl) thereminEl.style.display = tab === 'theremin'      ? '' : 'none';
                if (drumEl)     drumEl.style.display     = tab === 'drum-machine'  ? '' : 'none';
                if (songEl)     songEl.style.display     = tab === 'song'          ? '' : 'none';
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
