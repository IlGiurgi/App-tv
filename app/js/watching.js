/*
 * Comunica a Home Assistant cosa si sta guardando: un sensore (es. sensor.hometivu_ue49mu6500) con il canale
 * come stato e programma, tipo e feed come attributi, da usare nelle automazioni.
 *
 * Il sensore si crea con POST /api/states: Home Assistant lo dimentica al riavvio, per questo
 * l'app lo rimanda a ogni cambio e comunque ogni pochi minuti.
 * Attivo solo sulla TV con Home Assistant collegato (Impostazioni → Casa), disattivabile.
 */
(function (root) {
  'use strict';

  var HEARTBEAT_MS = 5 * 60000;
  var OFF = 'spento';

  var last = null; // ultimo stato inviato {state, attributes}
  var lastJson = '';
  var lastSent = 0;
  var sending = false;

  /** Nome del modello della TV in minuscolo (ue49mu6500), per distinguere un sensore per TV. */
  function deviceSlug() {
    var model = '';
    try { model = root.webapis.productinfo.getRealModel(); } catch (e) { /* API assente */ }
    if (!model) {
      try { model = root.webapis.productinfo.getModel(); } catch (e) { /* API assente */ }
    }
    var slug = String(model || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return slug || 'tv';
  }

  var entityId = 'sensor.hometivu_' + deviceSlug();

  function enabled() {
    return Platform.isTV && Home.configured() && Storage.getHome().report !== false;
  }

  function send(force) {
    if (!last || sending || !enabled()) return;
    var json = JSON.stringify(last);
    if (!force && json === lastJson) return;
    sending = true;
    Home.request('/api/states/' + entityId, last).then(function () {
      lastJson = json;
      lastSent = Date.now();
    }, function () { /* Home Assistant non raggiungibile: si riprova al prossimo cambio o battito */ }).then(function () {
      sending = false;
      if (last && JSON.stringify(last) !== lastJson) send(false); // cambiato mentre si inviava
    });
  }

  var Watching = {
    entityId: entityId,
    enabled: enabled,

    /**
     * @param {Object|null} info {item, status, program, next, feed}; null = non si guarda niente
     */
    update: function (info) {
      var attributes = { friendly_name: 'HomeTivu ' + deviceSlug().toUpperCase(), icon: 'mdi:television-play' };
      var state = OFF;
      if (info && info.item) {
        var it = info.item;
        state = it.name || OFF;
        attributes.tipo = it.type === 'live' ? 'canale' : it.type === 'vod' ? 'film' : 'episodio';
        attributes.stato = info.status || '';
        if (it.num) attributes.numero = it.num;
        if (it.icon) attributes.entity_picture = it.icon;
        if (info.program) {
          attributes.programma = info.program.title;
          attributes.inizio = new Date(info.program.start).toISOString();
          attributes.fine = new Date(info.program.end).toISOString();
        }
        if (info.next) attributes.dopo = info.next.title;
        if (info.feed) attributes.feed = info.feed;
      }
      // Home Assistant accetta stati fino a 255 caratteri.
      last = { state: String(state).slice(0, 255), attributes: attributes };
      send(false);
    }
  };

  setInterval(function () {
    if (last && Date.now() - lastSent > HEARTBEAT_MS) send(true);
  }, 60000);

  root.Watching = Watching;
})(this);
