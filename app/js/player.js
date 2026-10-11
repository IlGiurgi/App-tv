/*
 * Motore di riproduzione.
 * Sulla TV usa Samsung AVPlay (supporta MPEG-TS, HLS, MKV, ecc.); nel browser usa <video> HTML5.
 *
 * Eventi (Player.onEvent(type, data)): 'buffering', 'playing', 'paused', 'ended', 'error'.
 */
(function (root) {
  'use strict';

  var avplay = root.webapis && root.webapis.avplay;

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

  function playHtml5(url, startAt) {
    var video = html5();
    video.onwaiting = function () { emit('buffering'); };
    video.onplaying = function () { emit('playing'); };
    video.onended = function () { emit('ended'); };
    video.onerror = function () { emit('error', 'Formato non supportato dal browser: prova sulla TV'); };
    video.onloadedmetadata = function () {
      if (startAt) video.currentTime = startAt;
    };
    video.src = url;
    var started = video.play();
    if (started && started.catch) started.catch(function () { /* errore già gestito da onerror */ });
  }

  root.Player = Player;
})(this);
