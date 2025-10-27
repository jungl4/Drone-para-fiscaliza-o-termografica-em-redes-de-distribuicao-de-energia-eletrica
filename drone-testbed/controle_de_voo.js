//pré-configurações-drone
const arDrone = require('ar-drone');
const client = arDrone.createClient();
/*
//constantes
const linearMaxSpeed = 5; //em m/s
const raio = 1; //em metros
const circ = 2 * Math.PI * raio; //em metros
const altitude = 1.2; //em metros
const yawMaxDegSpeed = 350; //em graus/s
//v=w*r
//v= velocidade linear tangencial (m/s) -> lateralmente
//w= velocidade angular (rad/s)
//r= raio (m)
//Wgraus/s = v/r * 180/π
const linearSpeed = 1; //em m/s
const yawSpeed = Math.min((linearSpeed/raio)*(180/Math.PI), yawMaxDegSpeed); //em m/s
const tempoTotal = (circ / linearSpeed) * 1000; //em milisegundos

//variáveis
*/

//funções
process.on('SIGINT', () => {
  console.log('\n[!] Interrompido. Parando e pousando...');
  safeStopAndLand();
});

function safeStopAndLand() {
  try { client.stop(); } catch {}
  try { client.land(() => process.exit(0)); } catch { process.exit(0); }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('[*] Preparando...');
  client.disableEmergency();
  auto_control();
}

async function auto_control() {
  client.config('general:navdata_demo', 'FALSE'); // tentar navdata completa
  // se quiser apenas um único snapshot de navdata em vez de ficar recebendo indefinidamente
  try {
    const data = await getNavdata(2000); // aguarda até 2s por um pacote
    if (data && data.demo) {
      const velocityX = data.demo.velocity.x; // em cm/s
      const velocityY = data.demo.velocity.y; // em cm/s
      console.log('[navdata snapshot] vx:', velocityX, 'vy:', velocityY);
    }
  } catch (err) {
    console.warn('[navdata] timeout ou erro ao obter snapshot:', err && err.message);
  }
}

// ------------------ Controlador PID e loop de estabilização ------------------

class PID {
  constructor(kp = 0, ki = 0, kd = 0, dt = 0.05, outMin = -1, outMax = 1) {
    this.kp = kp; this.ki = ki; this.kd = kd;
    this.dt = dt;
    this.outMin = outMin; this.outMax = outMax;

    this._integral = 0;
    this._prevError = 0;
  }

  reset() {
    this._integral = 0;
    this._prevError = 0;
  }

  update(setpoint, measurement) {
    const error = setpoint - measurement;
    this._integral += error * this.dt;
    const derivative = (error - this._prevError) / this.dt;
    this._prevError = error;

    let out = this.kp * error + this.ki * this._integral + this.kd * derivative;
    if (out > this.outMax) out = this.outMax;
    if (out < this.outMin) out = this.outMin;
    return out;
  }
}

// Configurações iniciais de tuning (valores conservadores)
const STAB = {
  LOOP_HZ: 20,
  MAX_THRUST: 0.25, // máxima correção de translação (0..1)
  MAX_YAW: 0.4, // máxima correção de yaw (0..1)
  VELOCITY_DEADBAND_CM_S: 7, // se velocidade pequena (< threshold) considerar zero
  // PID gains (podem ser ajustados): usamos velocidades (cm/s) como medida
  pid: {
    roll:  { kp: 0.012, ki: 0.0005, kd: 0.004 }, // corrige movimento lateral (x/y dependente do frame)
    pitch: { kp: 0.012, ki: 0.0005, kd: 0.004 },
    yaw:   { kp: 0.009, ki: 0.0002, kd: 0.002 }
  }
};

// Instancia PID para roll/pitch/yaw (controlando velocidade para 0)
const pidRoll  = new PID(STAB.pid.roll.kp, STAB.pid.roll.ki, STAB.pid.roll.kd, 1/STAB.LOOP_HZ, -STAB.MAX_THRUST, STAB.MAX_THRUST);
const pidPitch = new PID(STAB.pid.pitch.kp, STAB.pid.pitch.ki, STAB.pid.pitch.kd, 1/STAB.LOOP_HZ, -STAB.MAX_THRUST, STAB.MAX_THRUST);
const pidYaw   = new PID(STAB.pid.yaw.kp, STAB.pid.yaw.ki, STAB.pid.yaw.kd, 1/STAB.LOOP_HZ, -STAB.MAX_YAW, STAB.MAX_YAW);

let stabilizing = false;

// Inicia loop de estabilização. Deve ser chamado após takeoff e estabilização inicial.
function startStabilizationLoop() {
  if (stabilizing) return;
  stabilizing = true;

  // Listener contínuo de navdata para atualizações mais rápidas
  client.on('navdata', onNavdata);

  // Fallback: também mantém um intervalo para garantir atualizações periódicas
  const intervalMs = 1000 / STAB.LOOP_HZ;
  const intervalId = setInterval(() => {
    if (!stabilizing) {
      clearInterval(intervalId);
    }
    // nada extra aqui: correções são aplicadas no onNavdata
  }, intervalMs);
}

function stopStabilizationLoop() {
  stabilizing = false;
  try { client.removeListener('navdata', onNavdata); } catch (e) {}
  pidRoll.reset(); pidPitch.reset(); pidYaw.reset();
}

