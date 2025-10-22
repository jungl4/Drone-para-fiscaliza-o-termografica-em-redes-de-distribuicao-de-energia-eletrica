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


main().catch(err => {
  console.error('[x] Erro:', err);
  safeStopAndLand();
});
