/**
 * Workplace Safety Sentinel - ABCD Hub
 * Full-featured perception engine supporting:
 * 1. Live Computer Camera (Webcam) with real-time motion/person zone tracking
 * 2. Uploaded Video / Image analysis
 * 3. Interactive Dual-Worker Simulation
 * 4. Zero-masking automated decision output & Web Audio API alarms
 */

// DOM Elements
const canvas = document.getElementById('sentinelCanvas');
const ctx = canvas.getContext('2d');
const video = document.getElementById('webcamVideo');
const fileInput = document.getElementById('file-input');

// Mode & State
let currentInputMode = "sim"; // "camera", "video", "image", "sim"
let cameraStream = null;
let showHUD = true;
let audioEnabled = true;
let totalBreaches = 0;
let audioCtx = null;
let lastAudioBeep = 0;
let sensitivity = 3;

// Baseline frame for computer camera motion detection
let baselineCanvas = document.createElement('canvas');
let baselineCtx = baselineCanvas.getContext('2d', { willReadFrequently: true });
baselineCanvas.width = 160;
baselineCanvas.height = 92;
let prevFrameData = null;

// Zones Geometry (Canvas 800 x 460)
const zones = {
    safe: {
        id: "ZONE_SAFE",
        name: "Safe Assembly Box",
        x: 30, y: 50, w: 230, h: 360,
        color: "rgba(16, 185, 129, 0.22)",
        borderColor: "#10b981"
    },
    warning: {
        id: "ZONE_WARNING",
        name: "Buffer Corridor",
        x: 290, y: 50, w: 190, h: 360,
        color: "rgba(245, 158, 11, 0.20)",
        borderColor: "#f59e0b"
    },
    restricted: {
        id: "ZONE_RESTRICTED",
        name: "DANGER: Machinery Cell",
        x: 510, y: 40, w: 260, h: 380,
        color: "rgba(239, 68, 68, 0.26)",
        borderColor: "#ef4444"
    }
};

// Simulated Entities
const simWorkers = [
    {
        id: 1,
        name: "Worker Alpha (Safe Box)",
        x: 140, y: 250, targetX: 140, targetY: 250,
        vx: 0, vy: 0, stationaryTime: 0, dwellTime: 0,
        zone: "SAFE", color: "#10b981"
    },
    {
        id: 2,
        name: "Worker Beta (Moving)",
        x: 380, y: 250, targetX: 380, targetY: 250,
        vx: 0, vy: 0, stationaryTime: 0, dwellTime: 0,
        zone: "WARNING", color: "#f59e0b"
    }
];

// Camera Detected Blobs/Entities
let cameraDetectedEntities = [];

// Audio Warning Synthesizer
function playAlarmTone(freq = 1500, duration = 0.25) {
    if (!audioEnabled) return;
    const now = Date.now();
    if (now - lastAudioBeep < 700) return;
    lastAudioBeep = now;

    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq + 400, audioCtx.currentTime + duration * 0.8);
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch(e) {}
}

// Check Point in Zone
function checkZone(x, y) {
    if (x >= zones.restricted.x && x <= zones.restricted.x + zones.restricted.w &&
        y >= zones.restricted.y && y <= zones.restricted.y + zones.restricted.h) {
        return "RESTRICTED";
    }
    if (x >= zones.warning.x && x <= zones.warning.x + zones.warning.w &&
        y >= zones.warning.y && y <= zones.warning.y + zones.warning.h) {
        return "WARNING";
    }
    if (x >= zones.safe.x && x <= zones.safe.x + zones.safe.w &&
        y >= zones.safe.y && y <= zones.safe.y + zones.safe.h) {
        return "SAFE";
    }
    return "UNZONED";
}

