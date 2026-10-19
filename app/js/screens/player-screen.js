/*
 * Schermata di riproduzione a tutto schermo con overlay informativo.
 *
 * Live:  ▲/▼ o CH+/CH- cambiano canale, i numeri saltano a un canale, OK mostra le info.
 * Film/episodi: ◀/▶ ±10s, ⏩/⏪ ±60s, OK o ⏯ pausa; la posizione viene salvata per la ripresa.
 * ROSSO aggiunge/rimuove dai preferiti, GIALLO ricarica lo stream, BLU passa a un altro feed del canale,
 * INDIETRO chiude.
 */
(function (root) {
  'use strict';

  var OVERLAY_TIMEOUT = 5000;
  var ZAP_DELAY = 500;
  var DIGIT_DELAY = 1500;
  var SAVE_EVERY = 10000;
  var EPG_REFRESH = 60000; // finito il programma in onda
  var EPG_RETRY = 600000; // canali senza guida
  var MAX_FEEDS = 3;
  // Gli extra di un Intent Android hanno un limite di dimensione (~1 MB): al lettore nativo
  // si passa una finestra di canali attorno a quello scelto, non liste da migliaia di elementi.
  var NATIVE_WINDOW = 100;

  var rootEl = root.document.documentElement;
  var el = root.document.getElementById('screen-player');
  var titleEl = el.querySelector('.player-title');
  var subtitleEl = el.querySelector('.player-subtitle');
  var clockEl = el.querySelector('.player-clock');
  var nowEl = el.querySelector('.epg-now');
  var nextEl = el.querySelector('.epg-next');
  var progressEl = el.querySelector('.progress-bar');
  var timeEl = el.querySelector('.player-time');
  var statusEl = el.querySelector('.player-status');
  var digitsEl = el.querySelector('.player-digits');
  var numEl = el.querySelector('.player-num');
  var logoBoxEl = el.querySelector('.player-logo-box');
  var logoEl = el.querySelector('.player-logo');
  var channelEl = el.querySelector('.player-channel');
  var startEl = el.querySelector('.epg-start');
  var endEl = el.querySelector('.epg-end');
  var leftEl = el.querySelector('.epg-left');
  var tagsEl = el.querySelector('.player-tags');

  logoEl.onerror = function () { logoBoxEl.classList.add('empty'); };

  var state = {
    playlist: [], index: 0, epg: [], status: '',
    overlayTimer: null, zapTimer: null, digitTimer: null, digits: '',
    ticker: null, lastSave: 0, lastEpg: 0, epgToken: 0, toMini: false, retryMessage: '', feedTag: null
  };

  // Riquadro del canale in basso nella lista canali, a destra; a sinistra nella scheda Casa e nella telecamera,
  // dove a destra stanno i grafici e la telecamera (stesse misure di .mini-player in style.css).
  // 'home': scheda Casa, dove telecamera (in alto) e canale (in basso) stanno in una colonna a destra, più grandi.
  // 'launcher': Home a riquadri, il video riempie la parte alta del riquadro Live TV (vedi launcher.js).
  var MINI_RECTS = {
    left: [60, 748, 440, 248], right: [1420, 748, 440, 248], home: [1300, 681, 560, 315], launcher: [96, 196, 840, 472]
  };

  /**
   * Canale live che continua in un riquadro mentre si sfoglia la lista.
   * La schermata della lista disegna la cornice e si aggiorna con onChange.
   */
  var MiniPlayer = {
    active: false,
    side: 'right',
    playlist: [],
    index: 0,
    onChange: function () {},

    item: function () {
      return this.active ? this.playlist[this.index] : null;
    },

    /** Da che lato sta il riquadro ('left' | 'right'); le schermate lo impostano in base al loro layout. */
    setSide: function (side) {
      if (side === this.side) return;
      this.side = side;
      if (this.active) Player.setWindow(MINI_RECTS[side]);
    },

    open: function () {
      this.active = true;
      this.playlist = state.playlist;
      this.index = state.index;
      rootEl.classList.add('mini');
      Player.setWindow(MINI_RECTS[this.side]);
      Player.onEvent = function (type) {
        if (type === 'error' || type === 'ended') MiniPlayer.close();
      };
      this.onChange();
    },

    /** Torna a schermo intero sul canale del riquadro. */
    expand: function () {
      if (this.active) App.show('player', { playlist: this.playlist, index: this.index });
    },

    close: function () {
      if (!this.active) return;
      Player.stop(); // prima di detach: così non si riapre lo stream a schermo intero
      Watching.update(null);
      this.detach();
      rootEl.classList.remove('playing');
      this.onChange();
    },

    /** Dal canale a schermo intero lo riduce nel riquadro (come INDIETRO); false se non si può (film, telefono). */
    minimize: function () {
      if (App.current() !== screen || !isLive() || Platform.isAndroidApp || rootEl.classList.contains('mobile')) return false;
      state.toMini = true;
      App.back();
      return this.active;
    },

    /** Lascia il riquadro senza fermare la riproduzione (passaggio a schermo intero). */
    detach: function () {
      this.active = false;
      rootEl.classList.remove('mini');
      Player.setWindow(null);
    }
  };

  function item() {
    return state.playlist[state.index];
  }

  function isLive() {
    return item() && item().type === 'live';
  }

  function resumeKey(it) {
    return it.type + ':' + it.id;
  }

  // ---------- Overlay ----------

  function showOverlay(persistent) {
    el.classList.add('overlay-visible');
    clearTimeout(state.overlayTimer);
    if (!persistent) {
      state.overlayTimer = setTimeout(function () {
        if (state.status === 'playing') el.classList.remove('overlay-visible');
      }, OVERLAY_TIMEOUT);
    }
  }

  function setStatus(status, message) {
    state.status = status;
    el.setAttribute('data-status', status);
    statusEl.textContent = message || {
      buffering: 'Caricamento…',
      paused: '❚❚  In pausa',
      error: 'Errore'
    }[status] || '';
    if (status === 'playing') showOverlay(false);
    else showOverlay(true);
    report();
  }

  var STATUS_LABELS = { playing: 'in onda', paused: 'in pausa', buffering: 'caricamento', error: 'errore' };

  /** Cosa si sta guardando, per il sensore di Home Assistant (js/watching.js). */
  function report() {
    var it = item();
    if (!it) return;
    var now = Date.now();
    Watching.update({
      item: it,
      status: STATUS_LABELS[state.status] || '',
      program: isLive() ? state.epg.filter(function (p) { return p.start <= now && p.end > now; })[0] : null,
      next: isLive() ? state.epg.filter(function (p) { return p.start > now; })[0] : null,
      feed: Player.sourceLabel()
    });
  }

  function renderInfo() {
    var it = item();
    var live = it.type === 'live';
    var favorite = it.type !== 'episode' && Storage.isFavorite(it.type, it.id);
    titleEl.textContent = it.name;
    subtitleEl.textContent = favorite ? '★' : '';
    // Banner dei canali live: numero grande, logo, nome, posizione nella lista e preferito.
    el.classList.toggle('is-live', live);
    numEl.textContent = live && it.num ? String(it.num) : '';
    logoBoxEl.classList.toggle('empty', !(live && it.icon));
    if (live && it.icon && logoEl.getAttribute('src') !== it.icon) logoEl.src = it.icon;
    channelEl.textContent = live ? it.name : '';
    UI.clear(tagsEl);
    if (live) {
      if (favorite) tagsEl.appendChild(UI.h('span.player-tag.is-fav', { text: '★ Preferito' }));
      tagsEl.appendChild(UI.h('span.player-tag', { text: (state.index + 1) + ' / ' + state.playlist.length }));
      if (state.feedTag) tagsEl.appendChild(UI.h('span.player-tag.is-feed', { text: state.feedTag }));
    }
    nowEl.textContent = '';
    nextEl.textContent = '';
    updateProgress();
  }

  function updateProgress() {
    clockEl.textContent = UI.formatClock(Date.now());
    var ratio = 0;
    if (isLive()) {
      var now = Date.now();
      var current = state.epg.filter(function (p) { return p.start <= now && p.end > now; })[0];
      var next = state.epg.filter(function (p) { return p.start > now; })[0];
      nowEl.textContent = current ? current.title : '';
      startEl.textContent = current ? UI.formatClock(current.start) : '';
      endEl.textContent = current ? UI.formatClock(current.end) : '';
      leftEl.textContent = current ? 'mancano ' + Math.max(1, Math.ceil((current.end - now) / 60000)) + ' min' : '';
      nextEl.textContent = next ? 'Dopo  ' + UI.formatClock(next.start) + '  ' + next.title : '';
      if (current) ratio = (now - current.start) / (current.end - current.start);
      timeEl.textContent = '';
    } else {
      var time = Player.currentTime();
      var duration = Player.duration();
      startEl.textContent = endEl.textContent = leftEl.textContent = '';
      if (duration) ratio = time / duration;
      timeEl.textContent = duration ? UI.formatDuration(time) + ' / ' + UI.formatDuration(duration) : '';
    }
    progressEl.style.width = (Math.max(0, Math.min(1, ratio)) * 100).toFixed(2) + '%';
  }

  /** La guida del canale in onda si richiede di nuovo solo quando il programma in corso è finito. */
  function epgExpired(now) {
    var current = state.epg.some(function (p) { return p.start <= now && p.end > now; });
    if (current) return false;
    return now - state.lastEpg > (state.epg.length ? EPG_REFRESH : EPG_RETRY);
  }

  function loadEpg() {
    var it = item();
    var token = ++state.epgToken;
    state.epg = [];
    state.lastEpg = Date.now();
    App.client.getShortEpg(it.id, 3).then(function (epg) {
      if (token !== state.epgToken) return;
      state.epg = epg;
      updateProgress();
      report();
    }, function () { /* EPG non disponibile per questo canale */ });
  }

  // ---------- Riproduzione ----------

  function start(startAt) {
    var it = item();
    clearTimeout(state.zapTimer);
    state.retryMessage = '';
    renderInfo();
    setStatus('buffering');
    Player.play(App.streamUrl(it), startAt || 0, it.type === 'live');
    if (it.type === 'live') {
      loadEpg();
      rememberChannel(it);
      addAlternateFeeds(it);
    }
    state.lastSave = Date.now();
  }

  /**
   * Feed di riserva se il canale si blocca: canali con lo stesso nome (altre qualità o backup)
   * e, per ultimo, lo stesso canale nell'altro formato, se l'abbonamento lo consente.
   */
  function addAlternateFeeds(it) {
    var section = App.cache && App.cache.live;
    state.feedTag = null;
    if (!section) return;
    section.then(function (data) {
      if (item() !== it || !Player.url) return;
      var feeds = App.alternateFeeds(it, data.items, MAX_FEEDS);
      Player.setAlternates(feeds);
      state.feedTag = feeds.length
        ? 'Feed di riserva: ' + feeds.map(function (f) { return f.label; }).join(' · ')
        : 'Feed di riserva: nessuno';
      renderInfo();
    }, function () { /* lista non disponibile: si riprova solo lo stesso feed */ });
  }

  function saveResume() {
    var it = item();
    if (!it || it.type === 'live' || !Player.url) return;
    var duration = Player.duration();
    if (duration) Storage.setResume(resumeKey(it), Player.currentTime(), duration, snapshot(it));
  }

  /** Copia leggera del contenuto da salvare (senza campi di visualizzazione). */
  function snapshot(it) {
    return { type: it.type, id: it.id, name: it.name, icon: it.icon || '', ext: it.ext, num: it.num, categoryId: it.categoryId };
  }

  /** Canale live appena avviato: diventa "l'ultimo canale" e quello prima diventa il precedente (tasto VERDE). */
  function rememberChannel(it) {
    if (state.currentLive && state.currentLive.id !== it.id) state.previousLive = state.currentLive;
    state.currentLive = it;
    Storage.setLastChannel(snapshot(it));
  }

  function goToPreviousChannel() {
    var prev = state.previousLive;
    if (!prev) {
      UI.toast('Nessun canale precedente');
      return;
    }
    var index = -1;
    state.playlist.some(function (ch, i) {
      if (ch.id === prev.id) { index = i; return true; }
      return false;
    });
    if (index === -1) {
      state.playlist = state.playlist.concat([prev]);
      index = state.playlist.length - 1;
    }
    jumpTo(index);
  }

  /** Cambio canale: aggiorna subito l'overlay, avvia lo stream dopo una breve pausa (zapping veloce). */
  function zap(delta) {
    var length = state.playlist.length;
    if (length < 2) return;
    state.index = (state.index + delta + length) % length;
    jumpTo(state.index);
  }

  function jumpTo(index) {
    state.index = index;
    state.feedTag = null;
    Player.stop();
    renderInfo();
    setStatus('buffering');
    clearTimeout(state.zapTimer);
    state.zapTimer = setTimeout(function () { start(0); }, ZAP_DELAY);
  }

  function typeDigit(digit) {
    state.digits = (state.digits + digit).slice(-4);
    digitsEl.textContent = state.digits;
    digitsEl.classList.add('visible');
    clearTimeout(state.digitTimer);
    state.digitTimer = setTimeout(function () {
      var number = state.digits;
      state.digits = '';
      digitsEl.classList.remove('visible');
      var target = -1;
      state.playlist.some(function (ch, i) {
        if (String(ch.num) === number) { target = i; return true; }
        return false;
      });
      if (target === -1) UI.toast('Canale ' + number + ' non trovato in questa lista');
      else if (target !== state.index) jumpTo(target);
    }, DIGIT_DELAY);
  }

  function onPlayerEvent(type, data) {
    if (App.current() !== screen) return;
    if (type === 'ended') {
      saveResume();
      var next = state.playlist[state.index + 1];
      if (item().type === 'episode' && next) {
        Storage.setResume(resumeKey(item()), 0, 0);
        state.index++;
        start(0);
      } else {
        App.back();
      }
      return;
    }
    // Il messaggio del tentativo resta finché lo stream non riparte (la riapertura segnala di nuovo 'buffering').
    if (type === 'retrying') {
      state.retryMessage = 'Segnale interrotto, riprovo (' + data.attempt + ' di ' + data.max + ')…' +
        (data.switched && data.label ? '\nFeed alternativo: ' + data.label : '');
      setStatus('buffering', state.retryMessage);
      return;
    }
    if (type !== 'buffering') state.retryMessage = '';
    if (type === 'error') setStatus(type, data + '\nOK per riprovare, INDIETRO per uscire');
    else setStatus(type, type === 'buffering' ? state.retryMessage : '');
  }

  function reload() {
    state.retryMessage = 'Ricarico…'; // mostrato dal 'buffering' della riapertura
    Player.reload();
  }

  function tick() {
    updateProgress();
    var now = Date.now();
    if (!isLive() && now - state.lastSave > SAVE_EVERY && state.status === 'playing') {
      state.lastSave = now;
      saveResume();
    }
    if (isLive() && epgExpired(now)) loadEpg();
  }

  /** App Android: riproduce con ExoPlayer a schermo intero, poi salva la ripresa e torna indietro. */
  function playNative(params) {
    var index = state.index;
    var from = Math.max(0, index - NATIVE_WINDOW);
    var slice = state.playlist.slice(from, Math.min(state.playlist.length, index + NATIVE_WINDOW + 1));
    var startIndex = index - from;
    renderInfo();
    setStatus('buffering');
    Platform.plugin('NativePlayer').play({
      items: slice.map(function (it) { return { url: App.streamUrl(it), title: it.name }; }),
      index: startIndex,
      startAt: params.startAt || 0,
      live: item().type === 'live',
      swipe: !!App.settings.playerSwipe
    }).then(function (result) {
      // Episodi visti per intero mentre la playlist avanzava da sola: niente più ripresa.
      for (var i = startIndex; i < result.index && i < slice.length; i++) {
        if (slice[i].type !== 'live') Storage.setResume(resumeKey(slice[i]), 0, 0);
      }
      var last = slice[result.index];
      if (last && last.type !== 'live' && result.duration) {
        Storage.setResume(resumeKey(last), result.position, result.duration, snapshot(last));
      }
      if (App.current() === screen) App.back();
    }, function (err) {
      UI.toast('Errore del lettore: ' + err.message);
      if (App.current() === screen) App.back();
    });
  }

  var screen = {
    el: el,
    item: item,
    onPointerMove: function () { showOverlay(state.status !== 'playing'); },
    enter: function (params) {
      state.playlist = params.playlist || [];
      state.index = params.index || 0;
      state.digits = '';
      if (Platform.isAndroidApp) {
        playNative(params);
        return;
      }
      // Se il canale scelto è quello del riquadro, lo si allarga senza riaprire lo stream.
      var miniItem = MiniPlayer.item();
      var same = miniItem && item() && miniItem.type === item().type && miniItem.id === item().id;
      MiniPlayer.detach();
      MiniPlayer.onChange();
      rootEl.classList.add('playing');
      Player.onEvent = onPlayerEvent;
      if (same) {
        renderInfo();
        setStatus('playing');
        loadEpg();
        rememberChannel(item());
        addAlternateFeeds(item());
      } else {
        start(params.startAt || 0);
      }
      clearInterval(state.ticker);
      state.ticker = setInterval(tick, 1000);
    },
    leave: function () {
      // Un canale live già partito resta nel riquadro; il cambio canale in corso (zapping) no.
      var toMini = state.toMini && Player.url && state.status !== 'error';
      state.toMini = false;
      saveResume();
      if (!toMini) {
        Player.stop();
        Watching.update(null);
      }
      clearInterval(state.ticker);
      clearTimeout(state.zapTimer);
      clearTimeout(state.overlayTimer);
      clearTimeout(state.digitTimer);
      state.epgToken++;
      digitsEl.classList.remove('visible');
      el.classList.remove('overlay-visible');
      if (toMini) MiniPlayer.open();
      else rootEl.classList.remove('playing');
    },
    handleKey: function (action, key) {
      var live = isLive();
      switch (action) {
        case 'back':
          state.toMini = live && !Platform.isAndroidApp && !rootEl.classList.contains('mobile');
          App.back();
          return true;
        case 'stop':
          App.back();
          return true;
        case 'enter':
          if (state.status === 'error') reload();
          else if (!live && el.classList.contains('overlay-visible')) Player.togglePause();
          else showOverlay(false);
          return true;
        case 'playpause':
        case 'play':
        case 'pause':
          if (!live) Player.togglePause();
          return true;
        case 'up':
        case 'chup':
          if (live) zap(1);
          else showOverlay(false);
          return true;
        case 'down':
        case 'chdown':
          if (live) zap(-1);
          else showOverlay(false);
          return true;
        case 'left':
        case 'right':
        case 'ff':
        case 'rw':
          if (!live) {
            var step = action === 'left' ? -10 : action === 'right' ? 30 : action === 'ff' ? 60 : -60;
            Player.seek(step);
          }
          showOverlay(false);
          return true;
        case 'digit':
          if (live) typeDigit(key.digit);
          return true;
        case 'green':
          if (live) goToPreviousChannel();
          return true;
        case 'yellow':
          reload();
          return true;
        case 'blue':
          if (live && Player.alternateCount()) {
            state.retryMessage = 'Feed alternativo: ' + Player.nextSource();
            setStatus('buffering', state.retryMessage);
          } else {
            UI.toast('Nessun altro feed per questo canale');
          }
          return true;
        case 'red':
          var it = item();
          if (it.type === 'episode') return true;
          var added = Storage.toggleFavorite(it);
          UI.toast(added ? 'Aggiunto ai preferiti' : 'Rimosso dai preferiti');
          renderInfo();
          showOverlay(false);
          return true;
      }
      return true;
    }
  };

  App.register('player', screen);
  root.MiniPlayer = MiniPlayer;
})(this);
