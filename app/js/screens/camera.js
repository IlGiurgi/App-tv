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

  var state = { list: [], index: 0 };

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
      state.index = Math.max(0, state.list.indexOf(params.camera));
      HomePopup.hide();
      show();
    },
    leave: function () {
      imgEl.removeAttribute('src'); // chiude lo stream
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
  var refreshTimer = null;
  var popupCamera = null;

  function refreshPopup() {
    var url = Home.cameraUrl(popupCamera, false);
    if (url) popupImg.src = url + (url.indexOf('?') === -1 ? '?' : '&') + '_=' + Date.now();
  }

  var HomePopup = {
    visible: function () {
      return !!popupCamera;
    },

    show: function (camera) {
      // Solo mentre si guarda un canale (a schermo intero o nel riquadro della lista).
      var watching = App.current() === App.screens.player || (App.current() === App.screens.browse && MiniPlayer.active);
      if (!watching) return;
      popupCamera = camera;
      popupName.textContent = camera.name + '  ·  OK per ingrandire';
      popupEl.classList.add('visible');
      refreshPopup();
      clearInterval(refreshTimer);
      refreshTimer = setInterval(refreshPopup, POPUP_REFRESH_MS);
      clearTimeout(popupTimer);
      popupTimer = setTimeout(HomePopup.hide, POPUP_MS);
    },

    hide: function () {
      popupCamera = null;
      clearInterval(refreshTimer);
      clearTimeout(popupTimer);
      popupEl.classList.remove('visible');
      popupImg.removeAttribute('src');
    },

    /** Con il riquadro aperto, OK lo ingrandisce e INDIETRO lo chiude; gli altri tasti restano al player. */
    handleKey: function (action) {
      if (!popupCamera) return false;
      if (action === 'enter') {
        var camera = popupCamera;
        HomePopup.hide();
        App.show('camera', { camera: camera, list: (Home.data && Home.data.cameras) || [camera] });
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
