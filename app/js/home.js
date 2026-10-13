/*
 * Client Home Assistant (REST + WebSocket) per il tab "Casa" della versione TV.
 * Codice ES2015 senza async/await: Tizen 3.0 usa Chromium 47.
 * Esportato come modulo CommonJS (test in Node) o come window.Home.
 *
 * URL, token e abbinamenti sensore -> telecamera li inserisce l'utente nelle Impostazioni:
 * non compaiono mai nel codice. Le entità si scoprono da sole da /api/states.
 */
(function (root) {
  'use strict';

  var TIMEOUT = 15000;
  var RECONNECT_MS = 10000;
  var MOTION_CLASSES = ['motion', 'occupancy', 'presence', 'moving'];
  var RECORDING_NAME = /registr|record|leggera|light/i;
  var MOTION_NAME = /radar|motion|movimento|presenza|presence/i;

  /** Aggiunge http:// e toglie gli slash finali: "192.168.1.5:8123" -> "http://192.168.1.5:8123". */
  function normalizeUrl(input) {
    var url = String(input || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
    return url.replace(/\/+$/, '');
  }

  /** "http://ha:8123" -> "ws://ha:8123/api/websocket" (https -> wss). */
  function wsUrl(base) {
    return normalizeUrl(base).replace(/^http/i, 'ws') + '/api/websocket';
  }

  /**
   * Abbinamenti sensore di movimento -> telecamera, scritti come
   * "binary_sensor.ingresso=camera.ingresso; binary_sensor.garage=camera.garage" (separatori: ; , a capo).
   */
  function parseMotionMap(text) {
    var map = {};
    String(text || '').split(/[;,\n]/).forEach(function (pair) {
      var eq = pair.indexOf('=');
      if (eq <= 0) return;
      var sensor = pair.slice(0, eq).trim();
      var camera = pair.slice(eq + 1).trim();
      if (sensor && camera) map[sensor] = camera;
    });
    return map;
  }

  /** "camera.a, camera.b" -> ['camera.a', 'camera.b'] (separatori: ; , a capo). */
  function parseList(text) {
    return String(text || '').split(/[;,\n]/).map(function (item) { return item.trim(); }).filter(Boolean);
  }

  function domainOf(entityId) {
    return String(entityId).split('.')[0];
  }

  function describe(s) {
    var attrs = s.attributes || {};
    return {
      id: s.entity_id,
      name: attrs.friendly_name || s.entity_id,
      state: s.state,
      unit: attrs.unit_of_measurement || '',
      picture: attrs.entity_picture || '',
      // Climatizzatori/termostati: temperatura impostata e attuale.
      target: attrs.temperature,
      current: attrs.current_temperature,
      min: attrs.min_temp,
      max: attrs.max_temp,
      step: attrs.target_temp_step || 0.5
    };
  }

  /** Sensore binario di movimento: per tipo (movimento, presenza, occupazione) o per nome (radar, movimento, presenza...). */
  function isMotionSensor(s) {
    var attrs = s.attributes || {};
    if (domainOf(s.entity_id) !== 'binary_sensor') return false;
    if (MOTION_CLASSES.indexOf(attrs.device_class) !== -1) return true;
    return MOTION_NAME.test(s.entity_id + ' ' + (attrs.friendly_name || ''));
  }

  /** Divide l'elenco /api/states nelle categorie mostrate dall'app. */
  function classify(states) {
    var data = { cameras: [], temps: [], hums: [], lights: [], scenes: [], climates: [], motion: [] };
    (states || []).forEach(function (s) {
      var domain = domainOf(s.entity_id);
      var cls = (s.attributes || {}).device_class;
      // Le telecamere non raggiungibili (unavailable) non si mostrano: restano solo quelle che funzionano.
      if (domain === 'camera') { if (s.state !== 'unavailable') data.cameras.push(describe(s)); }
      else if (domain === 'light') data.lights.push(describe(s));
      else if (domain === 'scene') data.scenes.push(describe(s));
      else if (domain === 'climate') data.climates.push(describe(s));
      else if (domain === 'sensor' && cls === 'temperature') data.temps.push(describe(s));
      else if (domain === 'sensor' && cls === 'humidity') data.hums.push(describe(s));
      else if (isMotionSensor(s)) data.motion.push(describe(s));
    });
    Object.keys(data).forEach(function (key) {
      data[key].sort(function (a, b) { return a.name.localeCompare(b.name); });
    });
    return data;
  }

  /**
   * Risposta di /api/history/period (minimal_response): un array per entità -> [{id, points: [{t, v}]}].
   * I valori non numerici (unavailable, unknown) vengono scartati; i punti prima di `since` sono portati a `since`.
   */
  function parseHistory(raw, since) {
    return (raw || []).map(function (list) {
      var id = list.length ? list[0].entity_id : '';
      var points = [];
      list.forEach(function (entry) {
        var v = parseFloat(entry.state);
        var t = Date.parse(entry.last_changed || entry.last_updated);
        if (isNaN(v) || isNaN(t)) return;
        points.push({ t: Math.max(t, since), v: v });
      });
      return { id: id, points: points };
    });
  }

  /** Percorso dell'immagine con il token di accesso della telecamera (entity_picture). */
  function cameraPath(camera, stream) {
    if (!camera || !camera.picture) return '';
    return stream ? camera.picture.replace('/api/camera_proxy/', '/api/camera_proxy_stream/') : camera.picture;
  }

  // ---------- Parte che gira solo nel browser / sulla TV ----------

  var Home = {
    normalizeUrl: normalizeUrl,
    wsUrl: wsUrl,
    parseMotionMap: parseMotionMap,
    parseList: parseList,
    classify: classify,
    parseHistory: parseHistory,
    cameraPath: cameraPath,

    data: null,
    onMotion: function () {},
    onState: function () {},
    ws: null,
    // Stato del collegamento in tempo reale, mostrato in Impostazioni -> Casa per capire perché un avviso non compare.
    status: { ws: 'non avviato', events: 0, last: '', note: '' },
    reconnectTimer: null,
    running: false,

    config: function () {
      var c = (root.Storage && root.Storage.getHome()) || {};
      return { url: normalizeUrl(c.url), token: String(c.token || '').trim(), motion: c.motion || '', popup: c.popup !== false, cameras: c.cameras || '' };
    },

    configured: function () {
      var c = this.config();
      return !!(c.url && c.token);
    },

    /** Richiesta JSON con il token nell'intestazione; `body` presente = POST. */
    request: function (path, body) {
      var c = this.config();
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open(body === undefined ? 'GET' : 'POST', c.url + path, true);
        xhr.timeout = TIMEOUT;
        xhr.setRequestHeader('Authorization', 'Bearer ' + c.token);
        if (body !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onload = function () {
          if (xhr.status === 401) return reject(new Error('Token non valido'));
          if (xhr.status < 200 || xhr.status >= 300) return reject(new Error('Errore HTTP ' + xhr.status));
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(new Error('Risposta non valida da Home Assistant'));
          }
        };
        xhr.onerror = function () { reject(new Error('Impossibile contattare Home Assistant (' + c.url + ')')); };
        xhr.ontimeout = function () { reject(new Error('Home Assistant non risponde')); };
        xhr.send(body === undefined ? null : JSON.stringify(body));
      });
    },

    loadStates: function () {
      var self = this;
      if (!this.configured()) return Promise.reject(new Error('Home Assistant non configurato'));
      return this.request('/api/states').then(function (states) {
        self.data = classify(states);
        // Telecamere scelte nelle Impostazioni (es. camera.garage): le altre non si mostrano.
        var wanted = parseList(self.config().cameras);
        if (wanted.length) {
          self.data.cameras = self.data.cameras.filter(function (c) { return wanted.indexOf(c.id) !== -1; });
        }
        return self.data;
      });
    },

    /** Storico delle ultime `hours` ore per alcune entità: [{id, points}]. */
    history: function (ids, hours) {
      if (!ids.length) return Promise.resolve([]);
      var since = Date.now() - hours * 3600000;
      var path = '/api/history/period/' + encodeURIComponent(new Date(since).toISOString()) +
        '?filter_entity_id=' + encodeURIComponent(ids.join(',')) + '&minimal_response&no_attributes';
      return this.request(path).then(function (raw) { return parseHistory(raw, since); });
    },

    /** Accende/spegne una luce; restituisce il nuovo stato atteso. */
    toggleLight: function (light) {
      var turnOn = light.state !== 'on';
      return this.request('/api/services/light/' + (turnOn ? 'turn_on' : 'turn_off'), { entity_id: light.id })
        .then(function () {
          light.state = turnOn ? 'on' : 'off';
          return light;
        });
    },

    /** Accende o spegne un climatizzatore (spento -> riprende la modalità di Home Assistant). */
    toggleClimate: function (climate) {
      var turnOn = climate.state === 'off';
      return this.request('/api/services/climate/' + (turnOn ? 'turn_on' : 'turn_off'), { entity_id: climate.id })
        .then(function () {
          climate.state = turnOn ? 'auto' : 'off'; // lo stato vero arriva con l'evento successivo
          return climate;
        });
    },

    /** Sposta la temperatura impostata di `delta` gradi (rispetta minimo, massimo e passo). */
    adjustClimate: function (climate, delta) {
      var base = typeof climate.target === 'number' ? climate.target : climate.current;
      if (typeof base !== 'number') return Promise.reject(new Error('Temperatura non disponibile'));
      var next = Math.round((base + delta * climate.step) / climate.step) * climate.step;
      if (typeof climate.min === 'number') next = Math.max(climate.min, next);
      if (typeof climate.max === 'number') next = Math.min(climate.max, next);
      return this.request('/api/services/climate/set_temperature', { entity_id: climate.id, temperature: next })
        .then(function () {
          climate.target = next;
          return climate;
        });
    },

    activateScene: function (scene) {
      return this.request('/api/services/scene/turn_on', { entity_id: scene.id });
    },

    /** URL assoluto dell'immagine (anteprima) o dello stream MJPEG di una telecamera; '' se non disponibile. */
    cameraUrl: function (camera, stream) {
      var path = cameraPath(camera, stream);
      return path ? this.config().url + path : '';
    },

    cameraById: function (id) {
      var list = (this.data && this.data.cameras) || [];
      return list.filter(function (c) { return c.id === id; })[0] || null;
    },

    /**
     * La telecamera principale (dashboard, riquadro del movimento): la prima scritta in Impostazioni; altrimenti,
     * tra quelle elencate, la più "garage" che non sia una registrazione (le entità di registrazione non danno immagini).
     */
    mainCamera: function () {
      var cameras = (this.data && this.data.cameras) || [];
      var preferred = this.cameraById(parseList(this.config().cameras)[0]);
      if (preferred) return preferred;
      function score(c) {
        var text = c.id + ' ' + c.name;
        var points = /garage/i.test(text) ? -10 : 0;
        if (RECORDING_NAME.test(text)) points += 20;
        return points * 1000 + c.id.length;
      }
      return cameras.slice().sort(function (a, b) { return score(a) - score(b); })[0] || null;
    },

    /** Telecamera da mostrare quando scatta un sensore: quella abbinata, altrimenti la principale. */
    cameraForMotion: function (sensorId) {
      var mapped = parseMotionMap(this.config().motion)[sensorId];
      if (mapped) return this.cameraById(mapped);
      return this.mainCamera();
    },

    // ---------- Eventi in tempo reale (WebSocket) ----------

    /** Si collega agli eventi di Home Assistant e si riconnette da solo se la connessione cade. */
    start: function () {
      this.stop();
      if (!this.configured() || typeof root.WebSocket === 'undefined') return;
      this.running = true;
      var self = this;
      this.loadStates().then(function () { self.connect(); }, function () { self.scheduleReconnect(); });
    },

    stop: function () {
      this.running = false;
      clearTimeout(this.reconnectTimer);
      if (this.ws) {
        var ws = this.ws;
        this.ws = null;
        ws.onclose = null;
        try { ws.close(); } catch (e) { /* già chiuso */ }
      }
    },

    scheduleReconnect: function () {
      var self = this;
      if (!this.running) return;
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(function () {
        if (self.running) self.start();
      }, RECONNECT_MS);
    },

    connect: function () {
      var self = this;
      var c = this.config();
      var ws;
      try {
        ws = new root.WebSocket(wsUrl(c.url));
      } catch (e) {
        this.scheduleReconnect();
        return;
      }
      this.ws = ws;
      this.status.ws = 'connessione in corso';
      ws.onmessage = function (message) {
        var msg;
        try { msg = JSON.parse(message.data); } catch (e) { return; }
        if (msg.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: c.token }));
        else if (msg.type === 'auth_ok') {
          self.status.ws = 'connesso';
          ws.send(JSON.stringify({ id: 1, type: 'subscribe_events', event_type: 'state_changed' }));
        } else if (msg.type === 'auth_invalid') {
          self.stop();
          self.status.ws = 'token rifiutato';
        }
        else if (msg.type === 'event' && msg.event) self.handleEvent(msg.event.data || {});
      };
      ws.onclose = function () {
        if (self.ws === ws) {
          self.ws = null;
          self.status.ws = 'caduto, riprovo tra poco';
          self.scheduleReconnect();
        }
      };
    },

    handleEvent: function (change) {
      var s = change.new_state;
      if (!s || !s.entity_id) return;
      var before = change.old_state ? change.old_state.state : null;
      this.status.events++;
      if (domainOf(s.entity_id) === 'binary_sensor') {
        this.status.last = s.entity_id + ': ' + before + ' → ' + s.state + ' (tipo ' + ((s.attributes || {}).device_class || 'nessuno') + ')';
        this.status.note = '';
      }
      // Scatta per i sensori di movimento riconosciuti e per quelli abbinati a mano nelle Impostazioni.
      var mapped = !!parseMotionMap(this.config().motion)[s.entity_id];
      if ((isMotionSensor(s) || mapped) && s.state === 'on' && before !== 'on') {
        var camera = this.cameraForMotion(s.entity_id);
        if (camera) this.onMotion(camera, s.entity_id);
        else this.status.note = 'ignorato: nessuna telecamera abbinata (abbina il sensore in Movimento)';
        return;
      }
      var domain = domainOf(s.entity_id);
      if (domain === 'camera' && this.data) {
        var cam = this.cameraById(s.entity_id);
        if (cam) cam.picture = (s.attributes || {}).entity_picture || cam.picture; // il token dell'immagine ruota
      }
      this.onState(s);
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Home;
  else root.Home = Home;
})(this);
