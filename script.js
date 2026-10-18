/**
 * Workplace Safety Sentinel - ABCD Interactive Simulation Engine
 * Zero-masking safety spatial engine running client-side with Web Audio API.
 */

// Canvas & Context
const canvas = document.getElementById('sentinelCanvas');
const ctx = canvas.getContext('2d');

// State Variables
let showHUD = true;
let audioEnabled = true;
let simSpeed = 2;
let totalBreaches = 0;
let audioCtx = null;
let lastAudioBeep = 0;

// Zones Geometry (Canvas 800 x 460)
const zones = {
    safe: {
        id: "ZONE_SAFE",
        name: "Safe Assembly Box",
        x: 40, y: 80, w: 220, h: 320,
        color: "rgba(16, 185, 129, 0.22)",
        borderColor: "#10b981"
    },
    warning: {
        id: "ZONE_WARNING",
        name: "Buffer Corridor",
        x: 300, y: 80, w: 180, h: 320,
        color: "rgba(245, 158, 11, 0.20)",
        borderColor: "#f59e0b"
    },
    restricted: {
        id: "ZONE_RESTRICTED",
        name: "DANGER: Machinery Cell",
        x: 520, y: 60, w: 240, h: 350,
        color: "rgba(239, 68, 68, 0.26)",
        borderColor: "#ef4444"
    }
};

// Tracked Entities
const workers = [
    {
        id: 1,
        name: "Worker Alpha",
        x: 140,
        y: 250,
        targetX: 140,
        targetY: 250,
        vx: 0,
        vy: 0,
        stationaryTime: 0,
        dwellTime: 0,
        zone: "SAFE",
        color: "#10b981",
        label: "ID #1 (Safe Box)"
    },
    {
        id: 2,
        name: "Worker Beta",
        x: 380,
        y: 250,
        targetX: 380,
        targetY: 250,
        vx: 0,
        vy: 0,
        stationaryTime: 0,
        dwellTime: 0,
        zone: "WARNING",
        color: "#f59e0b",
        label: "ID #2 (Moving)"
    }
];

// Audio Synthesizer
function playAlarmTone(freq = 1500, duration = 0.2) {
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
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch(e) {}
}

// Spatial Point-in-Box check
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

// Draw Grid Background
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

// Draw Safety Zones
function drawZones() {
    if (!showHUD) return;

    for (const key in zones) {
        const z = zones[key];
        ctx.fillStyle = z.color;
        ctx.fillRect(z.x, z.y, z.w, z.h);

        ctx.strokeStyle = z.borderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(z.x, z.y, z.w, z.h);

        // Header Label
        ctx.fillStyle = z.borderColor;
        ctx.font = "bold 12px 'Inter', sans-serif";
        ctx.fillText(z.name.toUpperCase(), z.x + 10, z.y + 22);
    }
}

// Draw Worker Silhouette / Avatar
function drawWorker(w) {
    // Footprint shadow
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.ellipse(w.x, w.y, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bounding Box
    const boxW = 40;
    const boxH = 80;
    const bx = w.x - boxW / 2;
    const by = w.y - boxH;

    ctx.strokeStyle = w.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, boxW, boxH);

    // Hardhat
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(w.x, by + 12, 10, Math.PI, 0, false);
    ctx.fill();

    // Torso (Vest)
    ctx.fillStyle = w.color;
    ctx.fillRect(bx + 6, by + 24, boxW - 12, 30);

    // Legs
    ctx.fillStyle = "#334155";
    ctx.fillRect(bx + 8, by + 54, 10, 24);
    ctx.fillRect(bx + boxW - 18, by + 54, 10, 24);

    // Label Badge
    ctx.fillStyle = w.color;
    ctx.fillRect(bx, by - 18, boxW + 20, 16);
    ctx.fillStyle = "#000";
    ctx.font = "bold 10px 'JetBrains Mono'";
    ctx.fillText(`ID #${w.id}`, bx + 4, by - 6);
}

