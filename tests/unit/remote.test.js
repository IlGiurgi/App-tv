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
