/**
 * Main App Controller
 * Wires hand tracking → audio engine, manages UI for multi-hand + scales.
 */

(function () {
    const videoEl = document.getElementById('webcam');
    const canvasEl = document.getElementById('overlay');
    const noCameraEl = document.getElementById('no-camera');
    const statusEl = document.getElementById('status');
    const synthSelect = document.getElementById('synth-select');
    const scaleSelect = document.getElementById('scale-select');
    const rootSelect = document.getElementById('root-select');
    const glideSlider = document.getElementById('glide-slider');
    const glideLabel = document.getElementById('glide-label');
    const waveformSelect = document.getElementById('waveform-select');
    const waveformSetting = document.getElementById('waveform-setting');
    const multihandToggle = document.getElementById('multihand-toggle');
    const hand0Row = document.getElementById('hand-0-row');
    const hand1Row = document.getElementById('hand-1-row');

    // Per-hand display elements
    const handDisplays = [
        {
            freq: document.getElementById('hand-0-freq'),
            vol: document.getElementById('hand-0-vol'),
            filter: document.getElementById('hand-0-filter'),
        },
        {
            freq: document.getElementById('hand-1-freq'),
            vol: document.getElementById('hand-1-vol'),
            filter: document.getElementById('hand-1-filter'),
        },
    ];

    // Track which voice IDs are currently active
    const activeVoices = new Set();
    let multiHandEnabled = false;

    // --- Settings event listeners ---

    synthSelect.addEventListener('change', (e) => {
        AudioEngine.setMode(e.target.value);
        // Show waveform selector only for Clean Wave mode
        waveformSetting.classList.toggle('hidden', e.target.value !== 'clean');
    });

    waveformSelect.addEventListener('change', (e) => {
        AudioEngine.setWaveform(e.target.value);
    });

    scaleSelect.addEventListener('change', (e) => {
        AudioEngine.setScale(e.target.value);
    });

    rootSelect.addEventListener('change', (e) => {
        AudioEngine.setRootNote(parseInt(e.target.value, 10));
    });

    glideSlider.addEventListener('input', (e) => {
        const ms = parseInt(e.target.value, 10);
        AudioEngine.setGlideTime(ms / 1000);
        if (ms <= 20) {
            glideLabel.textContent = 'Snap';
        } else if (ms <= 150) {
            glideLabel.textContent = ms + 'ms';
        } else {
            glideLabel.textContent = ms + 'ms (slow)';
        }
    });

    multihandToggle.addEventListener('change', (e) => {
        multiHandEnabled = e.target.checked;
        hand1Row.classList.toggle('hidden', !multiHandEnabled);
        HandTracking.setMaxHands(multiHandEnabled ? 2 : 1);

        // Stop voice 1 if switching back to single hand
        if (!multiHandEnabled) {
            AudioEngine.stopVoice(1);
            activeVoices.delete(1);
            resetHandDisplay(1);
        }
    });

    // Initialize with defaults
    AudioEngine.setScale('major');
    AudioEngine.setGlideTime(0.02);

    /**
     * Reset a hand's display to defaults.
     */
    function resetHandDisplay(id) {
        const d = handDisplays[id];
        if (!d) return;
        d.freq.textContent = '--';
        d.vol.textContent = '--%';
        d.filter.textContent = '--';
    }

    /**
     * Update a hand's display with live values.
     */
    function updateHandDisplay(id, freq, vol, openness) {
        const d = handDisplays[id];
        if (!d) return;
        const noteName = AudioEngine.getNoteName(freq);
        d.freq.textContent = noteName + ' ' + freq.toFixed(0) + 'Hz';
        d.vol.textContent = Math.round(vol * 100) + '%';
        d.filter.textContent = openness > 0.5 ? 'Open' : 'Closed';
    }

    /**
     * Handle hand tracking data (array of hands).
     */
    function onHandData(handsData) {
        noCameraEl.style.display = 'none';

        const currentIds = new Set();

        for (const hand of handsData) {
            const id = hand.id;
            if (!multiHandEnabled && id > 0) continue;

            currentIds.add(id);

            // Map hand position to synth parameters (mirrored camera)
            const freqNorm = 1 - hand.x;
            const volNorm = 1 - hand.y;
            const openness = hand.openness;

            // Update audio voice — returns quantized frequency
            const freq = AudioEngine.updateVoice(id, freqNorm, volNorm, openness);

            // Update display
            updateHandDisplay(id, freq, volNorm, openness);
            activeVoices.add(id);
        }

        // Stop voices for hands that disappeared
        for (const id of activeVoices) {
            if (!currentIds.has(id)) {
                AudioEngine.stopVoice(id);
                activeVoices.delete(id);
                resetHandDisplay(id);
            }
        }

        // Update status
        if (currentIds.size > 0) {
            statusEl.classList.add('active');
            const statusText = statusEl.childNodes[statusEl.childNodes.length - 1];
            statusText.textContent = currentIds.size > 1 ? ' Playing (2 hands)' : ' Playing';
        } else {
            statusEl.classList.remove('active');
            const statusText = statusEl.childNodes[statusEl.childNodes.length - 1];
            statusText.textContent = ' Show hand to play';
        }
    }

    // Start hand tracking (default: 1 hand)
    HandTracking.init(videoEl, canvasEl, onHandData, { maxHands: 1 });
})();