// Trata pacotes navdata: lê velocidade e giroscópio quando disponível
function onNavdata(data) {
  try {
    if (!stabilizing) return;

    // alguns campos podem variar conforme versão do navdata; preferimos demo.velocity quando existe
    const demo = data && data.demo ? data.demo : null;
    if (!demo) return;

    // velocity em cm/s
    const vx = demo.velocity && typeof demo.velocity.x === 'number' ? demo.velocity.x : 0; // frente/trás
    const vy = demo.velocity && typeof demo.velocity.y === 'number' ? demo.velocity.y : 0; // esquerda/direita
    // yaw velocidade (algumas versões expõe rotVelocities / rotation)
    const rot = demo.rotation ? demo.rotation.yaw || demo.rotation[2] || 0 : (demo.rotVel ? demo.rotVel.z || 0 : 0);

    // Aplicamos deadband: se velocidade pequena, consideramos zero (evita correções constantes por ruído)
    const vxEff = Math.abs(vx) < STAB.VELOCITY_DEADBAND_CM_S ? 0 : vx;
    const vyEff = Math.abs(vy) < STAB.VELOCITY_DEADBAND_CM_S ? 0 : vy;
    const yawEff = Math.abs(rot) < 0.5 ? 0 : rot; // rot em deg/s possivelmente

    // Objetivo: manter velocidades em 0 quando em idle
    const setpoint = 0;

    // Atualiza PIDs: as unidades aqui são cm/s para translacao e deg/s para yaw
    const corrPitch = pidPitch.update(setpoint, vxEff); // pitch corrige velocidade em X (forward/back)
    const corrRoll  = pidRoll.update(setpoint, vyEff);  // roll corrige velocidade em Y (left/right)
    const corrYaw   = pidYaw.update(setpoint, yawEff);  // yaw corrige rotacao

    // Mapear correções para comandos do ar-drone
    // front(n) : move drone para frente (n positivo). back, left, right usam sinais opostos
    // Limitamos magnitude e aplicamos suavização mínima
    const applyLimit = (v, max) => Math.max(-max, Math.min(max, v));

    const pitchCmd = applyLimit(corrPitch, STAB.MAX_THRUST); // use client.front/back
    const rollCmd  = applyLimit(corrRoll, STAB.MAX_THRUST);  // use client.left/right
    const yawCmd   = applyLimit(corrYaw, STAB.MAX_YAW);

    // Se comandos forem muito pequenos (ruído), não enviar para evitar jitter
    const MIN_CMD = 0.01;

    // Aplicar comandos ao drone
    try {
      if (Math.abs(pitchCmd) > MIN_CMD) {
        if (pitchCmd > 0) client.front(Math.abs(pitchCmd)); else client.back(Math.abs(pitchCmd));
      } else {
        // se não há correção em pitch, pare comando nessa dimensão
        client.front(0);
      }

      if (Math.abs(rollCmd) > MIN_CMD) {
        if (rollCmd > 0) client.right(Math.abs(rollCmd)); else client.left(Math.abs(rollCmd));
      } else {
        client.right(0);
      }

      if (Math.abs(yawCmd) > MIN_CMD) {
        if (yawCmd > 0) client.clockwise(Math.abs(yawCmd)); else client.counterClockwise(Math.abs(yawCmd));
      } else {
        client.clockwise(0);
      }
    } catch (e) {
      // não falhar se comandos não puderem ser aplicados
    }

    // Log leve para debugging a 1Hz (não polui muito)
    if (Math.floor(Date.now() / 1000) % 1 === 0) {
      // console.debug(`[stab] vx:${vx.toFixed(1)} vy:${vy.toFixed(1)} rot:${yawEff.toFixed(1)} => p:${pitchCmd.toFixed(3)} r:${rollCmd.toFixed(3)} y:${yawCmd.toFixed(3)}`);
    }
  } catch (err) {
    // proteger loop de exceções
    // console.warn('[stab] erro no onNavdata', err && err.message);
  }
}

// Helper público para iniciar estabilização depois da decolagem
async function takeoffAndStartStabilize(timeoutMs = 8000) {
  client.takeoff();
  await sleep(timeoutMs); // aguardar estabilização inicial (ftrim e perda de ruído)
  pidRoll.reset(); pidPitch.reset(); pidYaw.reset();
  startStabilizationLoop();
}


// Helper que retorna uma Promise resolvida com o próximo evento 'navdata'
function getNavdata(timeoutMs) {
  return new Promise((resolve, reject) => {
    const onData = (data) => {
      clearTimer();
      resolve(data);
    };

    const onError = (err) => {
      clearTimer();
      reject(err);
    };

    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      client.removeListener('navdata', onData);
      client.removeListener('error', onError);
    };

    client.once('navdata', onData);
    client.once('error', onError);

    let timer = null;
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        client.removeListener('navdata', onData);
        client.removeListener('error', onError);
        reject(new Error('navdata timeout'));
      }, timeoutMs);
    }
  });
}


// Se este arquivo for executado diretamente, roda main(); caso contrário exporta helpers
if (require.main === module) {
  main().catch(err => {
    console.error('[x] Erro:', err);
    safeStopAndLand();
  });
}

module.exports = {
  client,
  PID,
  startStabilizationLoop,
  stopStabilizationLoop,
  takeoffAndStartStabilize,
  getNavdata,
  STAB,
  pidRoll,
  pidPitch,
  pidYaw
};

