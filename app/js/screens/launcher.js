/*
 * Home a riquadri (solo TV): Live TV grande, Preferiti, Guida, Film, Serie, Casa, Impostazioni e Cerca.
 * Ogni riquadro apre la sezione corrispondente della lista; INDIETRO dalla lista torna qui.
 *
 * Posizioni assolute su 1920x1080 (niente grid né gap: Tizen 3.0 usa Chromium 47).
 * Con un canale nel riquadro (MiniPlayer) il video gira dentro il riquadro Live TV (MINI_RECTS.launcher).
 */
(function (root) {
  'use strict';

  var h = UI.h;
  var POSTER_MS = 5000; // ogni quanto cambia una locandina di Film e Serie
  var POSTER_POOL = 60; // locandine estratte a caso dall'elenco, tra cui girano
  var HOME_MS = 60000; // aggiornamento di luci, clima e meteo
  var CAMERA_MS = 10000; // aggiornamento dell'immagine della telecamera
  var CATALOG_WAIT_MS = 30000; // con un canale in onda si ritenta più tardi
  var CATALOG_DELAY_MS = 1500; // film e serie si scaricano dopo che la Home è comparsa

  // Colore dello sfondo che segue il riquadro a fuoco (r, g, b).
  var TILES = [
    { id: 'live', label: 'Live TV', rect: [96, 196, 840, 560], hue: '47,107,255' },
    { id: 'favorites', label: 'Preferiti', rect: [968, 196, 412, 264], hue: '217,164,0' },
    { id: 'guide', label: 'Guida TV', rect: [1412, 196, 412, 264], hue: '19,163,154' },
    { id: 'vod', label: 'Film', rect: [968, 492, 412, 264], hue: '194,65,58' },
    { id: 'series', label: 'Serie TV', rect: [1412, 492, 412, 264], hue: '138,79,224' },
    { id: 'home', label: 'Casa', rect: [96, 788, 840, 200], hue: '47,184,138' },
    { id: 'settings', label: 'Impostazioni', rect: [968, 788, 412, 200], hue: '107,120,152' },
    { id: 'search', label: 'Cerca', rect: [1412, 788, 412, 200], hue: '80,110,170' }
  ];

  var el = root.document.getElementById('screen-launcher');
  var glows = [h('div.lh-glow'), h('div.lh-glow')];
  var glowIndex = 0;
  var greetEl = h('div.lh-greet');
  var weatherEl = h('div.lh-weather');
  var clockEl = h('div.lh-clock');
  // Le tue partite: fino a 4 riquadri in alto al posto di saluto e meteo (▲ dai riquadri). Nascosti se non ce ne sono.
  var MATCH_SLOTS = 4;
  var matchChips = [];
  for (var i = 0; i < MATCH_SLOTS; i++) {
    matchChips.push({
      when: h('b'), title: h('span'),
      el: h('div.lh-match.focusable', { 'data-zone': 'launcher' })
    });
    UI.append(matchChips[i].el, [matchChips[i].when, matchChips[i].title]);
  }
  var matchesEl = h('div.lh-matches', {}, matchChips.map(function (c) { return c.el; }));
  var dateEl = h('div.lh-date');
  var tiles = {};

  UI.append(el, [
    glows[0], glows[1], h('div.lh-veil'),
    h('div.lh-top', {}, [
      h('div.brand', {}, ['Home', h('span', { text: 'Tivu' })]),
      greetEl,
      matchesEl,
      weatherEl,
      h('div.lh-clockbox', {}, [clockEl, dateEl])
    ])
  ]);

  TILES.forEach(function (tile) {
    var tileEl = h('div.lh-tile.lh-' + tile.id + '.focusable', {
      'data-zone': 'launcher', 'data-tile': tile.id,
      style: 'left:' + tile.rect[0] + 'px;top:' + tile.rect[1] + 'px;width:' + tile.rect[2] + 'px;height:' + tile.rect[3] + 'px'
    });
    tileEl.onSelect = function () { App.show('browse', { section: tile.id }); };
    tileEl.onFocusIn = function () { glow(tile.hue); };
    tiles[tile.id] = { el: tileEl, sub: h('div.lh-sub'), label: h('div.lh-label', {}, [h('h2', { text: tile.label })]) };
    tiles[tile.id].label.appendChild(tiles[tile.id].sub);
    el.appendChild(tileEl);
  });

  el.appendChild(h('footer.hints.lh-hints', {}, [
    h('span', {}, [h('b', { text: 'OK' }), ' apri']),
    h('span', {}, [h('b', { text: 'INDIETRO' }), ' esci'])
  ]));

  /** Sfondo sfumato del colore del riquadro: due strati che si alternano in dissolvenza. */
  function glow(hue) {
    var next = glows[glowIndex = 1 - glowIndex];
    next.style.background =
      'radial-gradient(ellipse at 22% 30%, rgba(' + hue + ',0.34) 0%, rgba(' + hue + ',0) 60%),' +
      'radial-gradient(ellipse at 85% 78%, rgba(' + hue + ',0.2) 0%, rgba(' + hue + ',0) 55%)';
    next.classList.add('visible');
    glows[1 - glowIndex].classList.remove('visible');
  }

  // ---------- Contenuto dei riquadri ----------

  // Live TV: canale nel riquadro (o ultimo guardato), programma in onda e avanzamento.
  var live = {
    num: h('div.lh-num'),
    now: h('div.lh-now'),
    bar: h('div.lh-progress-bar'),
    epgFor: null,
    epg: []
  };
  UI.append(tiles.live.el, [
    h('div.lh-fill'), h('div.lh-band'), h('div.lh-shade'),
    h('div.lh-badge', {}, [h('i'), 'IN DIRETTA']),
    live.num, tiles.live.label
  ]);
  UI.append(tiles.live.label, [live.now, h('div.lh-progress', {}, [live.bar])]);
  tiles.live.label.appendChild(tiles.live.sub); // il conteggio dei canali resta in fondo

  // Preferiti: i primi numeri di canale.
  var favNums = h('div.lh-favs');
  UI.append(tiles.favorites.el, [h('div.lh-fill'), favNums, tiles.favorites.label]);

  // Guida: piccola griglia con la linea dell'ora.
  var guideRows = [[[0, 38], [40, 34, 1], [76, 24]], [[0, 22], [24, 50, 1], [76, 24]], [[0, 58, 1], [60, 40]]];
  UI.append(tiles.guide.el, [
    h('div.lh-fill'),
    h('div.lh-guide-grid', {}, guideRows.map(function (row) {
      return h('div.lh-guide-row', {}, row.map(function (p) {
        return h('i' + (p[2] ? '.on' : ''), { style: 'left:' + p[0] + '%;width:' + p[1] + '%' });
      }));
    }).concat([h('div.lh-guide-now')])),
    tiles.guide.label
  ]);
  tiles.guide.sub.textContent = 'Ora in onda e stasera';

  // Film e Serie: tre locandine a ventaglio che cambiano a caso.
  var fans = { vod: makeFan('vod'), series: makeFan('series') };
  function makeFan(type) {
    var slots = [0, 1, 2].map(function (i) {
      var img = h('img.lh-poster-img', { alt: '' });
      return { box: h('div.lh-poster.lh-poster-' + i, {}, [img]), img: img };
    });
    UI.append(tiles[type].el, [
      h('div.lh-fill'),
      h('div.lh-posters', {}, slots.map(function (s) { return s.box; })),
      tiles[type].label
    ]);
    return { type: type, slots: slots, pool: [], next: 0 };
  }

  // Casa: luci e clima, e l'immagine della telecamera a destra.
  var homeChips = h('div.lh-chips');
  var camImg = h('img.lh-cam-img', { alt: '' });
  var camName = h('span.lh-cam-name');
  var camEl = h('div.lh-cam', {}, [camImg, camName]);
  camImg.onerror = function () { camEl.classList.remove('has-image'); };
  camImg.onload = function () { camEl.classList.add('has-image'); };
  UI.append(tiles.home.el, [h('div.lh-fill'), camEl, homeChips, tiles.home.label]);

  UI.append(tiles.settings.el, [h('div.lh-fill'), h('div.lh-icon.lh-icon-gear'), tiles.settings.label]);
  UI.append(tiles.search.el, [h('div.lh-fill'), h('div.lh-icon.lh-icon-search'), tiles.search.label]);
  tiles.settings.sub.textContent = 'Account, riproduzione, Casa';
  tiles.search.sub.textContent = 'Canali, film e serie';

  function count(n, one, many) {
    // Separatore delle migliaia a mano: sulla TV toLocaleString non è affidabile.
    return n === 1 ? '1 ' + one : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' ' + many;
  }

  function renderFavorites() {
    var favorites = Storage.getFavorites();
    var channels = favorites.filter(function (f) { return f.type === 'live' && f.num; });
    UI.clear(favNums);
    channels.slice(0, 3).forEach(function (f) { favNums.appendChild(h('b', { text: String(f.num) })); });
    tiles.favorites.sub.textContent = favorites.length ? count(favorites.length, 'preferito', 'preferiti') : 'Nessuno ancora';
  }

  /** Canale da mostrare nel riquadro Live TV: quello che sta andando, altrimenti l'ultimo guardato. */
  function liveChannel() {
    return MiniPlayer.item() || Storage.getLastChannel();
  }

  function renderLive() {
    var channel = liveChannel();
    var playing = !!MiniPlayer.item();
    el.classList.toggle('mini-active', playing);
    tiles.live.el.classList.toggle('has-channel', !!channel);
    live.num.textContent = channel && channel.num ? String(channel.num) : '';
    var now = Date.now();
    var current = live.epg.filter(function (p) { return p.start <= now && p.end > now; })[0];
    live.now.textContent = channel
      ? (playing ? '' : 'Ultimo canale: ') + channel.name + (current ? '  ·  ' + current.title : '')
      : 'Scegli un canale dalla lista';
    var ratio = current ? (now - current.start) / (current.end - current.start) : 0;
    live.bar.parentNode.style.visibility = current ? 'visible' : 'hidden';
    live.bar.style.width = (Math.max(0, Math.min(1, ratio)) * 100).toFixed(1) + '%';
    if (channel && channel.id !== live.epgFor && App.client) {
      live.epgFor = channel.id;
      live.epg = [];
      App.client.getShortEpg(channel.id, 2).then(function (list) {
        if (live.epgFor !== channel.id) return;
        live.epg = list;
        renderLive();
      }, function () { /* guida non disponibile per questo canale */ });
    }
  }

  function renderMatch() {
    var list = Matches.list().slice(0, MATCH_SLOTS);
    var now = Date.now();
    matchesEl.style.display = list.length ? '' : 'none';
    greetEl.style.display = list.length ? 'none' : ''; // c'è spazio per una cosa sola
    weatherEl.style.display = list.length ? 'none' : '';
    matchChips.forEach(function (chip, i) {
      var match = list[i];
      chip.el.style.display = match ? '' : 'none';
      chip.el.classList.toggle('live', !!match && match.start <= now);
      chip.el.onSelect = match ? function () { Matches.watch(match); } : null;
      if (!match) return;
      chip.when.textContent = Matches.whenLabel(match, now) + '  ·  ' + Matches.channelNames(match);
      chip.title.textContent = match.title;
    });
  }
  root.document.addEventListener('matcheschange', function () {
    if (App.current() === App.screens.launcher) renderMatch();
  });

  function renderClock() {
    var now = new Date();
    var hour = now.getHours();
    clockEl.textContent = UI.formatClock(now.getTime());
    dateEl.textContent = UI.formatDay(now.getTime());
    greetEl.textContent = hour < 5 ? 'Buonanotte' : hour < 13 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
  }

  function renderHome() {
    var data = Home.data;
    UI.clear(weatherEl);
    UI.clear(homeChips);
    if (!Home.configured()) {
      tiles.home.sub.textContent = 'Collega Home Assistant in Impostazioni';
      camEl.style.display = 'none';
      return;
    }
    tiles.home.sub.textContent = '';
    if (!data) return;
    var weather = data.weathers[0];
    if (weather && typeof weather.temperature === 'number') {
      UI.append(weatherEl, [h('b', { text: Math.round(weather.temperature) + '°' }), ' ' + Home.weatherLabel(weather.state)]);
    }
    var lightsOn = data.lights.filter(function (l) { return l.state === 'on'; }).length;
    homeChips.appendChild(h('span', {}, lightsOn
      ? [h('b', { text: String(lightsOn) }), lightsOn === 1 ? ' luce accesa' : ' luci accese']
      : ['Luci spente']));
    var climate = data.climates[0];
    if (climate && typeof climate.current === 'number') {
      homeChips.appendChild(h('span', {}, ['Clima ', h('b', { text: String(climate.current).replace('.', ',') + '°' })]));
    }
    var camera = Home.mainCamera();
    camEl.style.display = camera ? '' : 'none';
    camName.textContent = camera ? camera.name : '';
    var src = camera ? Home.cameraUrl(camera) : '';
    if (src) camImg.src = src + (src.indexOf('?') === -1 ? '?' : '&') + '_=' + Date.now();
  }

  // ---------- Locandine casuali di Film e Serie ----------

  function shuffleSample(items, size) {
    var withIcon = items.filter(function (item) { return item.icon; });
    var sample = [];
    for (var i = 0; i < size && withIcon.length; i++) {
      sample.push(withIcon.splice(Math.floor(Math.random() * withIcon.length), 1)[0]);
    }
    return sample;
  }

  function loadFan(fan) {
    return App.loadSection(fan.type).then(function (data) {
      fan.pool = shuffleSample(data.items, POSTER_POOL);
      tiles[fan.type].sub.textContent = fan.type === 'vod'
        ? count(data.items.length, 'film', 'film') : count(data.items.length, 'serie', 'serie');
      fan.slots.forEach(function (slot) { swapPoster(fan, slot); });
    }, function () { /* elenco non disponibile: restano i riquadri senza locandine */ });
  }

  /** Mette nella casella la prossima locandina che si carica davvero (quelle rotte si saltano). */
  function swapPoster(fan, slot, attempts) {
    if (!fan.pool.length || (attempts || 0) > 5) return;
    var item = fan.pool[fan.next++ % fan.pool.length];
    var loader = new root.Image();
    loader.onload = function () {
      slot.box.classList.add('changing');
      setTimeout(function () {
        slot.img.src = item.icon;
        slot.box.classList.add('loaded');
        slot.box.classList.remove('changing');
      }, 300);
    };
    loader.onerror = function () { swapPoster(fan, slot, (attempts || 0) + 1); };
    loader.src = item.icon;
  }

  var posterTurn = 0;
  function rotatePosters() {
    var fan = fans[posterTurn % 2 ? 'series' : 'vod'];
    swapPoster(fan, fan.slots[Math.floor(posterTurn / 2) % 3]);
    posterTurn++;
  }

  // ---------- Timer (solo con la Home in primo piano) ----------

  var timers = [];
  var catalogsRequested = false;

  function startTimers() {
    stopTimers();
    timers.push(setInterval(function () { renderClock(); renderLive(); renderMatch(); }, 30000));
    timers.push(setInterval(rotatePosters, POSTER_MS / 2)); // Film e Serie a turno: ognuno cambia ogni POSTER_MS
    if (Home.configured()) {
      timers.push(setInterval(function () { Home.loadStates().then(renderHome, function () { /* resta l'ultimo stato */ }); }, HOME_MS));
      timers.push(setInterval(function () { if (Home.data) renderHome(); }, CAMERA_MS));
    }
    if (!catalogsRequested) {
      var requestCatalogs = function () {
        // Mentre un canale è in onda niente elenchi enormi da scaricare e leggere: bloccherebbero la TV e il video.
        if (Player.url) {
          timers.push(setTimeout(requestCatalogs, CATALOG_WAIT_MS));
          return;
        }
        catalogsRequested = true;
        // Uno dopo l'altro: sulla TV scaricare due elenchi grandi insieme rallenta tutto.
        loadFan(fans.vod).then(function () { return loadFan(fans.series); });
      };
      timers.push(setTimeout(requestCatalogs, CATALOG_DELAY_MS));
    }
  }

  function stopTimers() {
    timers.forEach(function (t) { clearInterval(t); clearTimeout(t); });
    timers = [];
  }

  function refresh() {
    MiniPlayer.onChange = renderLive;
    MiniPlayer.setSide('launcher');
    renderClock();
    renderLive();
    renderMatch();
    renderFavorites();
    renderHome();
    App.loadSection('live').then(function (data) {
      tiles.live.sub.textContent = count(data.items.length, 'canale', 'canali');
    }, function () { /* conteggio non disponibile */ });
    startTimers();
  }

  App.register('launcher', {
    el: el,
    /** @param {{boot: boolean}} params boot = apertura dell'app: va alla sezione scelta in "Apri all'avvio" */
    enter: function (params) {
      catalogsRequested = false;
      fans.vod.pool = [];
      fans.series.pool = [];
      Home.start();
      refresh();
      Nav.focus(tiles.live.el);
      if (!params.boot) return;
      var start = App.screens.browse.startSection();
      if (start !== 'launcher') App.show('browse', { section: start });
      App.screens.browse.openLastChannel();
    },
    resume: function () {
      refresh();
    },
    leave: stopTimers,
    pause: stopTimers, // sopra la Home si apre un'altra schermata: i timer ripartono con resume
    handleKey: function (action) {
      if (MiniPlayer.active && (action === 'play' || action === 'playpause')) {
        MiniPlayer.expand();
        return true;
      }
      if (MiniPlayer.active && (action === 'stop' || action === 'back')) {
        MiniPlayer.close(); // INDIETRO prima ferma il canale, poi (due volte) esce dall'app
        return true;
      }
      return false;
    }
  });
})(this);
