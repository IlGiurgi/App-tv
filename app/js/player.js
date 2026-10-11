/*
 * Motore di riproduzione.
 * Sulla TV usa Samsung AVPlay (supporta MPEG-TS, HLS, MKV, ecc.).
 * Nel browser usa <video> HTML5; per MPEG-TS e HLS, che i browser non leggono da soli,
 * carica da CDN mpegts.js o hls.js solo al primo utilizzo (sulla TV non vengono mai scaricati).
 *
 * Eventi (Player.onEvent(type, data)): 'buffering', 'playing', 'paused', 'ended', 'error'.
 */
(function (root) {
  'use strict';

  var avplay = root.webapis && root.webapis.avplay;

  var LIBRARIES = {
    hls: { url: 'https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js', global: 'Hls' },
    mpegts: { url: 'https://cdn.jsdelivr.net/npm/mpegts.js@1.8.2/dist/mpegts.js', global: 'mpegts' }
  };
  var libraryPromises = {};
  var engine = null; // istanza hls.js / mpegts.js attiva nel browser
  var WEB_ERROR = 'Impossibile riprodurre nel browser: il server potrebbe bloccare le richieste dal web ' +
    'o lo stream non è compatibile. Sulla TV dovrebbe funzionare.';

  var Player = {
    onEvent: function () {},
    url: null,
    paused: false,

    isNative: function () { return !!avplay; },

    /** @param {number} [startAt] secondi da cui partire */
    play: function (url, startAt) {
      this.stop();
      this.url = url;
      this.paused = false;
      emit('buffering');
      if (avplay) playAvplay(url, startAt || 0);
      else playHtml5(url, startAt || 0);
    },

    stop: function () {
      this.url = null;
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

    /** Da chiamare quando l'app va in background / torna in primo piano. */
    suspend: function () {
      if (avplay && this.url) {
        try { avplay.suspend(); } catch (e) { /* ignorato */ }
      } else if (!avplay) {
        html5().pause();
      }
    },

    restore: function () {
      if (!this.url) return;
      if (avplay) {
        try {
          avplay.restore();
        } catch (e) {
          this.play(this.url, this.currentTime());
        }
      } else if (!this.paused) {
        html5().play();
      }
    }
  };

  function emit(type, data) {
    Player.onEvent(type, data);
  }

  function html5() {
    return root.document.getElementById('html5-player');
  }

  function playAvplay(url, startAt) {
    try {
      avplay.open(url);
      avplay.setDisplayRect(0, 0, 1920, 1080);
      try { avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (e) { /* firmware vecchi */ }
      avplay.setListener({
        onbufferingstart: function () { emit('buffering'); },
        onbufferingcomplete: function () { if (!Player.paused) emit('playing'); },
        onstreamcompleted: function () { emit('ended'); },
        onerror: function (error) { emit('error', 'Errore di riproduzione (' + error + ')'); }
      });
      avplay.prepareAsync(function () {
        if (Player.url !== url) return; // nel frattempo è stato scelto un altro contenuto
        if (startAt) {
          try { avplay.seekTo(Math.floor(startAt * 1000)); } catch (e) { /* stream non ricercabile */ }
        }
        avplay.play();
        emit('playing');
      }, function (error) {
        if (Player.url === url) emit('error', 'Impossibile aprire lo stream (' + error + ')');
      });
    } catch (e) {
      emit('error', 'Impossibile avviare il player: ' + e.message);
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

  function playHtml5(url, startAt) {
    var video = html5();
    video.onwaiting = function () { emit('buffering'); };
    video.onplaying = function () { emit('playing'); };
    video.onended = function () { emit('ended'); };
    video.onerror = function () { emit('error', WEB_ERROR); };
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
      if (Player.url !== url) return; // nel frattempo è stato scelto un altro contenuto
      if (ext === 'ts') playWithMpegts(lib, video, url);
      else playWithHls(lib, video, url);
    }, function (err) {
      if (Player.url === url) emit('error', err.message);
    });
  }

  function playWithMpegts(mpegts, video, url) {
    if (!mpegts.isSupported()) {
      emit('error', 'Questo browser non supporta MPEG-TS: prova il formato HLS nelle impostazioni');
      return;
    }
    engine = mpegts.createPlayer({ type: 'mpegts', isLive: true, url: url }, {
      enableStashBuffer: false, liveBufferLatencyChasing: true
    });
    engine.on(mpegts.Events.ERROR, function () { emit('error', WEB_ERROR); });
    engine.attachMediaElement(video);
    engine.load();
    startVideo(video);
  }

  function playWithHls(Hls, video, url) {
    if (!Hls.isSupported()) {
      emit('error', 'Questo browser non supporta HLS');
      return;
    }
    engine = new Hls();
    engine.on(Hls.Events.ERROR, function (event, data) {
      if (data && data.fatal) emit('error', WEB_ERROR);
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
