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

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
    client.disableEmergency();
    client.ftrim();
    client.takeoff();
    await sleep(6000);
}

main().catch(err => {
  console.error('[x] Erro:', err);
  safeStopAndLand();
});