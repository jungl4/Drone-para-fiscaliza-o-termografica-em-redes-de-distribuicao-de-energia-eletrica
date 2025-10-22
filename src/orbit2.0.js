//pré-configurações-drone
const arDrone = require('ar-drone');
const client = arDrone.createClient();

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
  //client.ftrim()
  
  //client.config('general:navdata_demo', 'FALSE'); // tentar navdata completa
  await sleep(2000)
  // Comandos do drone
  console.log('[*] Decolando...');
  client.takeoff();
  await sleep(6000);
  client.stop();
  //client.calibrate(0);
  //await sleep(3000);
  client.up(0.5)
  await sleep(2000);
  client.stop();
  console.log('[*] Adquirindo raio...');
  client.back(0.04);
  await sleep(5000);
  client.stop();
  console.log('[*] Iniciando controle de órbita...');
  await orbitOpenLoop();
  console.log('[*] Finalizado. Pousando...');
  client.stop();
  await sleep(1000);
  client.stop()
  client.front(0.04);
  await sleep(5000);
  client.stop();
  client.land();
  await sleep(3000);
  console.log('[✓] Concluído.');
}


async function orbitOpenLoop() {
  const startTime = Date.now();
  
  client.clockwise(yawSpeed/yawMaxDegSpeed);
  //client.clockwise(0.5); //velocidade de giro
  client.left(linearSpeed/linearMaxSpeed); //velocidade lateral
  

  while (Date.now() - startTime < tempoTotal){

    await sleep(50); //pequeno delay para reduzir uso de CPU e permitir interrupções/eventos
    
  };
  client.stop();

};

main().catch(err => {
  console.error('[x] Erro:', err);
  safeStopAndLand();
});
