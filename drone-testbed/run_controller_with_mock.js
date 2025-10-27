// Wrapper que garante que require('ar-drone') resolve para o mock em drone-testbed/node_modules
// e então executa o controlador original via require do arquivo no projeto pai.

// Ajusta NODE_PATH dinamicamente para incluir este node_modules (compatível cross-platform)
const Module = require('module');
const path = require('path');

const cwd = process.cwd();
const mockNodeModules = path.join(cwd, 'node_modules');

if (!process.env.NODE_PATH) process.env.NODE_PATH = mockNodeModules;
else process.env.NODE_PATH = process.env.NODE_PATH + path.delimiter + mockNodeModules;
Module._initPaths();

// Agora require o controlador do projeto pai e iniciar estabilização automaticamente
// Enable verbose proxy logs for easier debugging unless explicitly disabled
if (!process.env.SIM_PROXY_VERBOSE) process.env.SIM_PROXY_VERBOSE = '1';

// Wait for proxy to deliver at least one navdata packet (up to timeout)
const ar = require('ar-drone');
const proxyClient = ar.createClient();

function waitForNavdata(client, timeoutMs = 5000) {
	return new Promise((resolve) => {
		let done = false;
		const onData = (d) => { if (done) return; done = true; client.removeListener('navdata', onData); clearTimeout(timer); resolve(true); };
		client.once('navdata', onData);
		const timer = setTimeout(() => { if (done) return; done = true; client.removeListener('navdata', onData); resolve(false); }, timeoutMs);
	});
}

(async () => {
	// wait for navdata or timeout
	console.log('[wrapper] aguardando navdata do proxy (até 5s)...');
	const got = await waitForNavdata(proxyClient, 5000);
	if (!got) console.log('[wrapper] aviso: nenhum navdata recebido dentro do timeout; prosseguindo mesmo assim');

	const ctrl = require(path.join('..', 'src', 'controle_de_voo.js'));
	try {
		if (ctrl && typeof ctrl.takeoffAndStartStabilize === 'function') {
			console.log('[wrapper] Iniciando takeoffAndStartStabilize() do controlador (mock)');
			await ctrl.takeoffAndStartStabilize(1000);
			console.log('[wrapper] Controlador iniciado.');
		} else if (typeof ctrl.main === 'function') {
			console.log('[wrapper] Chamando main() do controlador');
			await ctrl.main();
		} else {
			console.log('[wrapper] Controlador carregado (nenhuma função de start encontrada).');
		}
	} catch (err) {
		console.error('[wrapper] erro ao iniciar controlador:', err && err.message);
		process.exit(1);
	}
})();
