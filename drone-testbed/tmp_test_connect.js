// quick test: instantiate proxy ar-drone client and wait
const a = require('ar-drone');
const c = a.createClient();
console.log('[tmp_test_connect] client created, waiting 5s to observe WS events...');
setTimeout(()=>{ console.log('[tmp_test_connect] done'); process.exit(0); }, 5000);