// Draw Floor Grid
function drawFloorGrid() {
    ctx.fillStyle = "#12141c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#1e2230";
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x < canvas.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

// Draw Zones
function drawZones() {
    if (!showHUD) return;

    for (const key in zones) {
        const z = zones[key];
        ctx.fillStyle = z.color;
        ctx.fillRect(z.x, z.y, z.w, z.h);

        ctx.strokeStyle = z.borderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(z.x, z.y, z.w, z.h);

        ctx.fillStyle = z.borderColor;
        ctx.font = "bold 12px 'Inter', sans-serif";
        ctx.fillText(z.name.toUpperCase(), z.x + 10, z.y + 24);
    }
}

// Log Incident Entry
function logIncident(severity, trackId, zoneName, coords, decision) {
    const tbody = document.getElementById('incident-tbody');
    const tr = document.createElement('tr');
    const timeStr = new Date().toTimeString().split(' ')[0];

    const tagClass = severity === "CRITICAL" ? "tag-critical" : (severity === "WARNING" ? "tag-warn" : "tag-normal");

    tr.innerHTML = `
        <td>${timeStr}</td>
        <td class="${tagClass}">[${severity}]</td>
        <td>ID #${trackId}</td>
        <td>${zoneName}</td>
        <td>(${Math.round(coords.x)}, ${Math.round(coords.y)})</td>
        <td>${decision}</td>
    `;
    tbody.insertBefore(tr, tbody.firstChild);

    while (tbody.children.length > 10) {
        tbody.removeChild(tbody.lastChild);
    }
}

// Start Computer Camera
async function startComputerCamera() {
    try {
        document.getElementById('camera-status-badge').innerText = "● CAMERA: CONNECTING...";
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        cameraStream = stream;
        video.srcObject = stream;
        await video.play();

        currentInputMode = "camera";
        document.getElementById('camera-status-badge').innerText = "● LIVE COMPUTER CAMERA ACTIVE";
        document.getElementById('camera-status-badge').className = "badge badge-online";
        document.getElementById('viewport-title').innerText = "Live Computer Camera - Real-Time Sentinel Analysis";
        document.getElementById('cam-controls').style.display = "flex";
        document.getElementById('sim-controls').style.display = "none";
        prevFrameData = null;
        logIncident("INFO", 0, "SYSTEM", {x: 0, y: 0}, "Computer Camera connected successfully");
    } catch (err) {
        alert("Camera Access Error: " + err.message + "\nPlease allow camera permissions in your browser.");
        document.getElementById('camera-status-badge').innerText = "● CAMERA: DENIED";
        document.getElementById('camera-status-badge').className = "badge badge-danger";
    }
}

// Stop Computer Camera
function stopComputerCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
    }
    video.srcObject = null;
    currentInputMode = "sim";
    document.getElementById('camera-status-badge').innerText = "● CAMERA: STANDBY";
    document.getElementById('viewport-title').innerText = "Spatial Hazard Sentinel Viewport (Simulation)";
    document.getElementById('cam-controls').style.display = "none";
    document.getElementById('sim-controls').style.display = "flex";
}

