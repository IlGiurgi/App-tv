'use strict';

var test = require('node:test');
var assert = require('node:assert');
var Remote = require('../../app/js/remote.js');

test('build accetta play con canale e scarta il resto', function () {
  var item = { type: 'live', id: 42, name: 'Rai 1', icon: 'x.png', num: 1, categoryId: '7', evil: '<script>' };
  var command = Remote.build('ue49mu6500', 'play', item);
  assert.deepStrictEqual(command, {
    target: 'ue49mu6500', action: 'play',
    item: { type: 'live', id: '42', name: 'Rai 1', icon: 'x.png', num: 1, categoryId: '7' }
  });
  assert.strictEqual(Remote.build('', 'play', { type: 'boh', id: '1' }), null);
  assert.strictEqual(Remote.build('', 'format', {}), null);
  assert.deepStrictEqual(Remote.build(undefined, 'stop'), { target: '', action: 'stop' });
});

test('accepts: target vuoto = tutte le TV, altrimenti solo quella giusta', function () {
  assert.strictEqual(Remote.accepts({ action: 'stop' }, 'tv_a'), true);
  assert.strictEqual(Remote.accepts({ target: 'tv_a' }, 'tv_a'), true);
  assert.strictEqual(Remote.accepts({ target: 'tv_b' }, 'tv_a'), false);
  assert.strictEqual(Remote.accepts(null, 'tv_a'), false);
});

test('pickPlaying: TV che riproduce con sensore recente, altrimenti null', function () {
  var now = Date.parse('2026-11-04T10:00:00Z');
  function tv(id, state, attrs, last) {
    return { entity_id: 'sensor.hometivu_' + id, state: state, last_updated: last, attributes: attrs };
  }
  var fresh = { friendly_name: 'HomeTivu TV_A', aggiornato: '2026-11-04T09:57:00Z' };
  assert.strictEqual(Remote.pickPlaying([tv('a', 'spento', fresh)], now), null, 'spenta');
  assert.strictEqual(Remote.pickPlaying([tv('a', 'Rai 1', { aggiornato: '2026-11-04T09:52:00Z' })], now), null, 'vecchio >7 min');
  assert.deepStrictEqual(Remote.pickPlaying([tv('a', 'Rai 1', fresh)], now), { name: 'HomeTivu TV_A', state: 'Rai 1' }, 'recente');
  var two = [tv('a', 'spento', fresh), tv('b', 'Canale 5', { friendly_name: 'B', aggiornato: '2026-11-04T09:58:00Z' }), { entity_id: 'light.x', state: 'on' }];
  assert.deepStrictEqual(Remote.pickPlaying(two, now), { name: 'B', state: 'Canale 5' }, 'più TV: prende quella che guarda');
  assert.deepStrictEqual(Remote.pickPlaying([tv('a', 'Rai 1', { friendly_name: 'A' }, '2026-11-04T09:59:00Z')], now), { name: 'A', state: 'Rai 1' }, 'fallback last_updated');
  assert.strictEqual(Remote.pickPlaying([tv('a', 'Rai 1', {})], now), null, 'senza data');
  assert.strictEqual(Remote.pickPlaying(null, now), null);
});

test('pickAvailable: solo le TV annunciate da meno di 7 minuti, anche se ferme', function () {
  var now = Date.parse('2026-11-04T12:00:00Z');
  var states = [
    { entity_id: 'sensor.hometivu_ue49', state: 'spento', attributes: { friendly_name: 'HomeTivu UE49', aggiornato: '2026-11-04T11:57:00Z' } },
    { entity_id: 'sensor.hometivu_vecchia', state: 'Rai 1', attributes: { aggiornato: '2026-11-04T11:40:00Z' } },
    { entity_id: 'sensor.altro', state: 'on', attributes: { aggiornato: '2026-11-04T11:59:00Z' } },
    { entity_id: 'sensor.hometivu_senza_data', state: 'spento', attributes: {} }
  ];
  assert.deepStrictEqual(Remote.pickAvailable(states, now), [{ id: 'ue49', name: 'HomeTivu UE49', state: 'spento' }]);
  assert.deepStrictEqual(Remote.pickAvailable(null, now), []);
});
