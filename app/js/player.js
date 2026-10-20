/*
 * Motore di riproduzione.
 * Sulla TV usa Samsung AVPlay (supporta MPEG-TS, HLS, MKV, ecc.).
 * Nel browser usa <video> HTML5; per MPEG-TS e HLS, che i browser non leggono da soli,
 * carica da CDN mpegts.js o hls.js solo al primo utilizzo (sulla TV non vengono mai scaricati).
 *
 * Eventi (Player.onEvent(type, data)): 'buffering', 'playing', 'paused', 'ended', 'error',
 * 'retrying' ({attempt, max, label, switched}).
 *
 * Recupero automatico: uno stream che dà errore, resta in caricamento o ha l'immagine ferma viene riaperto
 * con pause crescenti; dal secondo tentativo si passa ai feed alternativi (setAlternates), se ce ne sono.
 * 'error' arriva solo quando tutti i tentativi sono falliti.
 */
(function (root) {
  'use strict';

  var avplay = Platform.isTV ? root.webapis.avplay : null;

  // Togliamo la superficie non usata: sulla TV il <video> nero a tutto schermo coprirebbe il piano di AVPlay.
  var unused = root.document.getElementById(avplay ? 'html5-player' : 'av-player');
  if (unused) unused.parentNode.removeChild(unused);

  var LIBRARIES = {
    hls: { url: 'https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js', global: 'Hls' },
    mpegts: { url: 'https://cdn.jsdelivr.net/npm/mpegts.js@1.8.2/dist/mpegts.js', global: 'mpegts' }
  };
  var libraryPromises = {};
  var windowRect = null; // [x, y, larghezza, altezza] nel layout 1920x1080; null = schermo intero
  var engine = null; // istanza hls.js / mpegts.js attiva nel browser
  var WEB_ERROR = 'Impossibile riprodurre nel browser: il server potrebbe bloccare le richieste dal web ' +
    'o lo stream non è compatibile. Sulla TV dovrebbe funzionare.';

  var OPEN_MS = 12000; // apertura dello stream
  var BUFFERING_MS = 8000; // caricamento a metà visione che non finisce (dirette)
  var STALL_MS = 5000; // immagine ferma: il tempo non avanza e il player non dice nulla (dirette)
  var VOD_BUFFERING_MS = 30000; // film e serie: server lenti o salti avanti caricano più a lungo, riaprire peggiora
  var VOD_STALL_MS = 15000;
  var STABLE_MS = 30000; // dopo tanto di visione regolare i tentativi ripartono da zero
  var JANK_GAP_MS = 2500; // buco tra due controlli: il browser era occupato (liste enormi, immagini), non lo stream
  var SLEEP_GAP_MS = 20000; // buco molto più lungo: la TV era in standby
  var SHORT_HIDE_MS = 20000; // app nascosta meno di così (barra volume, notifiche): lo stream si riprende com'è
  var RETRY_DELAYS = [300, 1000, 2000, 4000, 8000, 15000];

  var sources = []; // [{url, label}]: il contenuto scelto e i suoi feed alternativi
  var sourceIndex = 0;
  var attempt = 0;
  var session = 0; // cresce a ogni apertura: le risposte di un'apertura precedente vengono ignorate
  var retryTimer = null;
  var suspended = false;
  var isLive = false;
  var watch = {};
  var suspendedAt = 0;
  var history = []; // ultimi riavvii dello stream e il loro motivo (Impostazioni > diagnosi)

  function note(text) {
    history.push({ at: Date.now(), text: text });
    if (history.length > 30) history.shift();
    try { root.console.log('[player] ' + text); } catch (e) { /* console assente */ }
  }

  var Player = {
    onEvent: function () {},
    history: function () { return history.slice(); },
    url: null,
    paused: false,

    /**
     * @param {number} [startAt] secondi da cui partire
     * @param {boolean} [live] diretta: si riapre dal vivo e la fine dello stream è un'interruzione da recuperare
     */
    play: function (url, startAt, live) {
      this.stop();
      sources = [{ url: url, label: '' }];
      isLive = !!live;
      openSource(startAt || 0);
    },

    /** Feed alternativi del contenuto appena avviato ([{url, label}]), usati se lo stream si blocca. */
    setAlternates: function (list) {
      if (sources.length && sourceIndex === 0) sources = sources.slice(0, 1).concat(list);
    },

    /** Nome del feed alternativo in uso ('' se è quello scelto dall'utente). */
    sourceLabel: function () {
      return sourceIndex > 0 && sources[sourceIndex] ? sources[sourceIndex].label : '';
    },

    alternateCount: function () {
      return Math.max(0, sources.length - 1);
    },

    /** Riapre subito lo stream (tasto di ricarica o dopo che i tentativi sono finiti). */
    reload: function () {
      if (!sources.length) return;
      note('ricarica manuale');
      attempt = 0;
      openSource(resumePoint());
    },

    /** Passa al feed successivo; restituisce la sua etichetta, o null se non ci sono alternative. */
    nextSource: function () {
      if (sources.length < 2) return null;
      sourceIndex = (sourceIndex + 1) % sources.length;
      attempt = 0;
      openSource(resumePoint());
      return sources[sourceIndex].label;
    },

    stop: function () {
      this.url = null;
      sources = [];
      sourceIndex = 0;
      attempt = 0;
      session++;
      clearTimeout(retryTimer);
      retryTimer = null;
      closeEngine();
    },

    togglePause: function () {
      if (!this.url) return;
      if (this.paused) this.resume();
      else this.pause();
    },

    pause: function () {
      try {
        if (avplay) avplay.pause();
        else html5().pause();
        this.paused = true;
        emit('paused');
      } catch (e) { /* non in riproduzione */ }
    },

    resume: function () {
      try {
        if (avplay) avplay.play();
        else html5().play();
        this.paused = false;
        watch.lastProgress = Date.now();
        emit('playing');
      } catch (e) { /* non in pausa */ }
    },

    /** Spostamento relativo in secondi (positivo = avanti). */
    seek: function (deltaSeconds) {
      var duration = this.duration();
      if (!duration) return;
      var target = Math.max(0, Math.min(duration - 1, this.currentTime() + deltaSeconds));
      if (avplay) {
        try { avplay.seekTo(Math.floor(target * 1000)); } catch (e) { /* seek non supportato */ }
      } else {
        html5().currentTime = target;
      }
    },

    /** Secondi trascorsi. */
    currentTime: function () {
      try {
        return avplay ? avplay.getCurrentTime() / 1000 : html5().currentTime || 0;
      } catch (e) {
        return 0;
      }
    },

    /** Durata in secondi (0 per le dirette). */
    duration: function () {
      try {
        var d = avplay ? avplay.getDuration() / 1000 : html5().duration;
        return isFinite(d) && d > 0 ? d : 0;
      } catch (e) {
        return 0;
      }
    },

    /** Riduce il video a un riquadro ([x, y, larghezza, altezza] nel layout 1920x1080) o, con null, a tutto schermo. */
    setWindow: function (rect) {
      windowRect = rect;
      if (avplay) {
        try { applyAvplayWindow(); } catch (e) { /* player non aperto: vale dal prossimo open */ }
        return;
      }
      // Nel browser il layout è scalato e centrato: il <video> va posizionato in pixel della pagina.
      var style = html5().style;
      if (!rect) {
        style.left = style.top = style.width = style.height = '';
        return;
      }
      var app = root.document.getElementById('app').getBoundingClientRect();
      var scale = Nav.scale || 1;
      style.left = (app.left + rect[0] * scale) + 'px';
      style.top = (app.top + rect[1] * scale) + 'px';
      style.width = (rect[2] * scale) + 'px';
      style.height = (rect[3] * scale) + 'px';
    },

    /** Da chiamare quando l'app va in background / torna in primo piano. */
    suspend: function () {
      if (!suspended) suspendedAt = Date.now();
      suspended = true;
      if (avplay && this.url) {
        try { avplay.suspend(); } catch (e) { /* ignorato */ }
      } else if (!avplay) {
        html5().pause();
      }
    },

    restore: function () {
      var hiddenFor = Date.now() - suspendedAt;
      suspended = false;
      if (!this.url || !sources.length) return;
      if (isLive && hiddenFor > SHORT_HIDE_MS) {
        // Dopo standby o una lunga sospensione lo stream ripreso è vecchio o bloccato: la diretta si riapre dal vivo.
        note('riapro la diretta dopo ' + Math.round(hiddenFor / 1000) + ' s in background');
        attempt = 0;
        openSource(0);
        return;
      }
      // Sospensione breve (barra del volume, notifica): niente riapertura, se ne occupa il controllo di salute.
      watch.lastProgress = Date.now();
      if (watch.bufferingSince) watch.bufferingSince = Date.now();
      if (avplay) {
        try {
          avplay.restore();
        } catch (e) {
          note('restore non riuscito, riapro');
          openSource(resumePoint());
        }
      } else if (!this.paused) {
        html5().play();
      }
    }
  };

  function emit(type, data) {
    Player.onEvent(type, data);
  }

  function closeEngine() {
    if (avplay) {
      try {
        if (avplay.getState() !== 'NONE') {
          avplay.stop();
          avplay.close();
        }
      } catch (e) { /* già chiuso */ }
    } else {
      destroyEngine();
      var video = html5();
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }

  /** Apre il feed corrente (sources[sourceIndex]) da capo. */
  function openSource(startAt) {
    clearTimeout(retryTimer);
    retryTimer = null;
    closeEngine();
    var id = ++session;
    var url = sources[sourceIndex].url;
    var now = Date.now();
    Player.url = url;
    Player.paused = false;
    watch = { openedAt: now, prepared: false, bufferingSince: 0, lastTime: null, lastProgress: now, advanced: false, startAt: startAt };
    emit('buffering');
    if (avplay) playAvplay(url, startAt, id);
    else playHtml5(url, startAt, id);
  }

  /** Per film ed episodi si riparte dal punto raggiunto; le dirette ripartono dal vivo. */
  function resumePoint() {
    return isLive ? 0 : watch.lastTime || watch.startAt || 0;
  }

  function onPrepared() {
    watch.prepared = true;
    watch.bufferingSince = 0;
    watch.lastProgress = Date.now();
  }

  function onBuffering(start) {
    if (start) {
      watch.bufferingSince = watch.bufferingSince || Date.now();
    } else {
      watch.bufferingSince = 0;
      watch.lastProgress = Date.now();
    }
  }

  /** Lo stream non va: si riprova dopo una pausa crescente, poi si passa ai feed alternativi, infine ci si arrende. */
  function fail(message) {
    if (!sources.length || retryTimer || watch.failed) return;
    session++; // le risposte in arrivo dall'apertura fallita non contano più
    if (attempt >= RETRY_DELAYS.length) {
      giveUp(message);
      return;
    }
    note('stream riavviato (tentativo ' + (attempt + 1) + '): ' + message);
    var resumeAt = resumePoint();
    var delay = RETRY_DELAYS[attempt];
    attempt++;
    // Il primo tentativo riprova lo stesso feed (spesso basta), i successivi cambiano feed.
    var switched = attempt > 1 && sources.length > 1;
    if (switched) sourceIndex = (sourceIndex + 1) % sources.length;
    closeEngine();
    emit('retrying', { attempt: attempt, max: RETRY_DELAYS.length, label: sources[sourceIndex].label, switched: switched });
    retryTimer = setTimeout(function () {
      retryTimer = null;
      if (sources.length) openSource(resumeAt);
    }, delay);
  }

  /** Fine dei tentativi: resta il messaggio d'errore; reload() riparte da capo. */
  function giveUp(message) {
    session++;
    watch.failed = true;
    closeEngine();
    emit('error', message);
  }

  /** Controllo ogni secondo: si accorge degli stream bloccati anche quando il player non segnala errori. */
  var lastTick = Date.now();

  function checkHealth() {
    var tick = Date.now();
    var gap = tick - lastTick;
    lastTick = tick;
    // Il timer si ferma con la TV in standby anche senza visibilitychange: al risveglio si ricarica la diretta.
    if (gap > SLEEP_GAP_MS && Player.url && isLive && !suspended && !Player.paused) {
      suspendedAt = tick - gap;
      Player.restore();
      return;
    }
    // Il browser non ha girato per qualche secondo (elenchi grandi da leggere, immagini): lo stream non c'entra,
    // i tempi di attesa ripartono invece di scambiare il rallentamento per un blocco.
    if (gap > JANK_GAP_MS) {
      note('pausa del browser di ' + Math.round(gap / 100) / 10 + ' s: attese azzerate');
      watch.lastProgress = tick;
      if (watch.bufferingSince) watch.bufferingSince = tick;
    }
    if (!sources.length || retryTimer || watch.failed || Player.paused || suspended) return;
    var now = Date.now();
    var time = Player.currentTime();
    if (time > 0 && time !== watch.lastTime) {
      if (watch.lastTime !== null) watch.advanced = true;
      watch.lastTime = time;
      watch.lastProgress = now;
      // Il video avanza: un 'caricamento' rimasto aperto (evento di fine perso) non è un blocco.
      if (watch.prepared) watch.bufferingSince = 0;
    }
    var bufferingMs = isLive ? BUFFERING_MS : VOD_BUFFERING_MS;
    var stallMs = isLive ? STALL_MS : VOD_STALL_MS;
    if (watch.advanced && attempt && now - watch.openedAt > STABLE_MS) attempt = 0;
    if (!watch.prepared) {
      if (now - watch.openedAt > OPEN_MS) fail('Il canale non risponde');
    } else if (watch.bufferingSince) {
      if (now - watch.bufferingSince > bufferingMs) fail('Il server non manda più il video');
    } else if (watch.advanced && now - watch.lastProgress > stallMs) {
      // Solo se il tempo è già avanzato una volta: alcuni firmware non lo aggiornano per le dirette.
      fail('Il server non manda più il video');
    }
  }
  setInterval(checkHealth, 1000);

  /** Fine dello stream: per i film è la fine vera, per una diretta vuol dire che il server l'ha chiusa. */
  function onEnded() {
    if (!isLive) {
      session++;
      sources = [];
      emit('ended');
    } else {
      fail('La diretta si è interrotta');
    }
  }

  function html5() {
    return root.document.getElementById('html5-player');
  }

  // Nel browser la scala del layout cambia con la finestra: il riquadro va ricalcolato (dopo fitToWindow).
  root.addEventListener('resize', function () {
    if (!avplay && windowRect) setTimeout(function () { Player.setWindow(windowRect); }, 0);
  });

  /**
   * Sulle TV UHD con Tizen 3.0 (2017) setDisplayRect raddoppia la posizione ma non le dimensioni:
   * (480, 270, 960, 540) finisce in basso a destra invece che al centro. Lì la posizione va dimezzata.
   */
  var avplayPositionFactor = (function () {
    if (!/Tizen 3\./.test(root.navigator.userAgent)) return 1;
    var uhd = true; // se l'API non risponde si assume UHD (caso verificato: UE49MU6500)
    try { uhd = root.webapis.productinfo.isUdPanelSupported() !== false; } catch (e) { /* API assente */ }
    return uhd ? 0.5 : 1;
  })();

  function applyAvplayWindow() {
    var r = windowRect || [0, 0, 1920, 1080];
    avplay.setDisplayRect(Math.round(r[0] * avplayPositionFactor), Math.round(r[1] * avplayPositionFactor), r[2], r[3]);
  }

  function playAvplay(url, startAt, id) {
    function current() { return id === session; } // false se nel frattempo si è riaperto o scelto altro
    try {
      avplay.open(url);
      applyAvplayWindow();
      try { avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (e) { /* firmware vecchi */ }
      avplay.setListener({
        onbufferingstart: function () {
          if (!current()) return;
          onBuffering(true);
          emit('buffering');
        },
        onbufferingcomplete: function () {
          if (!current()) return;
          onBuffering(false);
          if (!Player.paused) emit('playing');
        },
        onstreamcompleted: function () { if (current()) onEnded(); },
        onerror: function (error) { if (current()) fail('Errore di riproduzione (' + error + ')'); }
      });
      avplay.prepareAsync(function () {
        if (!current()) return;
        if (startAt) {
          try { avplay.seekTo(Math.floor(startAt * 1000)); } catch (e) { /* stream non ricercabile */ }
        }
        avplay.play();
        onPrepared();
        emit('playing');
      }, function (error) {
        if (current()) fail('Impossibile aprire lo stream (' + error + ')');
      });
    } catch (e) {
      fail('Impossibile avviare il player: ' + e.message);
    }
  }

  function loadLibrary(name) {
    var lib = LIBRARIES[name];
    if (root[lib.global]) return Promise.resolve(root[lib.global]);
    if (!libraryPromises[name]) {
      libraryPromises[name] = new Promise(function (resolve, reject) {
        var script = root.document.createElement('script');
        script.src = lib.url;
        script.onload = function () { resolve(root[lib.global]); };
        script.onerror = function () {
          delete libraryPromises[name];
          reject(new Error('Impossibile scaricare il lettore video (' + name + ')'));
        };
        root.document.head.appendChild(script);
      });
    }
    return libraryPromises[name];
  }

  function destroyEngine() {
    if (!engine) return;
    try { engine.destroy(); } catch (e) { /* già distrutto */ }
    engine = null;
  }

  function extensionOf(url) {
    var match = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(url);
    return match ? match[1].toLowerCase() : '';
  }

  function playHtml5(url, startAt, id) {
    function current() { return id === session; }
    var video = html5();
    video.onwaiting = function () {
      if (!current()) return;
      onBuffering(true);
      emit('buffering');
    };
    video.onplaying = function () {
      if (!current()) return;
      if (watch.prepared) onBuffering(false);
      else onPrepared();
      emit('playing');
    };
    video.onended = function () { if (current()) onEnded(); };
    video.onerror = function () { if (current()) fail(WEB_ERROR); };
    video.onloadedmetadata = function () {
      if (startAt) video.currentTime = startAt;
    };

    var ext = extensionOf(url);
    var needsHls = ext === 'm3u8' && !video.canPlayType('application/vnd.apple.mpegurl');
    if (ext !== 'ts' && !needsHls) {
      video.src = url;
      startVideo(video);
      return;
    }
    loadLibrary(ext === 'ts' ? 'mpegts' : 'hls').then(function (lib) {
      if (!current()) return; // nel frattempo è stato scelto un altro contenuto
      if (ext === 'ts') playWithMpegts(lib, video, url, current);
      else playWithHls(lib, video, url, current);
    }, function (err) {
      if (current()) fail(err.message);
    });
  }

  function playWithMpegts(mpegts, video, url, current) {
    if (!mpegts.isSupported()) {
      giveUp('Questo browser non supporta MPEG-TS: prova il formato HLS nelle impostazioni');
      return;
    }
    engine = mpegts.createPlayer({ type: 'mpegts', isLive: true, url: url }, {
      enableStashBuffer: false, liveBufferLatencyChasing: true
    });
    engine.on(mpegts.Events.ERROR, function () { if (current()) fail(WEB_ERROR); });
    engine.attachMediaElement(video);
    engine.load();
    startVideo(video);
  }

  function playWithHls(Hls, video, url, current) {
    if (!Hls.isSupported()) {
      giveUp('Questo browser non supporta HLS');
      return;
    }
    engine = new Hls();
    engine.on(Hls.Events.ERROR, function (event, data) {
      if (data && data.fatal && current()) fail(WEB_ERROR);
    });
    engine.loadSource(url);
    engine.attachMedia(video);
    startVideo(video);
  }

  function startVideo(video) {
    var started = video.play();
    if (started && started.catch) started.catch(function () { /* errore gestito da onerror / engine */ });
  }

  root.Player = Player;
})(this);
