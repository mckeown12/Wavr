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
    const attackSlider = document.getElementById('attack-slider');
    const attackLabel = document.getElementById('attack-label');
    const decaySlider = document.getElementById('decay-slider');
    const decayLabel = document.getElementById('decay-label');
    const sustainSlider = document.getElementById('sustain-slider');
    const sustainLabel = document.getElementById('sustain-label');
    const releaseSlider = document.getElementById('release-slider');
    const releaseLabel = document.getElementById('release-label');
    const waveformSelect = document.getElementById('waveform-select');
    const waveformSetting = document.getElementById('waveform-setting');
    const multihandToggle = document.getElementById('multihand-toggle');
    const fingerToggle = document.getElementById('finger-toggle');
    const lowNoteSelect = document.getElementById('low-note-select');
    const highNoteSelect = document.getElementById('high-note-select');
    const wavetableContainer = document.getElementById('wavetable-container');
    const wavetableCanvas = document.getElementById('wavetable-canvas');
    const wavetableClear = document.getElementById('wavetable-clear');
    const wavetableApply = document.getElementById('wavetable-apply');
    const recordStart = document.getElementById('record-start');
    const recordStop = document.getElementById('record-stop');
    const recordingTimer = document.getElementById('recording-timer');
    const recordingStatus = document.getElementById('recording-status');
    const hand0Row = document.getElementById('hand-0-row');
    const hand1Row = document.getElementById('hand-1-row');
    const webcamContainer = document.getElementById('webcam-container');
    const fullscreenBtn = document.getElementById('fullscreen-btn');

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
    let fingerModeEnabled = false;

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
        redrawNoteLines();
    });

    rootSelect.addEventListener('change', (e) => {
        AudioEngine.setRootNote(parseInt(e.target.value, 10));
        redrawNoteLines();
    });

    lowNoteSelect.addEventListener('change', (e) => {
        updateNoteRange();
    });

    highNoteSelect.addEventListener('change', (e) => {
        updateNoteRange();
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

    attackSlider.addEventListener('input', (e) => {
        const ms = parseInt(e.target.value, 10);
        AudioEngine.setAttack(ms / 1000);
        attackLabel.textContent = ms + 'ms';
    });

    decaySlider.addEventListener('input', (e) => {
        const ms = parseInt(e.target.value, 10);
        AudioEngine.setDecay(ms / 1000);
        decayLabel.textContent = ms + 'ms';
    });

    sustainSlider.addEventListener('input', (e) => {
        const percent = parseInt(e.target.value, 10);
        AudioEngine.setSustain(percent / 100);
        sustainLabel.textContent = percent + '%';
    });

    releaseSlider.addEventListener('input', (e) => {
        const ms = parseInt(e.target.value, 10);
        AudioEngine.setRelease(ms / 1000);
        releaseLabel.textContent = ms + 'ms';
    });

    multihandToggle.addEventListener('change', (e) => {
        multiHandEnabled = e.target.checked;
        hand1Row.classList.toggle('hidden', !multiHandEnabled);
        HandTracking.setMaxHands(multiHandEnabled ? 2 : 1);

        // Stop voice 1 if switching back to single hand
        if (!multiHandEnabled) {
            AudioEngine.stopVoice(1);
            activeVoices.delete(1);
            activeNoteVisuals.delete(1);
            resetHandDisplay(1);
        }
    });

    fingerToggle.addEventListener('change', (e) => {
        fingerModeEnabled = e.target.checked;
        // Stop all voices when switching modes
        AudioEngine.stopAll();
        activeVoices.clear();
        activeNoteVisuals.clear();
        resetHandDisplay(0);
        resetHandDisplay(1);
    });

    // --- Fullscreen functionality ---

    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            webcamContainer.requestFullscreen().catch(err => {
                console.error('Error attempting to enable fullscreen:', err);
            });
        } else {
            document.exitFullscreen();
        }
    });

    // Update button icon when fullscreen state changes
    document.addEventListener('fullscreenchange', () => {
        const icon = fullscreenBtn.querySelector('.fullscreen-icon');
        if (document.fullscreenElement) {
            icon.textContent = '⛶'; // Exit fullscreen icon
            fullscreenBtn.title = 'Exit Fullscreen';
        } else {
            icon.textContent = '⛶'; // Enter fullscreen icon
            fullscreenBtn.title = 'Toggle Fullscreen';
        }
    });

    // Initialize with defaults
    AudioEngine.setScale('major');
    AudioEngine.setGlideTime(0.02);

    // Current note lines cache
    let noteLines = [];

    // Active note visuals for "attack from above" animation
    const activeNoteVisuals = new Map(); // voiceId -> { x, startTime, freq }

    /**
     * Update the frequency range based on low/high note selectors.
     */
    function updateNoteRange() {
        const lowMidi = parseInt(lowNoteSelect.value, 10);
        const highMidi = parseInt(highNoteSelect.value, 10);

        if (lowMidi >= highMidi) {
            // Invalid range, swap them
            const temp = lowNoteSelect.value;
            lowNoteSelect.value = highNoteSelect.value;
            highNoteSelect.value = temp;
            updateNoteRange();
            return;
        }

        const lowFreq = AudioEngine.midiToFreq(lowMidi);
        const highFreq = AudioEngine.midiToFreq(highMidi);
        AudioEngine.setFreqRange(lowFreq, highFreq);
        redrawNoteLines();
    }

    /**
     * Recalculate note lines for the current scale/range.
     */
    function redrawNoteLines() {
        noteLines = AudioEngine.getScaleNotes();
    }

    // Initialize note lines
    updateNoteRange();

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
        d.vol.textContent = 'ADSR';
        d.filter.textContent = openness > 0.5 ? 'Open' : 'Closed';
    }

    /**
     * Draw vertical lines for each note in the scale.
     */
    function drawNoteLines() {
        if (noteLines.length === 0) return;

        const width = canvasEl.width;
        const height = canvasEl.height;
        const range = AudioEngine.getFreqRange();
        const freqSpan = Math.log(range.max / range.min);

        canvasEl.getContext('2d').save();
        const ctx = canvasEl.getContext('2d');

        for (const note of noteLines) {
            // Calculate x position (mirrored: right = low freq, left = high freq)
            const freqNorm = (Math.log(note.freq / range.min) / freqSpan);
            const x = width * (1 - freqNorm);

            // Draw vertical line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();

            // Draw note label at bottom (flip text back so it's readable)
            ctx.save();
            ctx.scale(-1, 1);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.font = '10px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(note.name, -x, height - 5);
            ctx.restore();
        }

        ctx.restore();
    }

    /**
     * Draw active note attack indicators from above.
     */
    function drawNoteAttacks() {
        if (activeNoteVisuals.size === 0) return;

        const width = canvasEl.width;
        const height = canvasEl.height;
        const ctx = canvasEl.getContext('2d');
        const now = performance.now() / 1000; // current time in seconds
        const adsr = AudioEngine.getADSR();

        ctx.save();

        for (const [voiceId, visual] of activeNoteVisuals.entries()) {
            const elapsed = now - visual.startTime;
            const x = visual.x;

            // Calculate ADSR envelope position (0-1)
            let envValue = 0;
            let envPhase = 'attack';

            if (elapsed < adsr.attack) {
                // Attack phase: 0 -> 1
                envValue = elapsed / adsr.attack;
                envPhase = 'attack';
            } else if (elapsed < adsr.attack + adsr.decay) {
                // Decay phase: 1 -> sustain
                const decayProgress = (elapsed - adsr.attack) / adsr.decay;
                envValue = 1 - (1 - adsr.sustain) * decayProgress;
                envPhase = 'decay';
            } else {
                // Sustain phase
                envValue = adsr.sustain;
                envPhase = 'sustain';
            }

            // Draw indicator dropping from top
            // Y position: starts at 0 (top) and drops down during attack, then stays
            const maxDrop = height * 0.3; // Max 30% of screen height
            let y = 0;

            if (envPhase === 'attack') {
                y = maxDrop * envValue;
            } else {
                y = maxDrop;
            }

            // Indicator size based on envelope value
            const radius = 10 + envValue * 20;
            const alpha = 0.4 + envValue * 0.4;

            // Draw glow
            ctx.fillStyle = `rgba(255, 107, 107, ${alpha * 0.3})`;
            ctx.beginPath();
            ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
            ctx.fill();

            // Draw main circle
            ctx.fillStyle = `rgba(255, 107, 107, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();

            // Draw vertical line from indicator to bottom
            ctx.strokeStyle = `rgba(255, 107, 107, ${alpha * 0.3})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * Handle hand tracking data (array of hands).
     */
    function onHandData(handsData) {
        noCameraEl.style.display = 'none';

        // Draw note lines first (so they appear behind hands)
        drawNoteLines();

        // Draw note attack indicators
        drawNoteAttacks();

        if (fingerModeEnabled) {
            handleFingerMode(handsData);
        } else {
            handleHandMode(handsData);
        }
    }

    /**
     * Handle regular hand mode (1-2 hands).
     */
    function handleHandMode(handsData) {
        const currentIds = new Set();

        for (const hand of handsData) {
            const id = hand.id;
            if (!multiHandEnabled && id > 0) continue;

            currentIds.add(id);

            // Map hand position to synth parameters (mirrored camera)
            const freqNorm = 1 - hand.x;
            const yPos = 1 - hand.y; // Y position (0 = bottom, 1 = top)
            const openness = hand.openness;

            // Check if this is a new voice (trigger attack visual)
            const isNewVoice = !activeVoices.has(id);

            // Volume is now controlled entirely by ADSR envelope
            // Fixed at 0.7 for good sustain level
            const volNorm = 0.7;

            // Update audio voice — returns quantized frequency
            const freq = AudioEngine.updateVoice(id, freqNorm, volNorm, openness);

            // If new voice, add attack visual
            if (isNewVoice) {
                const range = AudioEngine.getFreqRange();
                const freqSpan = Math.log(range.max / range.min);
                const freqNormLog = (Math.log(freq / range.min) / freqSpan);
                const x = canvasEl.width * (1 - freqNormLog);
                activeNoteVisuals.set(id, {
                    x: x,
                    startTime: performance.now() / 1000,
                    freq: freq
                });
            } else {
                // Update x position for existing visual
                const visual = activeNoteVisuals.get(id);
                if (visual) {
                    const range = AudioEngine.getFreqRange();
                    const freqSpan = Math.log(range.max / range.min);
                    const freqNormLog = (Math.log(freq / range.min) / freqSpan);
                    visual.x = canvasEl.width * (1 - freqNormLog);
                    visual.freq = freq;
                }
            }

            // Update display
            updateHandDisplay(id, freq, volNorm, openness);
            activeVoices.add(id);
        }

        // Stop voices for hands that disappeared
        for (const id of activeVoices) {
            if (!currentIds.has(id)) {
                AudioEngine.stopVoice(id);
                activeVoices.delete(id);
                activeNoteVisuals.delete(id);
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

    /**
     * Handle finger mode (up to 10 individual fingers).
     */
    function handleFingerMode(handsData) {
        const currentIds = new Set();

        for (const hand of handsData) {
            const handId = hand.id;
            if (!multiHandEnabled && handId > 0) continue;

            // Each finger gets a voice ID: handId*5 + fingerIndex (0-9)
            for (let i = 0; i < hand.fingers.length; i++) {
                const finger = hand.fingers[i];
                const voiceId = handId * 5 + i;
                currentIds.add(voiceId);

                // Map finger position to synth parameters (mirrored camera)
                const freqNorm = 1 - finger.x;
                const yPos = 1 - finger.y;

                // Simple threshold: only play if finger is in upper half
                if (yPos > 0.3) {
                    const isNewVoice = !activeVoices.has(voiceId);
                    // Fixed volume - ADSR controls envelope
                    const freq = AudioEngine.updateVoice(voiceId, freqNorm, 0.6, 0.5);

                    // If new voice, add attack visual
                    if (isNewVoice) {
                        const range = AudioEngine.getFreqRange();
                        const freqSpan = Math.log(range.max / range.min);
                        const freqNormLog = (Math.log(freq / range.min) / freqSpan);
                        const x = canvasEl.width * (1 - freqNormLog);
                        activeNoteVisuals.set(voiceId, {
                            x: x,
                            startTime: performance.now() / 1000,
                            freq: freq
                        });
                    } else {
                        // Update x position for existing visual
                        const visual = activeNoteVisuals.get(voiceId);
                        if (visual) {
                            const range = AudioEngine.getFreqRange();
                            const freqSpan = Math.log(range.max / range.min);
                            const freqNormLog = (Math.log(freq / range.min) / freqSpan);
                            visual.x = canvasEl.width * (1 - freqNormLog);
                            visual.freq = freq;
                        }
                    }

                    activeVoices.add(voiceId);
                }
            }
        }

        // Stop voices for fingers that disappeared or moved down
        for (const id of activeVoices) {
            if (!currentIds.has(id)) {
                AudioEngine.stopVoice(id);
                activeVoices.delete(id);
                activeNoteVisuals.delete(id);
            }
        }

        // Update status
        if (activeVoices.size > 0) {
            statusEl.classList.add('active');
            const statusText = statusEl.childNodes[statusEl.childNodes.length - 1];
            statusText.textContent = ` Finger Mode (${activeVoices.size} notes)`;
        } else {
            statusEl.classList.remove('active');
            const statusText = statusEl.childNodes[statusEl.childNodes.length - 1];
            statusText.textContent = ' Raise fingers to play';
        }

        // Update hand display with aggregate data
        if (handsData.length > 0) {
            const hand = handsData[0];
            const avgFreqNorm = hand.fingers.reduce((sum, f) => sum + (1 - f.x), 0) / hand.fingers.length;
            const avgVolNorm = hand.fingers.reduce((sum, f) => sum + (1 - f.y), 0) / hand.fingers.length;
            const freq = AudioEngine.getFrequency(avgFreqNorm);
            updateHandDisplay(0, freq, avgVolNorm, 0.5);
        } else {
            resetHandDisplay(0);
        }
    }

    // --- Wave Table Drawing ---

    let isDrawing = false;
    let wavetablePoints = [];
    const wtCtx = wavetableCanvas.getContext('2d');

    function clearWavetableCanvas() {
        wtCtx.clearRect(0, 0, wavetableCanvas.width, wavetableCanvas.height);
        drawWavetableGrid();
    }

    function clearWavetable() {
        wavetablePoints = [];
        clearWavetableCanvas();
    }

    function drawWavetableGrid() {
        wtCtx.strokeStyle = '#f0e8d8';
        wtCtx.lineWidth = 1;

        // Center line
        wtCtx.beginPath();
        wtCtx.moveTo(0, wavetableCanvas.height / 2);
        wtCtx.lineTo(wavetableCanvas.width, wavetableCanvas.height / 2);
        wtCtx.stroke();

        // Quarter lines
        wtCtx.strokeStyle = '#f8f4e8';
        wtCtx.beginPath();
        wtCtx.moveTo(0, wavetableCanvas.height / 4);
        wtCtx.lineTo(wavetableCanvas.width, wavetableCanvas.height / 4);
        wtCtx.moveTo(0, wavetableCanvas.height * 3 / 4);
        wtCtx.lineTo(wavetableCanvas.width, wavetableCanvas.height * 3 / 4);
        wtCtx.stroke();
    }

    function drawWavetableCurve() {
        if (wavetablePoints.length < 2) return;

        wtCtx.strokeStyle = '#FF6B6B';
        wtCtx.lineWidth = 2;
        wtCtx.lineCap = 'round';
        wtCtx.lineJoin = 'round';

        wtCtx.beginPath();
        wtCtx.moveTo(wavetablePoints[0].x, wavetablePoints[0].y);
        for (let i = 1; i < wavetablePoints.length; i++) {
            wtCtx.lineTo(wavetablePoints[i].x, wavetablePoints[i].y);
        }
        wtCtx.stroke();
    }

    wavetableCanvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        const rect = wavetableCanvas.getBoundingClientRect();
        wavetablePoints = [{ x: e.clientX - rect.left, y: e.clientY - rect.top }];
    });

    wavetableCanvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        const rect = wavetableCanvas.getBoundingClientRect();
        wavetablePoints.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        clearWavetableCanvas();
        drawWavetableCurve();
    });

    wavetableCanvas.addEventListener('mouseup', () => {
        isDrawing = false;
    });

    wavetableCanvas.addEventListener('mouseleave', () => {
        isDrawing = false;
    });

    wavetableClear.addEventListener('click', () => {
        clearWavetable();
        AudioEngine.setWaveform('sine'); // Reset to default
    });

    wavetableApply.addEventListener('click', () => {
        if (wavetablePoints.length < 10) {
            alert('Draw a longer wave shape!');
            return;
        }

        // Convert drawn points to wave table data
        const waveData = [];
        const width = wavetableCanvas.width;
        const height = wavetableCanvas.height;

        // Sample 2048 points from the drawn curve
        for (let i = 0; i < 2048; i++) {
            const x = (i / 2048) * width;

            // Find closest drawn point
            let closestPoint = wavetablePoints[0];
            let minDist = Math.abs(wavetablePoints[0].x - x);

            for (const point of wavetablePoints) {
                const dist = Math.abs(point.x - x);
                if (dist < minDist) {
                    minDist = dist;
                    closestPoint = point;
                }
            }

            // Convert Y position to wave value (-1 to 1)
            const value = (closestPoint.y / height) * 2 - 1;
            waveData.push(-value); // Flip so up is positive
        }

        AudioEngine.setCustomWave(waveData);
        recordingStatus.textContent = 'Custom wave applied! Select Clean Wave mode to hear it.';
        setTimeout(() => { recordingStatus.textContent = ''; }, 3000);
    });

    // Initialize wavetable
    clearWavetable();

    // --- Recording ---

    let mediaRecorder = null;
    let recordedChunks = [];
    let recordingStartTime = 0;
    let recordingInterval = null;

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    recordStart.addEventListener('click', async () => {
        try {
            // Create a separate canvas for recording that combines video + overlay
            const recordCanvas = document.createElement('canvas');
            const recordCtx = recordCanvas.getContext('2d');

            // Set canvas size to match video
            recordCanvas.width = canvasEl.width;
            recordCanvas.height = canvasEl.height;

            // Start capturing the canvas at 30fps
            const canvasStream = recordCanvas.captureStream(30);

            // Get the synthesized audio stream from the audio engine
            const audioStream = AudioEngine.getAudioStream();

            // Create a combined stream with video + overlay + synthesized audio
            const combinedStream = new MediaStream();
            canvasStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));
            audioStream.getAudioTracks().forEach(track => combinedStream.addTrack(track));

            // Draw video + overlay to recording canvas continuously
            let animationId;
            function drawRecordingFrame() {
                // Draw mirrored video
                recordCtx.save();
                recordCtx.scale(-1, 1);
                recordCtx.drawImage(videoEl, -recordCanvas.width, 0, recordCanvas.width, recordCanvas.height);
                recordCtx.restore();

                // Draw overlay canvas (already mirrored)
                recordCtx.save();
                recordCtx.scale(-1, 1);
                recordCtx.drawImage(canvasEl, -recordCanvas.width, 0, recordCanvas.width, recordCanvas.height);
                recordCtx.restore();

                // Add recording indicator
                recordCtx.fillStyle = 'rgba(255, 107, 107, 0.9)';
                recordCtx.beginPath();
                recordCtx.arc(20, 20, 8, 0, 2 * Math.PI);
                recordCtx.fill();
                recordCtx.fillStyle = 'white';
                recordCtx.font = 'bold 14px Inter';
                recordCtx.fillText('REC', 35, 26);

                animationId = requestAnimationFrame(drawRecordingFrame);
            }
            drawRecordingFrame();

            mediaRecorder = new MediaRecorder(combinedStream, {
                mimeType: 'video/webm;codecs=vp9,opus'
            });

            recordedChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                // Stop the recording animation
                cancelAnimationFrame(animationId);

                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);

                // Create download link
                const a = document.createElement('a');
                a.href = url;
                a.download = `wavr-recording-${Date.now()}.webm`;
                a.click();

                recordingStatus.textContent = 'Recording saved!';
                setTimeout(() => { recordingStatus.textContent = ''; }, 3000);

                URL.revokeObjectURL(url);
            };

            mediaRecorder.start();
            recordingStartTime = Date.now();

            // Update UI
            recordStart.classList.add('hidden');
            recordStart.disabled = true;
            recordStop.classList.remove('hidden');
            recordStop.disabled = false;
            recordStop.classList.add('recording');
            recordingTimer.classList.remove('hidden');
            recordingStatus.textContent = 'Recording...';

            // Start timer
            recordingInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
                recordingTimer.textContent = formatTime(elapsed);
            }, 1000);

        } catch (err) {
            console.error('Error starting recording:', err);
            recordingStatus.textContent = 'Error: Could not start recording. ' + err.message;
        }
    });

    recordStop.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            clearInterval(recordingInterval);

            // Update UI
            recordStart.classList.remove('hidden');
            recordStart.disabled = false;
            recordStop.classList.add('hidden');
            recordStop.disabled = true;
            recordStop.classList.remove('recording');
            recordingTimer.classList.add('hidden');
            recordingTimer.textContent = '00:00';
        }
    });

    // Start hand tracking (default: 1 hand)
    HandTracking.init(videoEl, canvasEl, onHandData, { maxHands: 1 });
})();
