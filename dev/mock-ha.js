'use strict';

/*
 * Home Assistant finto per lo sviluppo e i test: REST (/api/states, storico, servizi, immagini delle
 * telecamere) e WebSocket (/api/websocket) con gli eventi state_changed.
 * Il token di prova è "ha-test-token". GET /mock-ha/motion?entity=binary_sensor.mov_ingresso fa scattare un sensore.
 */

var crypto = require('crypto');

var TOKEN = 'ha-test-token';

var states = [
  { entity_id: 'camera.ingresso', state: 'idle', attributes: { friendly_name: 'Ingresso', entity_picture: '/api/camera_proxy/camera.ingresso?token=abc' } },
  { entity_id: 'camera.giardino', state: 'idle', attributes: { friendly_name: 'Giardino', entity_picture: '/api/camera_proxy/camera.giardino?token=def' } },
  { entity_id: 'sensor.temp_soggiorno', state: '21.4', attributes: { friendly_name: 'Temperatura soggiorno', device_class: 'temperature', unit_of_measurement: '°C' } },
  { entity_id: 'sensor.umid_soggiorno', state: '48', attributes: { friendly_name: 'Umidità soggiorno', device_class: 'humidity', unit_of_measurement: '%' } },
  { entity_id: 'sensor.batteria', state: '90', attributes: { friendly_name: 'Batteria', device_class: 'battery', unit_of_measurement: '%' } },
  { entity_id: 'light.cucina', state: 'on', attributes: { friendly_name: 'Luce cucina' } },
  { entity_id: 'light.camera', state: 'off', attributes: { friendly_name: 'Luce camera' } },
  { entity_id: 'climate.salotto', state: 'cool', attributes: { friendly_name: 'Condizionatore salotto', temperature: 23, current_temperature: 25.5, min_temp: 16, max_temp: 30, target_temp_step: 0.5 } },
  { entity_id: 'climate.cucina', state: 'off', attributes: { friendly_name: 'Condizionatore cucina', temperature: 22, current_temperature: 24, min_temp: 16, max_temp: 30, target_temp_step: 1 } },
  { entity_id: 'weather.casa', state: 'partlycloudy', attributes: { friendly_name: 'Casa', temperature: 18.5, humidity: 62, temperature_unit: '°C' } },
  { entity_id: 'sensor.esterno_temperatura', state: '17.0', attributes: { friendly_name: 'Temperatura esterno', device_class: 'temperature', unit_of_measurement: '°C' } },
  { entity_id: 'scene.cinema', state: 'scening', attributes: { friendly_name: 'Cinema' } },
  { entity_id: 'scene.sera', state: 'scening', attributes: { friendly_name: 'Sera' } },
  { entity_id: 'binary_sensor.mov_ingresso', state: 'off', attributes: { friendly_name: 'Movimento ingresso', device_class: 'motion' } }
];

var log = []; // chiamate ai servizi, per i test
var sockets = [];

function find(id) {
  return states.filter(function (s) { return s.entity_id === id; })[0];
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
  return true;
}

function history(ids) {
  var now = Date.now();
  return ids.map(function (id) {
    var list = [];
    var humidity = id.indexOf('umid') !== -1;
    for (var i = 0; i < 48; i++) {
      var t = now - (48 - i) * 1800000;
      var value = (humidity ? 50 : 21) + Math.sin(i / 6) * (humidity ? 8 : 3);
      var entry = { state: value.toFixed(1), last_changed: new Date(t).toISOString() };
      if (i === 0) entry.entity_id = id;
      list.push(entry);
    }
    return list;
  });
}

function cameraSvg(id) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">' +
    '<rect width="640" height="360" fill="#234"/><text x="320" y="190" font-family="Arial" font-size="48" ' +
    'fill="#fff" text-anchor="middle">' + id + '</text></svg>';
}

function frameText(text) {
  var payload = Buffer.from(text);
  var header = payload.length < 126
    ? Buffer.from([0x81, payload.length])
    : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 255]);
  return Buffer.concat([header, payload]);
}

function broadcast(event) {
  var frame = frameText(JSON.stringify({ id: 1, type: 'event', event: event }));
  sockets.forEach(function (socket) { if (socket.subscribed) socket.write(frame); });
}

