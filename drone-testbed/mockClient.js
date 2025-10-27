const EventEmitter = require('eventemitter3');

// Mock do client do ar-drone com a API usada no projeto
class MockClient extends EventEmitter {
  constructor() {
    super();
    this._config = {};
    this._lastCommands = { front:0, back:0, left:0, right:0, clockwise:0, counterClockwise:0 };
  }

  createClient() { return this; }

  config(key, val) { this._config[key]=val; }
  disableEmergency() { /* noop */ }
  ftrim() { /* noop */ }

  takeoff() { this.emit('state', { action: 'takeoff' }); }
  land() { this.emit('state', { action: 'land' }); }
  stop() { this.emit('state', { action: 'stop' }); }

  front(v) { this._lastCommands.front = v; this._logCmd('front', v); }
  back(v) { this._lastCommands.back = v; this._logCmd('back', v); }
  left(v) { this._lastCommands.left = v; this._logCmd('left', v); }
  right(v) { this._lastCommands.right = v; this._logCmd('right', v); }
  clockwise(v) { this._lastCommands.clockwise = v; this._logCmd('clockwise', v); }
  counterClockwise(v) { this._lastCommands.counterClockwise = v; this._logCmd('counterClockwise', v); }

  _logCmd(name, v) {
    console.log(`[mockClient] cmd ${name}: ${v && v.toFixed ? v.toFixed(3) : v}`);
  }

  // helper para enviar navdata simulado
  emitNavdata(navdata) {
    this.emit('navdata', navdata);
  }
}

module.exports = MockClient;
