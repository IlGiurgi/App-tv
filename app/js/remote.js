/*
 * Telecomando via Home Assistant: il telefono lancia l'evento "hometivu_command" e la TV, già collegata
 * a Home Assistant per la tab Casa, lo esegue. La TV non apre nessun server: niente indirizzo IP da inserire.
 *
 * Comando: {target, action, item?}. target = id della TV (come in sensor.hometivu_<modello>), vuoto = tutte.
 * Azioni: "play" (canale, film o episodio) e "stop" (torna alla Home).
 */
(function (root) {
  'use strict';

  var EVENT = 'hometivu_command';
  var ACTIONS = ['play', 'stop'];
  var TYPES = ['live', 'vod', 'episode'];
  var FIELDS = ['type', 'id', 'name', 'icon', 'num', 'ext', 'categoryId'];

  /** Tiene solo i campi che servono per riprodurre: il resto di ciò che arriva dalla rete si ignora. */
  function cleanItem(item) {
    if (!item || TYPES.indexOf(item.type) === -1 || !item.id) return null;
    var out = {};
    FIELDS.forEach(function (key) {
      if (item[key] !== undefined && item[key] !== null) out[key] = typeof item[key] === 'number' ? item[key] : String(item[key]).slice(0, 500);
    });
    out.id = String(out.id);
    return out;
  }

  /** Comando pronto da spedire, o null se non è valido. */
  function build(target, action, item) {
    if (ACTIONS.indexOf(action) === -1) return null;
    var command = { target: String(target || ''), action: action };
    if (action === 'play') {
      command.item = cleanItem(item);
      if (!command.item) return null;
    }
    return command;
  }

  /** Vale per questa TV? */
  function accepts(command, myId) {
    if (!command || typeof command !== 'object') return false;
    return !command.target || command.target === myId;
  }

  var FRESH_MS = 7 * 60000; // il sensore della TV viene rinnovato ogni ~5 minuti; si conta l'ora di Home Assistant (last_updated), non l'orologio della TV

  /**
   * Tra i sensori delle TV (sensor.hometivu_*), la prima che sta riproducendo qualcosa ed è stata aggiornata
   * da meno di 7 minuti: {name, state}. Altrimenti null (spenta, ferma, o sensore vecchio = TV che non risponde più).
   */
  function pickPlaying(states, now) {
    var list = Array.isArray(states) ? states : [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s || !/^sensor\.hometivu_/.test(s.entity_id || '')) continue;
      if (!s.state || ['spento', 'unavailable', 'unknown'].indexOf(s.state) !== -1) continue;
      var attrs = s.attributes || {};
      var at = Date.parse(s.last_updated || attrs.aggiornato || '');
      if (isNaN(at) || now - at > FRESH_MS) continue;
      return { name: attrs.friendly_name || s.entity_id, state: s.state };
    }
    return null;
  }

  /** Le TV che si sono annunciate da meno di 7 minuti (accese con HomeTivu aperta): [{id, name, state}]. */
  function pickAvailable(states, now) {
    var out = [];
    (Array.isArray(states) ? states : []).forEach(function (s) {
      if (!s || !/^sensor\.hometivu_/.test(s.entity_id || '')) return;
      var attrs = s.attributes || {};
      var at = Date.parse(s.last_updated || attrs.aggiornato || '');
      if (isNaN(at) || now - at > FRESH_MS) return;
      out.push({ id: s.entity_id.replace('sensor.hometivu_', ''), name: attrs.friendly_name || s.entity_id, state: s.state });
    });
    return out;
  }

  var Remote = {
    EVENT: EVENT,
    pickPlaying: pickPlaying,
    pickAvailable: pickAvailable,
    cleanItem: cleanItem,
    build: build,
    accepts: accepts,

    /** Telefono: spedisce il comando a Home Assistant. */
    send: function (target, action, item) {
      var command = build(target, action, item);
      if (!command) return Promise.reject(new Error('Comando non valido'));
      return root.Home.request('/api/events/' + EVENT, command);
    },

    // ---------- Telefono ----------

    /** Telefono con "Telecomando TV" attivo: canali, film ed episodi partono sulla TV invece che qui. */
    active: function () {
      return !!(root.Platform && !root.Platform.isTV && root.Home.configured() && root.Storage.getHome().remote === true);
    },

    target: function () {
      return String(root.Storage.getHome().remoteTarget || '');
    },

    setConfig: function (patch) {
      var home = root.Storage.getHome();
      Object.keys(patch).forEach(function (key) { home[key] = patch[key]; });
      root.Storage.setHome(home);
    },

    /** Le TV con HomeTivu che si sono annunciate a Home Assistant: [{id, name, state}]. */
    listTvs: function () {
      return root.Home.request('/api/states').then(function (states) {
        return states.filter(function (s) { return /^sensor\.hometivu_/.test(s.entity_id); }).map(function (s) {
          return { id: s.entity_id.replace('sensor.hometivu_', ''), name: (s.attributes || {}).friendly_name || s.entity_id, state: s.state };
        });
      });
    },

    /** TV disponibili adesso; con errori o HA non configurato risolve []. */
    availableTvs: function () {
      if (!root.Home || !root.Home.configured()) return Promise.resolve([]);
      return root.Home.request('/api/states').then(function (states) {
        return pickAvailable(states, Date.now());
      }, function () { return []; });
    },

    /** Cosa sta guardando la TV scelta: {state, programma, ...} oppure null se non annunciata. */
    status: function () {
      var target = this.target();
      if (!target) return Promise.resolve(null);
      return root.Home.request('/api/states/sensor.hometivu_' + target).then(function (s) { return s; }, function () { return null; });
    },

    /** Una TV sta riproducendo adesso? {name, state} oppure null; con errori o HA non configurato risolve null. */
    tvPlaying: function () {
      if (!root.Home || !root.Home.configured()) return Promise.resolve(null);
      return root.Home.request('/api/states').then(function (states) {
        return pickPlaying(states, Date.now());
      }, function () { return null; });
    },

    /** Manda alla TV scelta; avvisa se non si è scelta nessuna TV. */
    sendItem: function (item) {
      if (!this.target()) { root.UI.toast('Scegli prima la TV in Impostazioni → Telecomando TV', 4000); return; }
      this.send(this.target(), 'play', item).then(function () {
        root.UI.toast('Mandato alla TV: ' + item.name);
      }, function (err) { root.UI.toast('Non riesco a comandare la TV: ' + err.message, 5000); });
    },

    /** TV: esegue un comando arrivato da Home Assistant. */
    handle: function (command) {
      if (!root.Platform || !root.Platform.isTV || !root.App || !root.App.client) return;
      var mine = root.Watching && root.Watching.entityId.replace('sensor.hometivu_', '');
      Remote.last = new Date().toISOString().slice(11, 19) + ' ' + (command && command.action) + ' -> ' + (command && command.target) + (accepts(command, mine) ? ' (mia)' : ' (non per me, io=' + mine + ')');
      if (root.Watching) root.Watching.touch();
      if (!accepts(command, mine)) return;
      var item = command.action === 'play' ? cleanItem(command.item) : null;
      if (command.action === 'play' && !item) return;
      if (command.action !== 'play' && command.action !== 'stop') return;
      root.App.reset('launcher', {}); // chiude player e riquadri aperti
      if (!item) return;
      if (item.type !== 'live') return root.App.show('player', { playlist: [item], index: 0 });
      root.App.loadSection('live').then(function (data) {
        var same = data.items.filter(function (it) { return it.categoryId === item.categoryId; });
        var index = same.map(function (it) { return it.id; }).indexOf(item.id);
        if (index === -1) { same = [item]; index = 0; }
        root.App.show('player', { playlist: same, index: index });
      }, function () {
        root.App.show('player', { playlist: [item], index: 0 });
      });
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Remote;
  else root.Remote = Remote;
})(this);
