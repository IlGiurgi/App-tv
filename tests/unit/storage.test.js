'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

/** Carica storage.js in un contesto isolato con un localStorage in memoria. */
function loadStorage() {
  var data = {};
  var context = {
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; }
    },
    Date: Date
  };
  context.window = context;
  var source = fs.readFileSync(path.join(__dirname, '../../app/js/storage.js'), 'utf8');
  vm.runInNewContext(source, context);
  return context.Storage;
}

test('preferiti: aggiunta, verifica e rimozione', function () {
  var Storage = loadStorage();
  var channel = { type: 'live', id: '1', name: 'Rai 1' };
  assert.strictEqual(Storage.isFavorite('live', '1'), false);
  assert.strictEqual(Storage.toggleFavorite(channel), true);
  assert.strictEqual(Storage.isFavorite('live', '1'), true);
  assert.strictEqual(Storage.isFavorite('vod', '1'), false, 'stesso id ma tipo diverso');
  assert.strictEqual(Storage.toggleFavorite(channel), false);
  assert.strictEqual(Storage.getFavorites().length, 0);
});

test('ripresa: ignora inizio e fine, ricorda la posizione intermedia', function () {
  var Storage = loadStorage();
  Storage.setResume('vod:1', 10, 6000);
  assert.strictEqual(Storage.getResume('vod:1'), 0, 'sotto i 30 secondi non si salva');
  Storage.setResume('vod:1', 1234.7, 6000);
  assert.strictEqual(Storage.getResume('vod:1'), 1234);
  Storage.setResume('vod:1', 5900, 6000);
  assert.strictEqual(Storage.getResume('vod:1'), 0, 'quasi finito: posizione cancellata');
});

test('ripresa: mantiene al massimo 200 voci eliminando le più vecchie', function () {
  var Storage = loadStorage();
  for (var i = 0; i < 205; i++) Storage.setResume('vod:' + i, 100, 1000);
  assert.strictEqual(Storage.getResume('vod:204'), 100);
  var kept = 0;
  for (var j = 0; j < 205; j++) if (Storage.getResume('vod:' + j)) kept++;
  assert.strictEqual(kept, 200);
});

test('impostazioni: formato live predefinito ts', function () {
  var Storage = loadStorage();
  assert.strictEqual(Storage.getSettings().liveFormat, 'ts');
  Storage.setSettings({ liveFormat: 'm3u8' });
  assert.strictEqual(Storage.getSettings().liveFormat, 'm3u8');
});
