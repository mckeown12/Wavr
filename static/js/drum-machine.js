/* === Drum Machine Module === */
const DrumMachine = (function () {

    // ── Audio Context ─────────────────────────────────────────────────
    let ctx = null;
    let masterGain = null;

    function initAudio() {
        if (ctx) return;
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = ctx.createGain();
        masterGain.gain.value = 0.8;
        masterGain.connect(ctx.destination);
    }

    // ── Instruments ───────────────────────────────────────────────────
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

    const instrumentVolumes = {};
    INSTRUMENTS.forEach(i => { instrumentVolumes[i.id] = 0.8; });

    // ── Playback State ────────────────────────────────────────────────
    let bpm = 120;
    let stepsCount = 16;
    let swingAmount = 0;      // 0–0.5 fraction of step duration
    let isPlaying = false;

    const LOOKAHEAD_MS = 25;
    const SCHEDULE_AHEAD = 0.1;

    let schedulerTimer = null;
    let currentStep = 0;
    let nextNoteTime = 0;

    // ── Patterns ──────────────────────────────────────────────────────
    const patterns = {};
    let currentPatternId = null;
    let patternCounter = 0;

    // ── Timeline ──────────────────────────────────────────────────────
    const TIMELINE_SLOTS = 32;
    let timelineSlots = new Array(TIMELINE_SLOTS).fill(null);
    let timelineLoopActive = false;
    let currentTimelineSlot = -1;
    let stepsInCurrentSlot = 0;  // count steps played in the active timeline slot

    // ══════════════════════════════════════════════════════════════════
    // Drum Synthesis
    // ══════════════════════════════════════════════════════════════════

    function makeNoiseBuf(secs) {
        const frames = Math.ceil(ctx.sampleRate * secs);
        const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        return src;
    }

    function playKick(time, vel) {
        const v = instrumentVolumes.kick * vel;
        // Sub body
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(160, time);
        osc.frequency.exponentialRampToValueAtTime(40, time + 0.08);
        g.gain.setValueAtTime(v, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + 0.45);
        osc.connect(g); g.connect(masterGain);
        osc.start(time); osc.stop(time + 0.45);
        // Click transient
        const c = ctx.createOscillator();
        const cg = ctx.createGain();
        c.type = 'triangle';
        c.frequency.setValueAtTime(900, time);
        c.frequency.exponentialRampToValueAtTime(100, time + 0.015);
        cg.gain.setValueAtTime(v * 0.7, time);
        cg.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
        c.connect(cg); cg.connect(masterGain);
        c.start(time); c.stop(time + 0.02);
    }

    function playSnare(time, vel) {
        const v = instrumentVolumes.snare * vel;
        // Tonal body
        const osc = ctx.createOscillator();
        const og = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, time);
        osc.frequency.exponentialRampToValueAtTime(90, time + 0.15);
        og.gain.setValueAtTime(v * 0.5, time);
        og.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
        osc.connect(og); og.connect(masterGain);
        osc.start(time); osc.stop(time + 0.2);
        // Noise
        const n = makeNoiseBuf(0.22);
        const flt = ctx.createBiquadFilter();
        flt.type = 'bandpass'; flt.frequency.value = 3500; flt.Q.value = 0.8;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(v * 0.9, time);
        ng.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
        n.connect(flt); flt.connect(ng); ng.connect(masterGain);
        n.start(time); n.stop(time + 0.22);
    }

    function playHihat(time, vel, open) {
        const id = open ? 'openhat' : 'hihat';
        const v = instrumentVolumes[id] * vel;
        const dur = open ? 0.5 : 0.07;
        const n = makeNoiseBuf(dur);
        const flt = ctx.createBiquadFilter();
        flt.type = 'highpass'; flt.frequency.value = 8000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(v * 0.35, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + dur);
        n.connect(flt); flt.connect(g); g.connect(masterGain);
        n.start(time); n.stop(time + dur);
    }

    function playClap(time, vel) {
        const v = instrumentVolumes.clap * vel;
        [0, 0.008, 0.016, 0.025].forEach((offset, i) => {
            const n = makeNoiseBuf(0.15);
            const flt = ctx.createBiquadFilter();
            flt.type = 'bandpass'; flt.frequency.value = 1400; flt.Q.value = 0.6;
            const g = ctx.createGain();
            const peak = i === 3 ? v : v * 0.55;
            const decay = i === 3 ? 0.18 : 0.018;
            g.gain.setValueAtTime(peak, time + offset);
            g.gain.exponentialRampToValueAtTime(0.001, time + offset + decay);
            n.connect(flt); flt.connect(g); g.connect(masterGain);
            n.start(time + offset); n.stop(time + offset + decay + 0.01);
        });
    }

    function playTom(time, vel) {
        const v = instrumentVolumes.tom * vel;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(130, time);
        osc.frequency.exponentialRampToValueAtTime(55, time + 0.3);
        g.gain.setValueAtTime(v, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
        osc.connect(g); g.connect(masterGain);
        osc.start(time); osc.stop(time + 0.35);
    }

    function playCowbell(time, vel) {
        const v = instrumentVolumes.cowbell * vel;
        [562, 845].forEach(f => {
            const osc = ctx.createOscillator();
            const flt = ctx.createBiquadFilter();
            const g = ctx.createGain();
            osc.type = 'square'; osc.frequency.value = f;
            flt.type = 'bandpass'; flt.frequency.value = f; flt.Q.value = 2.5;
            g.gain.setValueAtTime(v * 0.28, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + 0.55);
            osc.connect(flt); flt.connect(g); g.connect(masterGain);
            osc.start(time); osc.stop(time + 0.55);
        });
    }

    function playCrash(time, vel) {
        const v = instrumentVolumes.crash * vel;
        [420, 631, 835, 1046, 1287].forEach(f => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sawtooth'; osc.frequency.value = f;
            g.gain.setValueAtTime(v * 0.06, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + 1.2);
            osc.connect(g); g.connect(masterGain);
            osc.start(time); osc.stop(time + 1.2);
        });
        const n = makeNoiseBuf(1.2);
        const flt = ctx.createBiquadFilter();
        flt.type = 'highpass'; flt.frequency.value = 5000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(v * 0.28, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + 1.2);
        n.connect(flt); flt.connect(g); g.connect(masterGain);
        n.start(time); n.stop(time + 1.2);
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
        // Pair-based swing: total pair time = 2 × base (tempo stays stable)
        const base = 60.0 / bpm / 4;  // 16th-note duration
        if (swingAmount > 0) {
            return (step % 2 === 0)
                ? base * (1 + swingAmount)
                : base * (1 - swingAmount);
        }
        return base;
    }

    function scheduleStep(step, time) {
        const pattern = patterns[currentPatternId];
        if (!pattern) return;
        INSTRUMENTS.forEach(instr => {
            if (pattern.steps[instr.id] && pattern.steps[instr.id][step]) {
                if (PLAY_FN[instr.id]) PLAY_FN[instr.id](time, 1.0);
            }
        });
        // Visual update via setTimeout (visual accuracy ±25ms is fine)
        const delay = Math.max(0, (time - ctx.currentTime) * 1000);
        setTimeout(() => { if (isPlaying) updateStepHighlight(step); }, delay);
    }

    function advanceStep() {
        nextNoteTime += getStepDuration(currentStep);
        currentStep = (currentStep + 1) % stepsCount;

        // Timeline: after completing a full loop, advance the timeline slot
        if (currentStep === 0 && timelineLoopActive) {
            stepsInCurrentSlot = 0;
            advanceTimelineSlot();
        }
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
        // Find next filled slot after current (wraps around)
        let next = currentTimelineSlot + 1;
        let wrapped = false;
        while (next < TIMELINE_SLOTS && timelineSlots[next] === null) next++;
        if (next >= TIMELINE_SLOTS) {
            next = 0;
            wrapped = true;
            while (next < TIMELINE_SLOTS && timelineSlots[next] === null) next++;
        }
        if (!wrapped && next < TIMELINE_SLOTS && timelineSlots[next]) {
            currentTimelineSlot = next;
            currentPatternId = timelineSlots[next];
            rebuildSequencerSteps();
            updatePatternSelect();
            renderTimeline();
        } else if (wrapped && next < TIMELINE_SLOTS && timelineSlots[next]) {
            currentTimelineSlot = next;
            currentPatternId = timelineSlots[next];
            rebuildSequencerSteps();
            updatePatternSelect();
            renderTimeline();
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // Pattern Management
    // ══════════════════════════════════════════════════════════════════

    function createPattern(name) {
        const id = 'pat-' + (++patternCounter);
        const steps = {};
        INSTRUMENTS.forEach(instr => {
            steps[instr.id] = new Array(stepsCount).fill(false);
        });
        patterns[id] = { id, name: name || ('Pattern ' + patternCounter), steps };
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
    }

    function toggleStep(instrumentId, step) {
        const pat = patterns[currentPatternId];
        if (!pat) return;
        pat.steps[instrumentId][step] = !pat.steps[instrumentId][step];
        // Update the button visually
        const stepsEl = document.getElementById('dm-steps-' + instrumentId);
        if (!stepsEl) return;
        const btn = stepsEl.querySelectorAll('.dm-step-btn')[step];
        if (btn) btn.classList.toggle('dm-step-active', pat.steps[instrumentId][step]);
    }

    // ══════════════════════════════════════════════════════════════════
    // UI Building
    // ══════════════════════════════════════════════════════════════════

    function buildSequencerUI() {
        const rows = document.getElementById('dm-sequencer-rows');
        if (!rows) return;
        rows.innerHTML = '';

        // Step numbers header
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
            row.className = 'dm-row';
            row.dataset.instrument = instr.id;

            // Label
            const label = document.createElement('div');
            label.className = 'dm-instrument-label';
            label.innerHTML =
                '<span class="dm-instr-dot" style="background:' + instr.color + '"></span>' +
                instr.label;

            // Steps
            const stepsEl = document.createElement('div');
            stepsEl.className = 'dm-steps';
            stepsEl.id = 'dm-steps-' + instr.id;
            for (let s = 0; s < stepsCount; s++) {
                const btn = document.createElement('button');
                btn.className = 'dm-step-btn' + (s > 0 && s % 4 === 0 ? ' dm-group-start' : '');
                btn.dataset.step = s;
                btn.dataset.instrument = instr.id;
                btn.style.setProperty('--instr-color', instr.color);
                btn.addEventListener('click', function () {
                    toggleStep(instr.id, parseInt(this.dataset.step));
                });
                stepsEl.appendChild(btn);
            }

            // Volume slider
            const volWrap = document.createElement('div');
            volWrap.className = 'dm-row-vol';
            const vol = document.createElement('input');
            vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.01;
            vol.value = instrumentVolumes[instr.id];
            vol.className = 'dm-vol-slider';
            vol.title = instr.label + ' volume';
            vol.addEventListener('input', function () {
                instrumentVolumes[instr.id] = parseFloat(this.value);
            });
            volWrap.appendChild(vol);

            row.appendChild(label);
            row.appendChild(stepsEl);
            row.appendChild(volWrap);
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
                btn.classList.toggle('dm-step-active',
                    !!(pat.steps[instr.id] && pat.steps[instr.id][i]));
            });
        });
    }

    function updateStepHighlight(step) {
        document.querySelectorAll('.dm-step-btn.dm-playhead').forEach(el => {
            el.classList.remove('dm-playhead');
        });
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
            opt.value = p.id;
            opt.textContent = p.name;
            sel.appendChild(opt);
        });
        if (currentPatternId) sel.value = currentPatternId;
    }

    function renderTimeline() {
        const track = document.getElementById('dm-timeline-track');
        if (!track) return;
        track.innerHTML = '';
        const patIds = Object.keys(patterns);
        for (let i = 0; i < TIMELINE_SLOTS; i++) {
            const slot = document.createElement('div');
            slot.className = 'dm-timeline-slot';
            if (i === currentTimelineSlot) slot.classList.add('dm-timeline-slot-playing');
            const patId = timelineSlots[i];
            if (patId && patterns[patId]) {
                slot.classList.add('dm-timeline-slot-filled');
                slot.textContent = patterns[patId].name;
                const idx = patIds.indexOf(patId);
                slot.style.setProperty('--slot-hue', ((idx * 73) % 360) + '');
                // Indicate if this is the current pattern being edited
                if (patId === currentPatternId) {
                    slot.classList.add('dm-timeline-slot-current-pat');
                }
            } else {
                slot.textContent = (i + 1);
            }
            slot.dataset.slot = i;
            slot.addEventListener('click', function () {
                const idx = parseInt(this.dataset.slot);
                if (timelineSlots[idx] === currentPatternId) {
                    timelineSlots[idx] = null;
                } else {
                    timelineSlots[idx] = currentPatternId;
                }
                renderTimeline();
            });
            track.appendChild(slot);
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // Transport
    // ══════════════════════════════════════════════════════════════════

    function play() {
        if (isPlaying) return;
        initAudio();
        if (ctx.state === 'suspended') ctx.resume();
        isPlaying = true;
        currentStep = 0;
        nextNoteTime = ctx.currentTime + 0.05;
        stepsInCurrentSlot = 0;

        // If timeline loop is on, start from first filled slot
        if (timelineLoopActive) {
            const first = timelineSlots.findIndex(s => s !== null);
            if (first !== -1) {
                currentTimelineSlot = first;
                currentPatternId = timelineSlots[first];
                rebuildSequencerSteps();
                updatePatternSelect();
            }
        }

        scheduler();
        renderTimeline();

        const playBtn = document.getElementById('dm-play');
        const stopBtn = document.getElementById('dm-stop');
        if (playBtn) { playBtn.classList.add('dm-active'); playBtn.textContent = '▶ Playing'; }
        if (stopBtn) { stopBtn.disabled = false; }
    }

    function stop() {
        isPlaying = false;
        clearTimeout(schedulerTimer);
        schedulerTimer = null;
        currentStep = 0;
        currentTimelineSlot = -1;
        updateStepHighlight(-1);
        renderTimeline();

        const playBtn = document.getElementById('dm-play');
        const stopBtn = document.getElementById('dm-stop');
        if (playBtn) { playBtn.classList.remove('dm-active'); playBtn.textContent = '▶ Play'; }
        if (stopBtn) { stopBtn.disabled = true; }
    }

    // ══════════════════════════════════════════════════════════════════
    // Init & Event Wiring
    // ══════════════════════════════════════════════════════════════════

    function init() {
        // ── Default pattern ──────────────────────────────────────────
        const id1 = createPattern('Pattern 1');
        // Four-on-the-floor kick
        [0, 4, 8, 12].forEach(s => { patterns[id1].steps.kick[s] = true; });
        // Snare on 2 and 4
        [4, 12].forEach(s => { patterns[id1].steps.snare[s] = true; });
        // 8th-note hi-hat
        [0, 2, 4, 6, 8, 10, 12, 14].forEach(s => { patterns[id1].steps.hihat[s] = true; });

        currentPatternId = id1;

        buildSequencerUI();
        rebuildSequencerSteps();
        updatePatternSelect();
        renderTimeline();

        // ── BPM ──────────────────────────────────────────────────────
        const bpmDisplay = document.getElementById('dm-bpm-display');
        const bpmSlider  = document.getElementById('dm-bpm-slider');
        if (bpmSlider) bpmSlider.addEventListener('input', function () {
            bpm = parseInt(this.value);
            if (bpmDisplay) bpmDisplay.value = bpm;
        });
        if (bpmDisplay) bpmDisplay.addEventListener('input', function () {
            const v = Math.max(40, Math.min(240, parseInt(this.value) || 120));
            bpm = v; this.value = v;
            if (bpmSlider) bpmSlider.value = v;
        });

        // ── Transport ────────────────────────────────────────────────
        const playBtn = document.getElementById('dm-play');
        const stopBtn = document.getElementById('dm-stop');
        if (playBtn) playBtn.addEventListener('click', play);
        if (stopBtn) { stopBtn.addEventListener('click', stop); stopBtn.disabled = true; }

        // ── Steps count ──────────────────────────────────────────────
        const stepsSelect = document.getElementById('dm-steps-count');
        if (stepsSelect) stepsSelect.addEventListener('change', function () {
            const n = parseInt(this.value);
            if (n === stepsCount) return;
            const wasPlaying = isPlaying;
            if (wasPlaying) stop();
            stepsCount = n;
            Object.values(patterns).forEach(p => {
                INSTRUMENTS.forEach(instr => {
                    const old = p.steps[instr.id] || [];
                    p.steps[instr.id] = Array.from({ length: stepsCount }, (_, i) => old[i] || false);
                });
            });
            buildSequencerUI();
            rebuildSequencerSteps();
        });

        // ── Swing ────────────────────────────────────────────────────
        const swingSlider  = document.getElementById('dm-swing');
        const swingDisplay = document.getElementById('dm-swing-display');
        if (swingSlider) swingSlider.addEventListener('input', function () {
            swingAmount = parseInt(this.value) / 100;
            if (swingDisplay) swingDisplay.textContent = this.value + '%';
        });

        // ── Pattern controls ─────────────────────────────────────────
        const patSel = document.getElementById('dm-pattern-select');
        if (patSel) patSel.addEventListener('change', function () {
            loadPattern(this.value);
        });

        const patNameInput = document.getElementById('dm-pattern-name-input');
        if (patNameInput) {
            patNameInput.value = patterns[currentPatternId].name;
            patNameInput.addEventListener('input', function () {
                if (patterns[currentPatternId]) {
                    patterns[currentPatternId].name = this.value;
                    updatePatternSelect();
                    renderTimeline();
                }
            });
        }

        const newPatBtn = document.getElementById('dm-new-pattern');
        if (newPatBtn) newPatBtn.addEventListener('click', function () {
            const nid = createPattern('Pattern ' + (patternCounter));
            updatePatternSelect();
            loadPattern(nid);
        });

        const copyPatBtn = document.getElementById('dm-copy-pattern');
        if (copyPatBtn) copyPatBtn.addEventListener('click', function () {
            const src = patterns[currentPatternId];
            if (!src) return;
            const nid = createPattern(src.name + ' Copy');
            INSTRUMENTS.forEach(instr => {
                patterns[nid].steps[instr.id] = [...src.steps[instr.id]];
            });
            updatePatternSelect();
            loadPattern(nid);
        });

        const deletePatBtn = document.getElementById('dm-delete-pattern');
        if (deletePatBtn) deletePatBtn.addEventListener('click', function () {
            const ids = Object.keys(patterns);
            if (ids.length <= 1) return;
            const idx = ids.indexOf(currentPatternId);
            const dying = currentPatternId;
            delete patterns[dying];
            timelineSlots = timelineSlots.map(s => (s === dying ? null : s));
            const remaining = Object.keys(patterns);
            loadPattern(remaining[Math.max(0, idx - 1)] || remaining[0]);
            updatePatternSelect();
            renderTimeline();
        });

        // ── Timeline ─────────────────────────────────────────────────
        const addToTimelineBtn = document.getElementById('dm-save-to-timeline');
        if (addToTimelineBtn) addToTimelineBtn.addEventListener('click', function () {
            const empty = timelineSlots.findIndex(s => s === null);
            if (empty !== -1) {
                timelineSlots[empty] = currentPatternId;
                renderTimeline();
            }
        });

        const loopToggle = document.getElementById('dm-timeline-loop');
        if (loopToggle) loopToggle.addEventListener('change', function () {
            timelineLoopActive = this.checked;
        });

        const clearBtn = document.getElementById('dm-timeline-clear');
        if (clearBtn) clearBtn.addEventListener('click', function () {
            timelineSlots.fill(null);
            renderTimeline();
        });

        // ── Tab switching ────────────────────────────────────────────
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

// Auto-init when DOM is ready (script loaded at bottom of body)
DrumMachine.init();
