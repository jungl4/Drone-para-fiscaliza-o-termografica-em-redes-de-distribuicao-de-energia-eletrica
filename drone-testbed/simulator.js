const path = require('path');
const fs = require('fs');
const express = require('express');

// Carrega módulo de controle
const ctrlPath = path.resolve(__dirname, '..', 'src', 'controle_de_voo.js');
const ctrl = require(ctrlPath);

const client = ctrl.client;

// Dinâmica do drone simplificada:
// comandos front/back/left/right (valores -1..1) produzem aceleração linear (cm/s^2)
// comando clockwise/ccw produz aceleração angular (deg/s^2)
const DYN = {
  accPerCmd: 200, // cm/s^2 por unidade de comando
  angAccPerCmd: 150, // deg/s^2 por unidade de yaw command
  linearDrag: 0.9, // fator de decaimento por passo
  angularDrag: 0.85
};

let state = { vx: 0, vy: 0, yawRate: 0 };
const LOOP_HZ = ctrl.STAB && ctrl.STAB.LOOP_HZ ? ctrl.STAB.LOOP_HZ : 20;
const dt = 1 / LOOP_HZ;
const intervalMs = Math.round(dt * 1000);

// Telemetria
const telemetry = [];
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// estado dos comandos recebidos (último comando ativo)
let lastCmds = { front:0, back:0, left:0, right:0, clockwise:0, counterClockwise:0 };

// Interceptar chamadas do mock client para capturar comandos e aplicar dinâmica
// O mock client já loga; também vamos sobrescrever métodos para capturar comandos
['front','back','left','right','clockwise','counterClockwise'].forEach(name => {
  const orig = client[name] && client[name].bind(client);
  client[name] = (v) => {
    // mapear back/left/counterClockwise para sinal negativo de front/right/clockwise
    const val = typeof v === 'number' ? v : 0;
    lastCmds[name] = val;
    if (orig) orig(v);
  };
});

// Função que aplica uma pequena perturbação (rajada de vento)
function perturb() {
  const amp = 20; // cm/s
  state.vx += (Math.random() - 0.5) * amp;
  state.vy += (Math.random() - 0.5) * amp;
  state.yawRate += (Math.random() - 0.5) * 15; // deg/s
}

function physicsStep() {
  // calcular aceleração resultante a partir dos comandos
  // forward/back: front positive increases vx, back negative
  const forward = (lastCmds.front || 0) - (lastCmds.back || 0);
  const right = (lastCmds.right || 0) - (lastCmds.left || 0);
  const yawCmd = (lastCmds.clockwise || 0) - (lastCmds.counterClockwise || 0);

  const ax = forward * DYN.accPerCmd; // cm/s^2
  const ay = right * DYN.accPerCmd;
  const yawAcc = yawCmd * DYN.angAccPerCmd; // deg/s^2

  // integração simples: v = v + a*dt
  state.vx += ax * dt;
  state.vy += ay * dt;
  state.yawRate += yawAcc * dt;

  // aplicar drag
  state.vx *= DYN.linearDrag;
  state.vy *= DYN.linearDrag;
  state.yawRate *= DYN.angularDrag;
}

function emitNavdata() {
  const nav = {
    demo: {
      velocity: { x: state.vx, y: state.vy, z: 0 },
      rotation: { yaw: state.yawRate }
    }
  };
  client.emit('navdata', nav);

  // coletar telemetria
  telemetry.push({ t: Date.now(), vx: state.vx, vy: state.vy, yawRate: state.yawRate, cmds: { ...lastCmds } });
}

// ciclo principal
setInterval(() => {
  if (Math.random() > 0.88) perturb();
  physicsStep();
  emitNavdata();
}, intervalMs);

// iniciar controlador
(async () => {
  console.log('[sim] Chamando takeoffAndStartStabilize() do módulo de controle');
  try {
    await ctrl.takeoffAndStartStabilize(1000);
    console.log('[sim] Estabilização iniciada.');
  } catch (e) {
    console.error('[sim] erro ao iniciar estabilização', e && e.message);
  }
})();

// Opcional: conectar a um servidor WS fornecido (ex: server.js). Se não houver servidor, telemetria fica local.
const WebSocket = require('ws');
const WS_ADDR = process.env.WS_ADDR || 'ws://localhost:3001';
let wsClient = null;
try {
  wsClient = new WebSocket(WS_ADDR);
  wsClient.on('open', () => console.log('[sim] conectado ao WS server', WS_ADDR));
  wsClient.on('close', () => console.log('[sim] desconectado do WS server'));
  wsClient.on('error', (e) => console.warn('[sim] ws error', e && e.message));
} catch (e) {
  console.warn('[sim] nao conseguiu conectar WS', e && e.message);
}

function sendWS(type, payload) {
  if (!wsClient || wsClient.readyState !== WebSocket.OPEN) return;
  try { wsClient.send(JSON.stringify({ type, payload })); } catch (e) {}
}

// receber mensagens do servidor (por exemplo comandos encaminhados pelo proxy do cliente)
if (wsClient) {
  wsClient.on('message', (m) => {
    try {
      const data = JSON.parse(m);
      if (!data) return;
      if (data.type === 'command') {
        const { cmd, value } = data;
        // aplicar no lastCmds de forma compatível com os nomes usados
        if (cmd === 'front' || cmd === 'back' || cmd === 'left' || cmd === 'right' || cmd === 'clockwise' || cmd === 'counterClockwise') {
          lastCmds[cmd] = typeof value === 'number' ? value : 0;
        } else if (cmd === 'takeoff') {
          // no-op para agora, mas log
          console.log('[sim] takeoff recebido');
        } else if (cmd === 'land') {
          console.log('[sim] land recebido');
          // zerar comandos
          lastCmds = { front:0, back:0, left:0, right:0, clockwise:0, counterClockwise:0 };
        } else if (cmd === 'stop') {
          console.log('[sim] stop recebido');
          lastCmds = { front:0, back:0, left:0, right:0, clockwise:0, counterClockwise:0 };
        }
      }
    } catch (e) {
      // ignore
    }
  });
}

// atualizar emitNavdata para também enviar via WS
function emitNavdata() {
  const nav = {
    demo: {
      velocity: { x: state.vx, y: state.vy, z: 0 },
      rotation: { yaw: state.yawRate }
    }
  };
  client.emit('navdata', nav);

  const t = { t: Date.now(), vx: state.vx, vy: state.vy, yawRate: state.yawRate, cmds: { ...lastCmds } };
  telemetry.push(t);
  sendWS('telemetry', t);
}
