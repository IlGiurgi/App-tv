'use strict';

var test = require('node:test');
var assert = require('node:assert');
var Home = require('../../app/js/home.js');

test('normalizeUrl e wsUrl', function () {
  assert.strictEqual(Home.normalizeUrl(' 192.168.1.5:8123/ '), 'http://192.168.1.5:8123');
  assert.strictEqual(Home.normalizeUrl('https://casa.example.org//'), 'https://casa.example.org');
  assert.strictEqual(Home.normalizeUrl(''), '');
  assert.strictEqual(Home.wsUrl('192.168.1.5:8123'), 'ws://192.168.1.5:8123/api/websocket');
  assert.strictEqual(Home.wsUrl('https://casa.example.org'), 'wss://casa.example.org/api/websocket');
});

test('parseMotionMap accetta ; , e a capo e scarta le voci incomplete', function () {
  assert.deepStrictEqual(
    Home.parseMotionMap('binary_sensor.a=camera.a; binary_sensor.b = camera.b\nbinary_sensor.c=camera.c,rotto,=x'),
    { 'binary_sensor.a': 'camera.a', 'binary_sensor.b': 'camera.b', 'binary_sensor.c': 'camera.c' }
  );
  assert.deepStrictEqual(Home.parseMotionMap(''), {});
});

test('classify divide le entità e ordina per nome', function () {
  var data = Home.classify([
    { entity_id: 'camera.b', state: 'idle', attributes: { friendly_name: 'Zeta', entity_picture: '/api/camera_proxy/camera.b?token=1' } },
    { entity_id: 'camera.a', state: 'idle', attributes: { friendly_name: 'Alfa' } },
    { entity_id: 'sensor.t', state: '20', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } },
    { entity_id: 'sensor.h', state: '50', attributes: { device_class: 'humidity', unit_of_measurement: '%' } },
    { entity_id: 'sensor.p', state: '1', attributes: { device_class: 'power' } },
    { entity_id: 'light.l', state: 'on', attributes: {} },
    { entity_id: 'scene.s', state: 'scening', attributes: {} },
    { entity_id: 'binary_sensor.m', state: 'off', attributes: { device_class: 'motion' } },
    { entity_id: 'binary_sensor.door', state: 'off', attributes: { device_class: 'door' } }
  ]);
  assert.deepStrictEqual(data.cameras.map(function (c) { return c.name; }), ['Alfa', 'Zeta']);
  assert.strictEqual(data.temps.length, 1);
  assert.strictEqual(data.temps[0].unit, '°C');
  assert.strictEqual(data.hums.length, 1);
  assert.strictEqual(data.lights[0].name, 'light.l');
  assert.strictEqual(data.scenes.length, 1);
  assert.deepStrictEqual(data.motion.map(function (m) { return m.id; }), ['binary_sensor.m']);
});

test('parseList divide per ; , e a capo', function () {
  assert.deepStrictEqual(Home.parseList(' camera.a; camera.b,camera.c\ncamera.d '), ['camera.a', 'camera.b', 'camera.c', 'camera.d']);
  assert.deepStrictEqual(Home.parseList(''), []);
});

test('classify riconosce i sensori di movimento anche dal nome', function () {
  var data = Home.classify([
    { entity_id: 'binary_sensor.radar_garage', state: 'off', attributes: { friendly_name: 'Radar garage' } },
    { entity_id: 'binary_sensor.porta', state: 'off', attributes: { friendly_name: 'Porta ingresso' } },
    { entity_id: 'binary_sensor.x', state: 'off', attributes: { device_class: 'presence' } }
  ]);
  assert.deepStrictEqual(data.motion.map(function (m) { return m.id; }).sort(), ['binary_sensor.radar_garage', 'binary_sensor.x']);
});

test('mainCamera sceglie quella del garage che non e una registrazione', function () {
  Home.data = Home.classify([
    { entity_id: 'camera.garage_registrazione_video', state: 'idle', attributes: { friendly_name: 'Garage registrazione video' } },
    { entity_id: 'camera.garage_registrazione_video_leggera', state: 'idle', attributes: { friendly_name: 'Garage registrazione video leggera' } },
    { entity_id: 'camera.garage', state: 'idle', attributes: { friendly_name: 'Telecamera garage' } },
    { entity_id: 'camera.giardino', state: 'idle', attributes: { friendly_name: 'Giardino' } }
  ]);
  assert.strictEqual(Home.mainCamera().id, 'camera.garage');
  assert.strictEqual(Home.cameraForMotion('binary_sensor.qualunque').id, 'camera.garage');
  Home.data = null;
  assert.strictEqual(Home.mainCamera(), null);
});

test('classify nasconde le telecamere non raggiungibili', function () {
  var data = Home.classify([
    { entity_id: 'camera.garage', state: 'idle', attributes: { friendly_name: 'Garage' } },
    { entity_id: 'camera.ingresso', state: 'unavailable', attributes: { friendly_name: 'Ingresso' } }
  ]);
  assert.deepStrictEqual(data.cameras.map(function (c) { return c.id; }), ['camera.garage']);
});

test('parseHistory scarta i valori non numerici e porta i punti vecchi all inizio', function () {
  var since = Date.parse('2026-10-13T00:00:00Z');
  var series = Home.parseHistory([[
    { entity_id: 'sensor.t', state: '19.5', last_changed: '2026-10-12T22:00:00Z' },
    { state: 'unavailable', last_changed: '2026-10-13T01:00:00Z' },
    { state: '21', last_changed: '2026-10-13T02:00:00Z' }
  ]], since);
  assert.strictEqual(series[0].id, 'sensor.t');
  assert.deepStrictEqual(series[0].points, [{ t: since, v: 19.5 }, { t: Date.parse('2026-10-13T02:00:00Z'), v: 21 }]);
});

test('cameraPath usa il token di entity_picture, anche per lo stream', function () {
  var cam = { picture: '/api/camera_proxy/camera.a?token=xyz' };
  assert.strictEqual(Home.cameraPath(cam, false), '/api/camera_proxy/camera.a?token=xyz');
  assert.strictEqual(Home.cameraPath(cam, true), '/api/camera_proxy_stream/camera.a?token=xyz');
  assert.strictEqual(Home.cameraPath({ picture: '' }, true), '');
});