// Log Incident Entry
function logIncident(severity, trackId, zoneName, coords, action) {
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
        <td>${action}</td>
    `;
    tbody.insertBefore(tr, tbody.firstChild);

    // Keep table to max 10 rows
    while (tbody.children.length > 10) {
        tbody.removeChild(tbody.lastChild);
    }
}

// Main Simulation Loop
function update() {
    drawFloorGrid();
    drawZones();

    let hasBreach = false;
    let hasWarning = false;

    workers.forEach(w => {
        // Move towards target
        const dx = w.targetX - w.x;
        const dy = w.targetY - w.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 1) {
            const speed = 1.8 * simSpeed;
            w.vx = (dx / dist) * speed;
            w.vy = (dy / dist) * speed;
            w.x += w.vx;
            w.y += w.vy;
            w.stationaryTime = 0;
        } else {
            w.vx = 0;
            w.vy = 0;
            w.stationaryTime += 0.016;
        }

        // Zone Evaluation
        const prevZone = w.zone;
        w.zone = checkZone(w.x, w.y);

        if (w.zone === "RESTRICTED") {
            hasBreach = true;
            w.color = "#ef4444";
            if (prevZone !== "RESTRICTED") {
                totalBreaches++;
                document.getElementById('banner-counter').innerText = `${totalBreaches} BREACHES`;
                logIncident("CRITICAL", w.id, "DANGER: Machinery Cell", {x: w.x, y: w.y}, "Audio Alarm & MQTT Publish");
            }
        } else if (w.zone === "WARNING") {
            hasWarning = true;
            w.color = "#f59e0b";
        } else {
            w.color = "#10b981";
        }

        drawWorker(w);
    });

    // Update UI Banner & Alarm Flash (Additive Zero-Masking)
    const banner = document.getElementById('alert-banner');
    const bannerTitle = document.getElementById('banner-title');
    const bannerSub = document.getElementById('banner-subtitle');
    const bannerIcon = document.getElementById('banner-icon');
    const overlay = document.getElementById('alarm-overlay');

    if (hasBreach) {
        banner.className = "banner banner-breach";
        bannerIcon.innerText = "🚨";
        bannerTitle.innerText = "CRITICAL HAZARD BREACH DETECTED: WORKER #2 IN RESTRICTED CELL!";
        bannerSub.innerText = "Worker #1 remains completely SAFE inside the Safe Box. Threat isolated independently.";
        overlay.classList.add('active');
        playAlarmTone(1400, 0.25);
    } else if (hasWarning) {
        banner.className = "banner banner-warning";
        bannerIcon.innerText = "⚠️";
        bannerTitle.innerText = "CAUTION: WORKER #2 IN BUFFER WARNING AISLE";
        bannerSub.innerText = "Approaching high-hazard exclusion zone perimeter.";
        overlay.classList.remove('active');
    } else {
        banner.className = "banner banner-nominal";
        bannerIcon.innerText = "🛡️";
        bannerTitle.innerText = "STATUS: NOMINAL (ALL WORKERS IN SAFE BOX)";
        bannerSub.innerText = "Zero-masking safety engine active. No spatial violations.";
        overlay.classList.remove('active');
    }

    // Update Telemetry Cards
    updateTelemetryCards();

    requestAnimationFrame(update);
}

function updateTelemetryCards() {
    const w1 = workers[0];
    const w2 = workers[1];

    // Worker 1
    const w1Vel = Math.hypot(w1.vx, w1.vy) * 20;
    document.getElementById('entity-1-vel').innerText = w1Vel < 1 ? `0.0 px/s (Still ${w1.stationaryTime.toFixed(1)}s)` : `${w1Vel.toFixed(1)} px/s`;
    document.getElementById('entity-1-zone').innerText = zones[w1.zone.toLowerCase()]?.name || "Safe Assembly Box";
    const p1 = document.getElementById('entity-1-status');
    p1.className = `status-pill ${w1.zone === "SAFE" ? "pill-safe" : (w1.zone === "WARNING" ? "pill-warning" : "pill-danger")}`;
    p1.innerText = w1.zone === "SAFE" ? "SAFE IN BOX" : w1.zone;

    // Worker 2
    const w2Vel = Math.hypot(w2.vx, w2.vy) * 20;
    document.getElementById('entity-2-vel').innerText = w2Vel < 1 ? `0.0 px/s (Still ${w2.stationaryTime.toFixed(1)}s)` : `${w2Vel.toFixed(1)} px/s (Moving)`;
    document.getElementById('entity-2-zone').innerText = zones[w2.zone.toLowerCase()]?.name || "Buffer Corridor";
    const p2 = document.getElementById('entity-2-status');
    p2.className = `status-pill ${w2.zone === "SAFE" ? "pill-safe" : (w2.zone === "WARNING" ? "pill-warning" : "pill-danger")}`;
    p2.innerText = w2.zone === "RESTRICTED" ? "BREACH IN DANGER CELL" : (w2.zone === "WARNING" ? "TRANSIT AISLE" : "SAFE IN BOX");

    // Mini Counters
    let safeCount = workers.filter(w => w.zone === "SAFE").length;
    let warnCount = workers.filter(w => w.zone === "WARNING").length;
    let dangerCount = workers.filter(w => w.zone === "RESTRICTED").length;

    document.getElementById('stat-safe').innerText = safeCount;
    document.getElementById('stat-warning').innerText = warnCount;
    document.getElementById('stat-danger').innerText = dangerCount;
}

// Clock Display
function updateClock() {
    const now = new Date();
    document.getElementById('current-clock').innerText = now.toTimeString().split(' ')[0];
}
setInterval(updateClock, 1000);
updateClock();

// Event Listeners
document.getElementById('btn-demo-breach').addEventListener('click', () => {
    // Worker #1 stays stationary in Safe Box
    workers[0].targetX = 140;
    workers[0].targetY = 250;

    // Worker #2 walks straight into the Restricted Cell
    workers[1].targetX = 640;
    workers[1].targetY = 250;
});

document.getElementById('btn-demo-safe').addEventListener('click', () => {
    workers[0].targetX = 100;
    workers[0].targetY = 230;
    workers[1].targetX = 180;
    workers[1].targetY = 270;
});

document.getElementById('btn-reset').addEventListener('click', () => {
    workers[0].targetX = 140;
    workers[0].targetY = 250;
    workers[0].x = 140;
    workers[0].y = 250;

    workers[1].targetX = 380;
    workers[1].targetY = 250;
    workers[1].x = 380;
    workers[1].y = 250;
});

document.getElementById('btn-toggle-hud').addEventListener('click', () => {
    showHUD = !showHUD;
});

document.getElementById('btn-audio-toggle').addEventListener('click', (e) => {
    audioEnabled = !audioEnabled;
    e.target.innerText = audioEnabled ? "🔊 Audio: ON" : "🔇 Audio: MUTED";
});

document.getElementById('speedSlider').addEventListener('input', (e) => {
    simSpeed = parseFloat(e.target.value);
});

document.getElementById('btn-clear-logs').addEventListener('click', () => {
    document.getElementById('incident-tbody').innerHTML = '';
});

// Kick off
requestAnimationFrame(update);
