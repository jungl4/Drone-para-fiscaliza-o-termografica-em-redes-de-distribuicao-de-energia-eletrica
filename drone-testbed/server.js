const express = require('express');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const app = express();
const port = process.env.PORT || 3001;

// servir interface estática
app.use(express.static(path.join(__dirname, 'public')));

// endpoints simples
app.get('/status', (req,res) => res.json({ ok:true }));

const server = app.listen(port, () => console.log(`[server] HTTP server listening on http://localhost:${port}`));

// WebSocket server para telemetria em tempo real
const wss = new WebSocket.Server({ server });
let clients = new Set();

let hasExternalSimulator = false;
let lastTelemetryAt = 0;

// fallback internal simulator state (very simple)
let internalSimInterval = null;
const INTERNAL_LOOP_HZ = 20;

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('[server] WS client connected. Total:', clients.size);
  ws.on('close', () => { clients.delete(ws); console.log('[server] WS client disconnected. Total:', clients.size); });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      // detect telemetry as coming from an external simulator
      if (data && data.type === 'telemetry') {
        lastTelemetryAt = Date.now();
        hasExternalSimulator = true;
        // forward telemetry to all clients
        broadcast(data);
      } else if (data) {
        // forward any other message (e.g., commands from controller) to all clients
        broadcast(data);
      }
    } catch (e) {
      // ignore parse errors
    }
  });
});

// helper para broadcast
function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

// expor broadcast via arquivo temporário para que o simulator o utilize via require
module.exports = { broadcast };

// Monitor external simulator; if none connects, start internal simulator
function startInternalSimulator() {
  if (internalSimInterval) return;
  console.log('[server] Starting internal fallback simulator (no external simulator detected)');
  let state = { vx:0, vy:0, yawRate:0 };
  internalSimInterval = setInterval(() => {
    // small random perturbation
    if (Math.random() > 0.95) {
      state.vx += (Math.random()-0.5)*10;
      state.vy += (Math.random()-0.5)*10;
      state.yawRate += (Math.random()-0.5)*3;
    }
    // decay
    state.vx *= 0.96; state.vy *= 0.96; state.yawRate *= 0.94;
    const t = { type:'telemetry', payload: { t: Date.now(), vx: state.vx, vy: state.vy, yawRate: state.yawRate, cmds: {} } };
    broadcast(t);
    // if external simulator appears, stop internal
    if (Date.now() - lastTelemetryAt < 2000) {
      stopInternalSimulator();
    }
  }, 1000/INTERNAL_LOOP_HZ);
}

function stopInternalSimulator() {
  if (!internalSimInterval) return;
  clearInterval(internalSimInterval); internalSimInterval = null;
  console.log('[server] Stopped internal simulator (external simulator detected)');
}

// Poll to start internal simulator if none provides telemetry
setInterval(() => {
  if (!hasExternalSimulator && !internalSimInterval) startInternalSimulator();
  if (hasExternalSimulator && Date.now() - lastTelemetryAt > 5000) { hasExternalSimulator = false; }
}, 1000);
