/*
 * Salvaschermo: se si resta fermi sui menu per qualche minuto compare un fondo scuro con ora, data e,
 * se Home Assistant è collegato, meteo e temperature di casa. Qualsiasi tasto lo chiude.
 * Mai durante un canale o un film, né sul telefono.
 */
(function (root) {
  'use strict';

  var h = UI.h;
  var CHECK_MS = 15000;
  var CLOCK_MS = 10000;
  var HOME_MS = 5 * 60000;
  var MAX_ROOMS = 3;
  // Il blocco di testo cambia posto a ogni minuto, per non lasciare un'impronta fissa sullo schermo.
  var SPOTS = [[180, 150], [260, 280], [140, 220], [300, 120]];

  var timeEl = h('div.ss-time');
  var dateEl = h('div.ss-date');
  var weatherEl = h('div.ss-weather');
  var roomsEl = h('div.ss-rooms');
  var boxEl = h('div.ss-box', {}, [timeEl, dateEl, weatherEl, roomsEl]);
  var lastEl = h('span.ss-last');
  var el = h('div', { id: 'screensaver' }, [
    h('div.ss-glow'),
    boxEl,
    h('div.ss-foot', {}, [lastEl, h('span', { text: 'Premi un tasto per tornare' })])
  ]);
  root.document.getElementById('app').appendChild(el);

  var lastActivity = Date.now();
  var visible = false;
  var clockTimer = null;
  var homeTimer = null;

  function minutes() {
    return root.App && App.settings ? App.settings.screensaverMin : 5;
  }

  function mayShow() {
    var html = root.document.documentElement;
    return !html.classList.contains('mobile') && !html.classList.contains('playing') &&
      (App.current() === App.screens.browse || App.current() === App.screens.launcher) &&
      !(root.MiniPlayer && MiniPlayer.item());
  }

  function paintClock() {
    var now = new Date();
    timeEl.textContent = UI.formatClock(now.getTime());
    dateEl.textContent = UI.formatDay(now.getTime());
    var spot = SPOTS[now.getMinutes() % SPOTS.length];
    boxEl.style.left = spot[0] + 'px';
    boxEl.style.top = spot[1] + 'px';
  }

  function paintHome(data) {
    UI.clear(weatherEl);
    UI.clear(roomsEl);
    var weather = data && data.weathers && data.weathers[0];
    if (weather) {
      UI.append(weatherEl, [
        h('span.ss-sun'),
        h('span.ss-deg', { text: typeof weather.temperature === 'number' ? Math.round(weather.temperature) + '°' : '—' }),
        h('span.ss-cond', {}, [
          Home.weatherLabel(weather.state),
          typeof weather.humidity === 'number' ? h('br') : null,
          typeof weather.humidity === 'number' ? 'umidità ' + weather.humidity + ' %' : null
        ])
      ]);
    }
    ((data && data.temps) || []).slice(0, MAX_ROOMS).forEach(function (sensor) {
      if (sensor.state === 'unavailable' || sensor.state === 'unknown') return;
      roomsEl.appendChild(h('div', {}, [h('b', { text: sensor.state + ' ' + sensor.unit }), sensor.name]));
    });
  }

  function loadHome() {
    if (!Platform.isTV || !Home.configured()) return;
    Home.loadStates().then(function (data) { if (visible) paintHome(data); }, function () { /* resta solo l'ora */ });
  }

  function show() {
    if (visible) return;
    visible = true;
    var last = Storage.getLastChannel();
    lastEl.textContent = last && last.name ? 'Ultimo canale ' + last.name : '';
    paintClock();
    paintHome(Home.data);
    el.classList.add('visible');
    clockTimer = setInterval(paintClock, CLOCK_MS);
    loadHome();
    homeTimer = setInterval(loadHome, HOME_MS);
  }

  function hide() {
    if (!visible) return;
    visible = false;
    el.classList.remove('visible');
    clearInterval(clockTimer);
    clearInterval(homeTimer);
  }

  function activity() {
    lastActivity = Date.now();
  }

  // Il tasto che chiude il salvaschermo non deve fare altro (niente cambio canale o apertura per sbaglio).
  root.document.addEventListener('keydown', function (event) {
    if (visible) {
      event.preventDefault();
      event.stopImmediatePropagation();
      hide();
    }
    activity();
  }, true);
  ['mousemove', 'mousedown', 'touchstart', 'wheel'].forEach(function (type) {
    root.document.addEventListener(type, function (event) {
      if (visible && type !== 'mousemove') {
        event.preventDefault();
        event.stopPropagation();
      }
      if (visible) hide();
      activity();
    }, true);
  });

  setInterval(function () {
    var limit = minutes();
    if (!limit || visible || !mayShow()) return;
    if (Date.now() - lastActivity >= limit * 60000) show();
  }, CHECK_MS);

  root.Screensaver = { show: show, hide: hide, isVisible: function () { return visible; }, activity: activity };
})(this);