/** Legge i frame di testo mascherati inviati dal browser (messaggi piccoli, un frame ciascuno). */
function readFrames(buffer) {
  var messages = [];
  var pos = 0;
  while (pos + 2 <= buffer.length) {
    var opcode = buffer[pos] & 15;
    var len = buffer[pos + 1] & 127;
    var offset = pos + 2;
    if (len === 126) { len = buffer.readUInt16BE(offset); offset += 2; }
    var mask = buffer.slice(offset, offset + 4);
    offset += 4;
    var data = Buffer.alloc(len);
    for (var i = 0; i < len; i++) data[i] = buffer[offset + i] ^ mask[i % 4];
    if (opcode === 1) messages.push(data.toString());
    pos = offset + len;
  }
  return messages;
}

/** Gestisce le richieste /api/* e /mock-ha/*; restituisce false se la richiesta non è per HA. */
function handle(req, res, parsed, pathname) {
  if (pathname.indexOf('/mock-ha/') === 0) {
    if (pathname === '/mock-ha/motion') {
      var sensor = find(parsed.query.entity || 'binary_sensor.mov_ingresso');
      var old = JSON.parse(JSON.stringify(sensor));
      sensor.state = 'on';
      broadcast({ event_type: 'state_changed', data: { entity_id: sensor.entity_id, old_state: old, new_state: sensor } });
      return json(res, 200, { ok: true });
    }
    if (pathname === '/mock-ha/log') return json(res, 200, log);
    return false;
  }
  if (pathname.indexOf('/api/camera_proxy') === 0) { // le immagini usano il token nell'URL, non l'intestazione
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end(cameraSvg(pathname.split('/').pop()));
    return true;
  }
  if (pathname.indexOf('/api/') !== 0) return false;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST'
    });
    res.end();
    return true;
  }
  if (req.headers.authorization !== 'Bearer ' + TOKEN) return json(res, 401, { message: '401: Unauthorized' });
  if (pathname === '/api/states') return json(res, 200, states);
  if (pathname.indexOf('/api/history/period/') === 0) {
    return json(res, 200, history(String(parsed.query.filter_entity_id || '').split(',').filter(Boolean)));
  }
  var service = pathname.match(/^\/api\/services\/(\w+)\/(\w+)$/);
  if (service && req.method === 'POST') {
    var body = '';
    req.on('data', function (chunk) { body += chunk; });
    req.on('end', function () {
      var data = JSON.parse(body || '{}');
      log.push([service[1], service[2], data.entity_id]);
      var entity = find(data.entity_id);
      if (entity && service[1] === 'light') entity.state = service[2] === 'turn_on' ? 'on' : 'off';
      if (entity && service[1] === 'climate') {
        if (service[2] === 'set_temperature') entity.attributes.temperature = data.temperature;
        else entity.state = service[2] === 'turn_on' ? 'cool' : 'off';
      }
      if (data.temperature !== undefined) log[log.length - 1].push(data.temperature);
      json(res, 200, entity ? [entity] : []);
    });
    return true;
  }
  return json(res, 404, { message: 'Non trovato' });
}

/** Collega il WebSocket /api/websocket al server HTTP. */
function attach(server) {
  server.on('upgrade', function (req, socket) {
    if (req.url !== '/api/websocket') return socket.destroy();
    var accept = crypto.createHash('sha1')
      .update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    sockets.push(socket);
    socket.write(frameText(JSON.stringify({ type: 'auth_required', ha_version: 'mock' })));
    socket.on('data', function (buffer) {
      readFrames(buffer).forEach(function (text) {
        var msg = JSON.parse(text);
        if (msg.type === 'auth') {
          socket.write(frameText(JSON.stringify({ type: msg.access_token === TOKEN ? 'auth_ok' : 'auth_invalid' })));
        } else if (msg.type === 'subscribe_events') {
          socket.subscribed = true;
          socket.write(frameText(JSON.stringify({ id: msg.id, type: 'result', success: true, result: null })));
        }
      });
    });
    socket.on('close', function () { sockets.splice(sockets.indexOf(socket), 1); });
    socket.on('error', function () { /* il browser ha chiuso la connessione */ });
  });
}

module.exports = { handle: handle, attach: attach, TOKEN: TOKEN };
