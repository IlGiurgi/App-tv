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

  var Remote = {
    EVENT: EVENT,
    cleanItem: cleanItem,
    build: build,
    accepts: accepts,

    /** Telefono: spedisce il comando a Home Assistant. */
    send: function (target, action, item) {
      var command = build(target, action, item);
      if (!command) return Promise.reject(new Error('Comando non valido'));
      return root.Home.request('/api/events/' + EVENT, command);
    },

    /** TV: esegue un comando arrivato da Home Assistant. */
    handle: function (command) {
      if (!root.Platform || !root.Platform.isTV || !root.App || !root.App.client) return;
      var mine = root.Watching && root.Watching.entityId.replace('sensor.hometivu_', '');
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