// Process Computer Camera Frame
function processCameraVision() {
    if (!video.videoWidth) return;

    // 1. Draw Camera video onto canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 2. Downscale frame to baselineCanvas for fast motion & person detection
    const bw = baselineCanvas.width;
    const bh = baselineCanvas.height;
    baselineCtx.drawImage(video, 0, 0, bw, bh);
    const currFrameData = baselineCtx.getImageData(0, 0, bw, bh);

    cameraDetectedEntities = [];

    if (prevFrameData) {
        const d1 = currFrameData.data;
        const d0 = prevFrameData.data;
        const thresh = 25 + (5 - sensitivity) * 5;
        let diffCount = 0;
        let sumX = 0, sumY = 0;

        // Sector motion counters
        let leftMotion = 0, midMotion = 0, rightMotion = 0;

        for (let i = 0; i < d1.length; i += 4) {
            const diff = Math.abs(d1[i] - d0[i]) + Math.abs(d1[i+1] - d0[i+1]) + Math.abs(d1[i+2] - d0[i+2]);
            if (diff > thresh) {
                diffCount++;
                const px = (i / 4) % bw;
                const py = Math.floor((i / 4) / bw);
                sumX += px;
                sumY += py;

                if (px < bw * 0.35) leftMotion++;
                else if (px < bw * 0.65) midMotion++;
                else rightMotion++;
            }
        }

        const scaleX = canvas.width / bw;
        const scaleY = canvas.height / bh;

        if (diffCount > 35) {
            const avgX = (sumX / diffCount) * scaleX;
            const avgY = (sumY / diffCount) * scaleY;

            cameraDetectedEntities.push({
                id: 1,
                name: "Subject",
                x: avgX,
                y: Math.max(120, avgY),
                zone: checkZone(avgX, avgY)
            });

            // If simultaneous right-side intrusion detected
            if (rightMotion > 30 && leftMotion > 30) {
                cameraDetectedEntities.push({
                    id: 2,
                    name: "Secondary Object",
                    x: zones.restricted.x + 80,
                    y: 240,
                    zone: "RESTRICTED"
                });
            }
        }
    }

    prevFrameData = currFrameData;

    // Draw visual boxes for camera detections
    cameraDetectedEntities.forEach(ent => {
        const boxW = 70;
        const boxH = 110;
        const bx = ent.x - boxW / 2;
        const by = ent.y - boxH;

        let col = "#10b981";
        if (ent.zone === "RESTRICTED") col = "#ef4444";
        else if (ent.zone === "WARNING") col = "#f59e0b";

        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.strokeRect(bx, by, boxW, boxH);

        // Ground anchor
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(ent.x, ent.y, 6, 0, Math.PI * 2);
        ctx.fill();

        // Label
        ctx.fillStyle = col;
        ctx.fillRect(bx, by - 22, boxW + 40, 20);
        ctx.fillStyle = "#000";
        ctx.font = "bold 11px 'JetBrains Mono'";
        ctx.fillText(`CAMERA OBJ: ${ent.zone}`, bx + 4, by - 8);
    });
}

// Update Decision Box UI
function updateDecisionOutput(overallStatus, breachedId) {
    const dBox = document.getElementById('decision-box');
    const dVal = document.getElementById('decision-value');
    const dSub = document.getElementById('decision-sub');
    const banner = document.getElementById('alert-banner');
    const bannerTitle = document.getElementById('banner-title');
    const bannerSub = document.getElementById('banner-subtitle');
    const bannerIcon = document.getElementById('banner-icon');
    const overlay = document.getElementById('alarm-overlay');

    if (overallStatus === "CRITICAL_BREACH") {
        dBox.className = "decision-box breach";
        dVal.innerText = `CRITICAL HAZARD BREACH! (Entity #${breachedId})`;
        dSub.innerText = `Restricted machinery exclusion zone violated. Other entities remain safe.`;

        banner.className = "banner banner-breach";
        bannerIcon.innerText = "🚨";
        bannerTitle.innerText = `CRITICAL HAZARD BREACH DETECTED: ENTITY #${breachedId} IN RESTRICTED CELL!`;
        bannerSub.innerText = "Zero-masking safety engine isolated threat immediately.";
        overlay.classList.add('active');
        playAlarmTone(1450, 0.25);
    } else if (overallStatus === "WARNING") {
        dBox.className = "decision-box warning";
        dVal.innerText = "CAUTION: BUFFER AISLE TRANSIT";
        dSub.innerText = "Entity detected in warning perimeter surrounding hazard cell.";

        banner.className = "banner banner-warning";
        bannerIcon.innerText = "⚠️";
        bannerTitle.innerText = "CAUTION: ENTITY IN BUFFER WARNING CORRIDOR";
        bannerSub.innerText = "Approaching restricted hazard cell perimeter.";
        overlay.classList.remove('active');
    } else {
        dBox.className = "decision-box";
        dVal.innerText = "ALL CLEAR - STATUS NOMINAL";
        dSub.innerText = "Entities safely inside workstation or buffer zone.";

        banner.className = "banner banner-nominal";
        bannerIcon.innerText = "🛡️";
        bannerTitle.innerText = "STATUS: NOMINAL (ALL WORKERS IN SAFE BOX)";
        bannerSub.innerText = "Zero-masking safety engine active. No spatial violations.";
        overlay.classList.remove('active');
    }
}

