/*
 * Telecamere di Home Assistant: schermata a tutto schermo (stream MJPEG) e riquadro in alto a destra
 * che compare quando scatta un sensore di movimento mentre si guarda un canale.
 *
 * Schermo intero: ◀/▶ cambiano telecamera, INDIETRO torna indietro.
 * Riquadro: OK lo porta a schermo intero, INDIETRO lo chiude; si chiude da solo dopo POPUP_MS.
 */
(function (root) {
  'use strict';

  var POPUP_MS = 30000;
  var POPUP_REFRESH_MS = 2000;

  var el = root.document.getElementById('screen-camera');
  var imgEl = el.querySelector('.camera-full');
  var titleEl = el.querySelector('.camera-title');
  var statusEl = el.querySelector('.camera-status');

  var state = { list: [], index: 0, backToPlayer: false };

  function show() {
    var camera = state.list[state.index];
    titleEl.textContent = camera ? camera.name + (state.list.length > 1 ? '  ·  ' + (state.index + 1) + '/' + state.list.length : '') : '';
    var url = camera ? Home.cameraUrl(camera, true) : '';
    statusEl.textContent = url ? 'Caricamento…' : 'Immagine non disponibile';
    imgEl.style.visibility = 'hidden';
    imgEl.removeAttribute('src');
    if (url) imgEl.src = url;
  }

  imgEl.onload = function () {
    statusEl.textContent = '';
    imgEl.style.visibility = 'visible';
  };
  imgEl.onerror = function () {
    if (imgEl.getAttribute('src')) statusEl.textContent = 'Telecamera non raggiungibile';
  };

  App.register('camera', {
    el: el,
    enter: function (params) {
      state.list = params.list || (params.camera ? [params.camera] : []);
      // Si cerca per id: dopo una lettura degli stati gli oggetti sono nuovi.
      state.index = 0;
      state.list.forEach(function (c, i) {
        if (params.camera && c.id === params.camera.id) state.index = i;
      });
      // Se un canale è nel riquadro in basso a sinistra, resta visibile (lo spazio è libero in style.css).
      MiniPlayer.setSide('left');
      el.classList.toggle('mini-active', MiniPlayer.active);
      state.backToPlayer = !!params.backToPlayer;
      HomePopup.hide();
      show();
    },
    leave: function () {
      imgEl.removeAttribute('src'); // chiude lo stream
      // Aperta dal canale a schermo intero: chiudendola si torna al canale a schermo intero.
      if (state.backToPlayer) {
        state.backToPlayer = false;
        setTimeout(function () {
          if (MiniPlayer.active && App.current() === App.screens.browse) MiniPlayer.expand();
        }, 0);
      }
    },
    handleKey: function (action) {
      if ((action === 'left' || action === 'right') && state.list.length > 1) {
        state.index = (state.index + (action === 'left' ? -1 : 1) + state.list.length) % state.list.length;
        show();
        return true;
      }
      if (action === 'up' || action === 'down' || action === 'enter') return true;
      return false;
    }
  });

  // ---------- Riquadro movimento ----------

  var popupEl = root.document.getElementById('home-popup');
  var popupImg = popupEl.querySelector('img');
  var popupName = popupEl.querySelector('.home-popup-name');
  var popupTimer = null;
  var stopImage = null;
  var popupCamera = null;

  var HomePopup = {
    visible: function () {
      return !!popupCamera;
    },

    /** @param {boolean} [force] mostra comunque (pulsante di prova nelle Impostazioni) */
    show: function (camera, force) {
      // Solo mentre si guarda un canale (a schermo intero o nel riquadro della lista).
      var watching = App.current() === App.screens.player || (App.current() === App.screens.browse && MiniPlayer.active);
      if (!force && !Home.config().popup) {
        Home.status.note = 'ignorato: riquadro disattivato nelle Impostazioni';
        return;
      }
      if (!force && !watching) {
        Home.status.note = 'ignorato: non stavi guardando un canale';
        return;
      }
      Home.status.note = 'riquadro mostrato: ' + camera.name;
      popupCamera = camera;
      popupName.textContent = camera.name + '  ·  OK per ingrandire';
      popupEl.classList.add('visible');
      if (stopImage) stopImage();
      var failures = 0;
      stopImage = UI.liveImage(popupImg, function () { return popupCamera ? Home.cameraUrl(popupCamera, false) : ''; },
        POPUP_REFRESH_MS, function (ok) {
          failures = ok ? 0 : failures + 1;
          popupEl.classList.toggle('no-image', !ok && !popupImg.getAttribute('src'));
          if (!ok) {
            Home.status.note = 'immagine della telecamera non caricata';
            // Il token dell'immagine ruota: dopo un errore si rileggono gli stati per averne uno nuovo.
            if (failures === 1) Home.loadStates().then(null, function () { /* si riprova al prossimo giro */ });
          }
        });
      clearTimeout(popupTimer);
      popupTimer = setTimeout(HomePopup.hide, POPUP_MS);
    },

    hide: function () {
      popupCamera = null;
      if (stopImage) stopImage();
      stopImage = null;
      clearTimeout(popupTimer);
      popupEl.classList.remove('visible', 'no-image');
      popupImg.removeAttribute('src');
    },

    /** Con il riquadro aperto, OK lo ingrandisce e INDIETRO lo chiude; gli altri tasti restano al player. */
    handleKey: function (action) {
      if (!popupCamera) return false;
      if (action === 'enter') {
        var camera = popupCamera;
        HomePopup.hide();
        var fromPlayer = App.current() === App.screens.player && MiniPlayer.minimize(); // il canale passa nel riquadro
        var others = ((Home.data && Home.data.cameras) || []).filter(function (c) { return c.id !== camera.id; });
        App.show('camera', { camera: camera, list: [camera].concat(others), backToPlayer: fromPlayer });
        return true;
      }
      if (action === 'back') {
        HomePopup.hide();
        return true;
      }
      return false;
    }
  };

  Home.onMotion = function (camera) { HomePopup.show(camera); };
  root.HomePopup = HomePopup;
})(this);
