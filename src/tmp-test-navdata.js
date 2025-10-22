// teste rápido para parseNavdata com opção desconhecida 0x1d
const fs = require('fs');
const path = require('path');
const parse = require('./node_modules/ar-drone/lib/navdata/parseNavdata');

// montar buffer navdata mínimo: header(4) + droneState(4) + seq(4) + visionFlag(4) + option(id(2)+len(2)+data...) + checksum
const header = Buffer.alloc(4); header.writeUInt32LE(0x55667788,0);
const droneState = Buffer.alloc(4); droneState.writeUInt32LE(0,0);
const seq = Buffer.alloc(4); seq.writeUInt32LE(1,0);
const vision = Buffer.alloc(4); vision.writeUInt32LE(0,0);

// opção desconhecida 0x1d (29) com length = 4 (header only) => no data
const optId = Buffer.alloc(2); optId.writeUInt16LE(0x1d,0);
const optLen = Buffer.alloc(2); optLen.writeUInt16LE(4,0);
// checksum option (65535) with length 8 and checksum value: compute later
const checksumId = Buffer.alloc(2); checksumId.writeUInt16LE(65535,0);
const checksumLen = Buffer.alloc(2); checksumLen.writeUInt16LE(8,0);
const checksumVal = Buffer.alloc(4); checksumVal.writeUInt32LE(0,0);

// assemble buffer (without correct checksum calculation; parseNavdata will check and may throw if checksum mismatch)
let parts = [header, droneState, seq, vision, optId, optLen, checksumId, checksumLen, checksumVal];
let buf = Buffer.concat(parts);

// compute expected checksum as parseNavdata expects: sum of buffer bytes up to (buffer.length - length_of_checksum_option)
let expected = 0;
for (let i=0;i<buf.length - 8;i++) expected += buf[i];
checksumVal.writeUInt32LE(expected & 0xFFFFFFFF,0);
// reassemble with correct checksum
parts = [header, droneState, seq, vision, optId, optLen, checksumId, checksumLen, checksumVal];
buf = Buffer.concat(parts);

try {
  const nav = parse(buf);
  console.log('Parse sucesso:', Object.keys(nav));
} catch (e) {
  console.error('Parse falhou:', e && e.message);
  process.exit(1);
}
