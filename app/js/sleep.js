/*
 * Fermare la riproduzione da sola, in due casi:
 *  - Timer di spegnimento: durante un canale, ⏯ sceglie 30, 60, 90, 120 minuti o spento.
 *  - Inattività: se per ore non si preme nessun tasto mentre qualcosa è in riproduzione
 *    (Impostazioni → "Stai ancora guardando?").
 * Prima di fermare compare per un minuto "Stai ancora guardando?": qualsiasi tasto annulla.
 * Solo sulla TV. Le TV Samsung non si spengono da un'app web: si ferma l'audio/video e si torna alla Home.
 */
(function (root) {
  'use strict';

  var STEPS = [0, 30, 60, 90, 120];
  var CHECK_MS = 5000;
  var WARN_MS = 60000;

  var doc = root.document;
  var promptEl = doc.getElementById('sleep-prompt');
  var textEl = promptEl.querySelector('.sleep-prompt-text');

  var minutes = 0; // timer scelto (0 = nessuno)
  var endsAt = 0;
  var lastActivity = Date.now();
  var warnUntil = 0; // diverso da 0 = avviso a schermo, si ferma a quest'ora
  var reason = '';

  function playing() {
    return !!root.Player && !!Player.url;
  }

  function stopPlayback() {
    if (App.current() === App.screens.player) App.back();
    MiniPlayer.close();
    Player.stop();
  }

  function clearWarning() {
    warnUntil = 0;
    promptEl.classList.remove('visible');
  }

  function warn(why) {
    reason = why;
    warnUntil = Date.now() + WARN_MS;
    promptEl.classList.add('visible');
    paintWarning();
  }

  function paintWarning() {
    var left = Math.max(0, Math.ceil((warnUntil - Date.now()) / 1000));
    textEl.textContent = (reason === 'timer' ? 'Il timer sta per fermare la riproduzione' : 'Nessun tasto premuto da ore') +
      ': tra ' + left + ' secondi si ferma. Premi un tasto per continuare.';
  }

  var Sleep = {
    STEPS: STEPS,

    /** Minuti ancora da attendere per il timer (0 = nessun timer). */
    remaining: function () {
      return endsAt ? Math.max(1, Math.ceil((endsAt - Date.now()) / 60000)) : 0;
    },

    /** Passa al valore successivo: spento → 30 → 60 → 90 → 120 → spento. Restituisce i minuti scelti. */
    cycle: function () {
      minutes = STEPS[(STEPS.indexOf(minutes) + 1) % STEPS.length];
      endsAt = minutes ? Date.now() + minutes * 60000 : 0;
      UI.toast(minutes ? 'Timer: la riproduzione si ferma tra ' + minutes + ' minuti' : 'Timer di spegnimento disattivato');
      return minutes;
    },

    cancel: function () {
      minutes = 0;
      endsAt = 0;
      clearWarning();
    },

    /** Un controllo; separato dal timer per poterlo provare nei test. */
    check: function (now) {
      if (!Platform.isTV) return;
      now = now || Date.now();
      if (warnUntil) {
        if (!playing()) clearWarning();
        else if (now >= warnUntil) {
          clearWarning();
          Sleep.cancel();
          stopPlayback();
          UI.toast('Riproduzione fermata', 5000);
          lastActivity = now;
        } else paintWarning();
        return;
      }
      if (!playing()) {
        endsAt = 0;
        minutes = 0;
        return;
      }
      if (endsAt && now >= endsAt - WARN_MS) warn('timer');
      else {
        var hours = App.settings && App.settings.idleHours;
        if (hours && now - lastActivity >= hours * 3600000) warn('idle');
      }
    },

    /** Per i test: finge che l'ultimo tasto sia stato premuto tanto tempo fa. */
    setLastActivity: function (at) { lastActivity = at; },
    isWarning: function () { return !!warnUntil; }
  };

  // Qualsiasi tasto o tocco: azzera l'inattività; con l'avviso a schermo lo chiude senza fare altro.
  function onActivity(event) {
    lastActivity = Date.now();
    if (!warnUntil) return;
    if (event && event.type === 'mousemove') return;
    if (event && event.preventDefault) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    if (reason === 'timer') Sleep.cancel();
    clearWarning();
    UI.toast(reason === 'timer' ? 'Timer annullato' : 'Bene, continua pure');
  }
  doc.addEventListener('keydown', onActivity, true);
  ['mousedown', 'touchstart', 'wheel'].forEach(function (type) { doc.addEventListener(type, onActivity, true); });
  doc.addEventListener('mousemove', function () { lastActivity = Date.now(); }, true);

  setInterval(function () { Sleep.check(); }, CHECK_MS);

  root.Sleep = Sleep;
})(this);
