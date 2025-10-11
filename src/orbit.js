// orbit.js
const arDrone = require('ar-drone');
const client = arDrone.createClient();

process.on('SIGINT', () => {
  console.log('\n[!] Interrompido. Parando e pousando...');
  safeStopAndLand();
});

function safeStopAndLand() {
  try { client.stop(); } catch {}
  try { client.land(() => process.exit(0)); } catch { process.exit(0); }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('[*] Preparando...');
  client.disableEmergency();
  client.ftrim();
  client.calibrate(0);
  client.config('general:navdata_demo', 'FALSE'); // tentar navdata completa

  // Parâmetros da órbita (ajuste depois de testar)
  const params = {
    durationMs: 15000,        // tempo de órbita
    altitudeTarget: 1.2,      // metros (aprox.)
    yawSpeed: 0.28,           // 0 a 1 (velocidade de rotação)
    strafeSpeed: 0.07,        // 0 a 1 (velocidade lateral)
    clockwise: true           
    // true = horário, false = anti-horário
  };

  console.log('[*] Decolando...');
  client.takeoff();
  await sleep(6000);
  client.stop();
  console.log('[*] Adquirindo raio...');
  client.back(0.2);
  await sleep(5000);
  client.stop();
  console.log('[*] Iniciando controle de altitude e órbita...');
  await orbitOpenLoop(params);

  console.log('[*] Finalizado. Pousando...');
  client.stop();
  client.land();
  await sleep(3000);
  console.log('[✓] Concluído.');
}

// Controla altitude (P) e executa yaw + strafe por durationMs
async function orbitOpenLoop({
  durationMs,
  altitudeTarget,
  yawSpeed,
  strafeSpeed,
  clockwise
}) {
  const KpAlt = 0.6;          // ganho proporcional de altitude (ajuste se oscilar)
  const altDeadband = 0.05;   // faixa morta em metros (~5 cm)
  const maxAltSpeed = 0.35;   // limite de subida/descida

  let running = true;

  // Loop de controle a cada 50ms (~20 Hz)
  const loop = setInterval(() => {
    // 1) Controle de altitude (se navdata disponível)
    const nav = client._lastNavData || {};
    const demo = nav.demo || {};
    // Algumas versões têm demo.altitudeMeters; noutras, demo.altitude (m)
    const altMeters = (typeof demo.altitudeMeters === 'number')
      ? demo.altitudeMeters
      : (typeof demo.altitude === 'number' ? demo.altitude : null);

    if (typeof altMeters === 'number' && isFinite(altMeters)) {
      const err = altitudeTarget - altMeters;
      let vz = 0;
      if (Math.abs(err) > altDeadband) {
        vz = clamp(KpAlt * err, -maxAltSpeed, maxAltSpeed);
      }
      if (vz > 0) client.up(vz);
      else if (vz < 0) client.down(-vz);
      else { /* fica sem comando vertical */ }
    } else {
      // Se não tiver leitura confiável, não mexe na altitude
    }

    // 2) Yaw + strafe para formar a órbita
    if (clockwise) {
      client.clockwise(Math.abs(yawSpeed));
       client.left(Math.abs(strafeSpeed));   // esquerdo combinado com giro horário
    } else {
      client.counterClockwise(Math.abs(yawSpeed));
      client.right(Math.abs(strafeSpeed));  // direito combinado com giro anti-horário
    }
  }, 50);

  await sleep(durationMs);
  running = false;
  clearInterval(loop);
  client.stop();
}

main().catch(err => {
  console.error('[x] Erro:', err);
  safeStopAndLand();
});