/*
 * Scene di Home Assistant legate alla visione (solo TV, Impostazioni → Casa):
 * quando parte un film, un episodio o una partita (aperta da "Le tue partite") si attiva la scena d'inizio,
 * quando la riproduzione finisce quella di fine. Un episodio dopo l'altro non riaccende le luci tra l'uno e l'altro:
 * la scena di fine parte dopo END_DELAY_MS di riproduzione ferma.
 */
(function (root) {
  'use strict';

  var END_DELAY_MS = 20000;
  var endDelayMs = END_DELAY_MS;

  var active = false;
  var armedLive = false; // il canale live in arrivo è una partita scelta dall'utente
  var endTimer = null;

  function runScene(id) {
    if (!id) return;
    Home.activateScene({ id: id }).then(function () {
      Home.status.note = 'scena attivata: ' + id;
    }, function (err) {
      Home.status.note = 'scena non attivata (' + id + '): ' + err.message;
    });
  }

  function finish() {
    if (!active) return;
    active = false;
    armedLive = false;
    runScene(Home.config().sceneEnd);
  }

  var Cinema = {
    /** Per i test. */
    setEndDelay: function (ms) { endDelayMs = ms; },

    enabled: function () {
      return Platform.isTV && Home.configured() && !!Home.config().sceneStart;
    },

    /** La prossima riproduzione live è una partita: attiva anche per i canali, non solo per film e serie. */
    armLive: function () {
      armedLive = true;
    },

    /** Chiamata da Watching.update: info = {item,...} o null. */
    onWatching: function (info) {
      if (!Cinema.enabled()) return;
      var it = info && info.item;
      var wants = !!it && (it.type !== 'live' || armedLive);
      if (wants) {
        clearTimeout(endTimer);
        endTimer = null;
        if (!active) {
          active = true;
          runScene(Home.config().sceneStart);
        }
      } else if (active && !endTimer) {
        endTimer = setTimeout(function () {
          endTimer = null;
          finish();
        }, endDelayMs);
      }
    }
  };

  root.Cinema = Cinema;
})(this);
