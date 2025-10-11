
const arDrone = require('ar-drone');
const client = arDrone.createClient();

// Segurança: pouso ao apertar Ctrl+C
process.on('SIGINT', () => {
  console.log('\n[!] Interrompido. Pousando...');
  client.stop();
  client.land(() => process.exit(0));
});

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  console.log('[*] Conectando ao AR.Drone...');
  client.disableEmergency();      // Sai de estado de emergência (se estiver)
  client.ftrim();                 // Ajuste de plano horizontal
           // Calibra a bússola (se suportado)

  // Opcional: pedir navdata completa (para altitude, etc.)
  client.config('general:navdata_demo', 'FALSE');

  console.log('[*] Decolando...');
  client.takeoff();

  // Aguarda estabilizar um pouco
  await sleep(7000);
  client.stop(); // Para qualquer comando de movimento

  console.log('[*] Pairando por 4s...');
  await sleep(4000);

  console.log('[*] Pousando...');
  client.land();

  await sleep(3000);
  console.log('[✓] Teste concluído.');
})();