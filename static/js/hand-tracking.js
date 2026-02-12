/**
 * Hand Tracking Module
 * MediaPipe Hands — supports 1 or 2 hands with per-hand coloring.
 */

const HandTracking = (() => {
    let hands = null;
    let camera = null;
    let onResults = null;
    let canvasCtx = null;
    let canvasEl = null;
    let maxHands = 1;

    // Per-hand colors (Beach Boys palette)
    const HAND_COLORS = [
        { line: 'rgba(255, 107, 107, 0.7)', dot: 'rgba(255, 107, 107, 0.9)' },  // coral
        { line: 'rgba(78, 205, 196, 0.7)',  dot: 'rgba(78, 205, 196, 0.9)' },   // turquoise
    ];

    const CONNECTIONS = [
        [0,1],[1,2],[2,3],[3,4],
        [0,5],[5,6],[6,7],[7,8],
        [5,9],[9,10],[10,11],[11,12],
        [9,13],[13,14],[14,15],[15,16],
        [13,17],[17,18],[18,19],[19,20],
        [0,17],
    ];

    function distance(a, b) {
        return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2);
    }

    function getOpenness(landmarks) {
        const wrist = landmarks[0];
        const tipIndices = [8, 12, 16, 20];
        const mcpIndices = [5, 9, 13, 17];

        let extended = 0;
        for (let i = 0; i < tipIndices.length; i++) {
            const tipDist = distance(landmarks[tipIndices[i]], wrist);
            const mcpDist = distance(landmarks[mcpIndices[i]], wrist);
            if (tipDist > mcpDist * 1.1) extended++;
        }
        return extended / tipIndices.length;
    }

    function drawHand(landmarks, width, height, colorIdx) {
        const colors = HAND_COLORS[colorIdx % HAND_COLORS.length];

        canvasCtx.strokeStyle = colors.line;
        canvasCtx.lineWidth = 2;

        for (const [a, b] of CONNECTIONS) {
            canvasCtx.beginPath();
            canvasCtx.moveTo(landmarks[a].x * width, landmarks[a].y * height);
            canvasCtx.lineTo(landmarks[b].x * width, landmarks[b].y * height);
            canvasCtx.stroke();
        }

        for (const lm of landmarks) {
            canvasCtx.beginPath();
            canvasCtx.arc(lm.x * width, lm.y * height, 4, 0, 2 * Math.PI);
            canvasCtx.fillStyle = colors.dot;
            canvasCtx.fill();
        }
    }

    function extractHandData(landmarks) {
        const wrist = landmarks[0];
        const palm = landmarks[9];
        const x = (wrist.x + palm.x) / 2;
        const y = (wrist.y + palm.y) / 2;
        const openness = getOpenness(landmarks);
        return { x, y, openness };
    }

    function processResults(results) {
        const width = canvasEl.width;
        const height = canvasEl.height;
        canvasCtx.clearRect(0, 0, width, height);

        const handsList = results.multiHandLandmarks || [];
        const handsData = [];

        for (let i = 0; i < handsList.length; i++) {
            const landmarks = handsList[i];
            drawHand(landmarks, width, height, i);
            handsData.push({
                id: i,
                ...extractHandData(landmarks),
            });
        }

        if (onResults) {
            onResults(handsData);
        }
    }

    /**
     * Initialize hand tracking.
     * @param {HTMLVideoElement} videoEl
     * @param {HTMLCanvasElement} canvas
     * @param {Function} callback - receives array of hand data objects
     * @param {object} opts - { maxHands: 1|2 }
     */
    function init(videoEl, canvas, callback, opts) {
        onResults = callback;
        canvasEl = canvas;
        canvasCtx = canvas.getContext('2d');
        maxHands = (opts && opts.maxHands) || 1;

        hands = new Hands({
            locateFile: (file) =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
            maxNumHands: maxHands,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.5,
        });

        hands.onResults(processResults);

        camera = new Camera(videoEl, {
            onFrame: async () => {
                canvas.width = videoEl.videoWidth;
                canvas.height = videoEl.videoHeight;
                await hands.send({ image: videoEl });
            },
            width: 640,
            height: 480,
        });

        camera.start();
    }

    /**
     * Change maxNumHands at runtime (re-init required).
     */
    function setMaxHands(n) {
        maxHands = n;
        if (hands) {
            hands.setOptions({ maxNumHands: n });
        }
    }

    function stop() {
        if (camera) camera.stop();
    }

    return { init, stop, setMaxHands };
})();