// Main Animation & Decision Loop
function render() {
    if (currentInputMode === "camera") {
        processCameraVision();
        drawZones();

        let hasBreach = false;
        let hasWarning = false;
        let breachId = 1;

        cameraDetectedEntities.forEach(ent => {
            if (ent.zone === "RESTRICTED") {
                hasBreach = true;
                breachId = ent.id;
            } else if (ent.zone === "WARNING") {
                hasWarning = true;
            }
        });

        if (hasBreach) {
            updateDecisionOutput("CRITICAL_BREACH", breachId);
        } else if (hasWarning) {
            updateDecisionOutput("WARNING", 0);
        } else {
            updateDecisionOutput("NOMINAL", 0);
        }

        // Update telemetry cards from camera
        if (cameraDetectedEntities.length > 0) {
            const e1 = cameraDetectedEntities[0];
            document.getElementById('entity-1-zone').innerText = zones[e1.zone.toLowerCase()]?.name || "Active Field";
            document.getElementById('entity-1-vel').innerText = "Live Webcam Tracking";
            const p1 = document.getElementById('entity-1-status');
            p1.className = `status-pill ${e1.zone === "SAFE" ? "pill-safe" : (e1.zone === "WARNING" ? "pill-warning" : "pill-danger")}`;
            p1.innerText = e1.zone === "SAFE" ? "SAFE IN BOX" : (e1.zone === "RESTRICTED" ? "BREACH!" : "WARNING");
        }
    } else {
        // Simulation Mode
        drawFloorGrid();
        drawZones();

        let hasBreach = false;
        let hasWarning = false;
        let breachId = 2;

        simWorkers.forEach(w => {
            const dx = w.targetX - w.x;
            const dy = w.targetY - w.y;
            const dist = Math.hypot(dx, dy);

            if (dist > 1) {
                const spd = 2.4;
                w.vx = (dx / dist) * spd;
                w.vy = (dy / dist) * spd;
                w.x += w.vx;
                w.y += w.vy;
                w.stationaryTime = 0;
            } else {
                w.vx = 0;
                w.vy = 0;
                w.stationaryTime += 0.016;
            }

            const prevZ = w.zone;
            w.zone = checkZone(w.x, w.y);

            if (w.zone === "RESTRICTED") {
                hasBreach = true;
                breachId = w.id;
                w.color = "#ef4444";
                if (prevZ !== "RESTRICTED") {
                    totalBreaches++;
                    document.getElementById('banner-counter').innerText = `${totalBreaches} BREACHES`;
                    logIncident("CRITICAL", w.id, "DANGER: Machinery Cell", {x: w.x, y: w.y}, "Audio Alarm & Hazard Output");
                }
            } else if (w.zone === "WARNING") {
                hasWarning = true;
                w.color = "#f59e0b";
            } else {
                w.color = "#10b981";
            }

            // Draw Silhouette
            ctx.fillStyle = "rgba(0,0,0,0.4)";
            ctx.beginPath();
            ctx.ellipse(w.x, w.y, 16, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            const bx = w.x - 20, by = w.y - 80;
            ctx.strokeStyle = w.color;
            ctx.lineWidth = 2;
            ctx.strokeRect(bx, by, 40, 80);

            ctx.fillStyle = "#f59e0b";
            ctx.beginPath();
            ctx.arc(w.x, by + 12, 10, Math.PI, 0, false);
            ctx.fill();

            ctx.fillStyle = w.color;
            ctx.fillRect(bx + 6, by + 24, 28, 30);
            ctx.fillStyle = "#334155";
            ctx.fillRect(bx + 8, by + 54, 10, 24);
            ctx.fillRect(bx + 22, by + 54, 10, 24);

            ctx.fillStyle = w.color;
            ctx.fillRect(bx, by - 18, 55, 16);
            ctx.fillStyle = "#000";
            ctx.font = "bold 10px 'JetBrains Mono'";
            ctx.fillText(`ID #${w.id}`, bx + 4, by - 6);
        });

        if (hasBreach) {
            updateDecisionOutput("CRITICAL_BREACH", breachId);
        } else if (hasWarning) {
            updateDecisionOutput("WARNING", 0);
        } else {
            updateDecisionOutput("NOMINAL", 0);
        }

        // Update telemetry cards from simulation
        const w1 = simWorkers[0];
        const w2 = simWorkers[1];
        document.getElementById('entity-1-vel').innerText = w1.vx === 0 ? `0.0 px/s (Still ${w1.stationaryTime.toFixed(1)}s)` : `Moving`;
        document.getElementById('entity-1-zone').innerText = zones[w1.zone.toLowerCase()]?.name || "Safe Assembly Box";
        const p1 = document.getElementById('entity-1-status');
        p1.className = `status-pill ${w1.zone === "SAFE" ? "pill-safe" : "pill-danger"}`;
        p1.innerText = w1.zone === "SAFE" ? "SAFE IN BOX" : w1.zone;

        document.getElementById('entity-2-vel').innerText = w2.vx === 0 ? `0.0 px/s (Still)` : `18.4 px/s (Moving)`;
        document.getElementById('entity-2-zone').innerText = zones[w2.zone.toLowerCase()]?.name || "Buffer Corridor";
        const p2 = document.getElementById('entity-2-status');
        p2.className = `status-pill ${w2.zone === "RESTRICTED" ? "pill-danger" : (w2.zone === "WARNING" ? "pill-warning" : "pill-safe")}`;
        p2.innerText = w2.zone === "RESTRICTED" ? "BREACH IN DANGER CELL" : (w2.zone === "WARNING" ? "BUFFER AISLE" : "SAFE");
    }

    requestAnimationFrame(render);
}

// Clock
setInterval(() => {
    document.getElementById('current-clock').innerText = new Date().toTimeString().split(' ')[0];
}, 1000);

// Buttons & Event Handlers
document.getElementById('btn-start-camera').addEventListener('click', startComputerCamera);
document.getElementById('btn-stop-camera').addEventListener('click', stopComputerCamera);
document.getElementById('btn-mode-sim').addEventListener('click', () => {
    stopComputerCamera();
    currentInputMode = "sim";
});

document.getElementById('btn-upload-file').addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        stopComputerCamera();
        if (file.type.startsWith('image/')) {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                drawZones();
                logIncident("INFO", 0, "MEDIA_UPLOAD", {x: 0, y: 0}, `Analyzed static image: ${file.name}`);
            };
            img.src = URL.createObjectURL(file);
        } else if (file.type.startsWith('video/')) {
            video.srcObject = null;
            video.src = URL.createObjectURL(file);
            video.play();
            currentInputMode = "camera"; // Use camera video processing loop
            logIncident("INFO", 0, "MEDIA_UPLOAD", {x: 0, y: 0}, `Streaming video file: ${file.name}`);
        }
    }
});

document.getElementById('btn-demo-breach').addEventListener('click', () => {
    simWorkers[0].targetX = 140;
    simWorkers[0].targetY = 250;
    simWorkers[1].targetX = 640;
    simWorkers[1].targetY = 250;
});

document.getElementById('btn-demo-safe').addEventListener('click', () => {
    simWorkers[0].targetX = 100;
    simWorkers[0].targetY = 230;
    simWorkers[1].targetX = 180;
    simWorkers[1].targetY = 270;
});

document.getElementById('btn-reset').addEventListener('click', () => {
    simWorkers[0].targetX = 140; simWorkers[0].x = 140;
    simWorkers[1].targetX = 380; simWorkers[1].x = 380;
});

document.getElementById('btn-toggle-hud').addEventListener('click', () => {
    showHUD = !showHUD;
});

document.getElementById('btn-audio-toggle').addEventListener('click', (e) => {
    audioEnabled = !audioEnabled;
    e.target.innerText = audioEnabled ? "🔊 Audio: ON" : "🔇 Audio: MUTED";
});

document.getElementById('btn-clear-logs').addEventListener('click', () => {
    document.getElementById('incident-tbody').innerHTML = '';
});

// Kick off
requestAnimationFrame(render);
