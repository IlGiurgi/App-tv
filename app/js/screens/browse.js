/*
 * Schermata principale: tab (Live, Film, Serie, Preferiti, Cerca, Impostazioni),
 * colonna categorie e lista contenuti.
 *
 * Le liste possono contenere decine di migliaia di elementi: si renderizzano a blocchi
 * e se ne aggiungono altri quando il focus si avvicina alla fine.
 */
(function (root) {
  'use strict';

  var h = UI.h;
  var CHUNK = 60;
  var PRELOAD_THRESHOLD = 12;
  var SEARCH_LIMIT = 300;

  var TABS = [
    { id: 'live', label: 'Live TV' },
    { id: 'guide', label: 'Guida TV' },
    { id: 'vod', label: 'Film' },
    { id: 'series', label: 'Serie TV' },
    { id: 'favorites', label: 'Preferiti' },
    { id: 'search', label: 'Cerca' },
    { id: 'settings', label: 'Impostazioni' }
  ];
  // Home Assistant solo sulla TV: telecamere, clima, luci e scene.
  if (Platform.isTV) TABS.splice(TABS.length - 2, 0, { id: 'home', label: 'Casa' });
  var TYPE_LABELS = { live: 'Canali TV', vod: 'Film', series: 'Serie TV' };
  var TYPE_BADGES = { live: 'TV', vod: 'Film', series: 'Serie' };

  var el = root.document.getElementById('screen-browse');
  var tabsEl = el.querySelector('.tabs');
  var categoriesEl = el.querySelector('.categories');
  var itemsEl = el.querySelector('.items');
  var titleEl = el.querySelector('.items-title');
  var clockEl = el.querySelector('.clock');

  // Riquadro sotto la lista con il programma in onda sul canale selezionato.
  var epgInfoEl = h('div.epg-info', {}, [
    h('p.epg-info-now'), h('p.epg-info-plot'), h('p.epg-info-next')
  ]);
  el.querySelector('.content').appendChild(epgInfoEl);

  // Cornice del riquadro con il canale che si stava guardando (il video è disegnato dal player sotto la pagina).
  var miniNameEl = h('span.mini-name');
  var miniEl = h('div.mini-player.focusable', { 'data-zone': 'browse-mini' }, [miniNameEl]);
  miniEl.onSelect = function () { MiniPlayer.expand(); };
  el.appendChild(miniEl);

  function renderMini() {
    var it = MiniPlayer.item();
    // Nella scheda Casa a destra stanno grafici e telecamera: il riquadro resta a sinistra; altrove sta a destra.
    var side = state.section === 'home' ? 'left' : 'right';
    MiniPlayer.setSide(side);
    el.classList.toggle('mini-right', side === 'right');
    el.classList.toggle('mini-active', !!it);
    miniNameEl.textContent = it ? '▶  ' + it.name : '';
    if (!it && Nav.current === miniEl) Nav.focusZone('browse-cats') || Nav.focusZone('browse-tabs');
  }

  var state = {
    section: null,
    categoryId: null,
    items: [],
    rendered: 0,
    layout: 'list',
    query: '',
    renderToken: 0
  };

  // Arrivati in fondo alla lista (canali, film, guida) ▼ si ferma lì: non salta tra le categorie.
  Nav.stickyDown['browse-items'] = true;

  // ---------- Tab ----------

  TABS.forEach(function (tab) {
    var tabEl = h('div.tab.focusable', { 'data-zone': 'browse-tabs', 'data-tab': tab.id, text: tab.label });
    tabEl.onSelect = function () { selectSection(tab.id); };
    tabsEl.appendChild(tabEl);
  });

  function markActiveTab() {
    Array.prototype.forEach.call(tabsEl.children, function (tabEl) {
      tabEl.classList.toggle('selected', tabEl.getAttribute('data-tab') === state.section);
    });
  }

  /** Su touchscreen: niente tasto ROSSO, si usa la pressione prolungata. */
  function isTouch() {
    if (Platform.isTV) return false;
    return root.document.documentElement.classList.contains('mobile') || 'ontouchstart' in root;
  }

  function favoriteHint() {
    return isTouch() ? 'tieni premuto un canale, un film o una serie' : 'premi il tasto ROSSO su un contenuto';
  }

  // ---------- Scorrimento a destra/sinistra sulla lista: categoria successiva/precedente ----------

  var SWIPE_MIN_DISTANCE = 80;
  var SWIPE_MAX_DURATION = 700;
  var swipe = null;

  el.querySelector('.content').addEventListener('touchstart', function (event) {
    var touch = event.touches[0];
    swipe = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY, at: Date.now() } : null;
  }, { passive: true });

  el.querySelector('.content').addEventListener('touchend', function (event) {
    if (!swipe) return;
    var touch = event.changedTouches[0];
    var dx = touch.clientX - swipe.x;
    var dy = touch.clientY - swipe.y;
    var quick = Date.now() - swipe.at < SWIPE_MAX_DURATION;
    swipe = null;
    // Solo gesti chiaramente orizzontali: lo scorrimento verticale della lista non cambia categoria.
    if (!quick || Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 2) return;
    if (state.layout === 'guide') return; // nella guida il gesto orizzontale scorre gli orari
    var cats = Array.prototype.filter.call(categoriesEl.children, function (c) {
      return c.classList.contains('category');
    });
    var current = cats.filter(function (c) { return c.classList.contains('selected'); })[0];
    var next = cats[cats.indexOf(current) + (dx < 0 ? 1 : -1)];
    if (!current || !next) return;
    next.selectCategory();
    // Solo la barra delle categorie scorre fino a quella nuova (scrollIntoView sposterebbe anche la pagina).
    categoriesEl.scrollLeft = next.offsetLeft - (categoriesEl.clientWidth - next.offsetWidth) / 2;
  }, { passive: true });

  function selectSection(section) {
    state.section = section;
    state.categoryId = null;
    markActiveTab();
    el.classList.toggle('no-categories', section === 'settings' || section === 'home');
    el.classList.toggle('section-home', section === 'home');
    renderMini(); // il lato del riquadro del canale dipende dalla sezione
    Nav.forgetZone('browse-cats');
    Nav.forgetZone('browse-items');
    UI.clear(categoriesEl);
    renderItems([], 'list', '');
    stopHomeTimers();

    if (section === 'home') return showHome();
    if (section === 'favorites') return showFavorites();
    if (section === 'search') return showSearch();
    if (section === 'settings') return showSettings();
    showCatalog(section);
  }

  // ---------- Categorie ----------

  function renderCategories(categories) {
    UI.clear(categoriesEl);
    categoriesEl.scrollTop = 0;
    categories.forEach(function (cat) {
      var catEl = h('div.category.focusable', { 'data-zone': 'browse-cats', 'data-category': cat.id }, [
        h('span.category-name', { text: cat.name }),
        h('span.category-count', { text: String(cat.count) })
      ]);
      // La lista si aggiorna da sola scorrendo le categorie; OK porta direttamente ai contenuti.
      catEl.onFocusIn = UI.debounce(function () {
        if (Nav.current === catEl) cat.select();
      }, 250);
      catEl.onSelect = function () {
        cat.select();
        Nav.focusZone('browse-items');
      };
      catEl.selectCategory = cat.select; // scorrimento col dito: cambia lista senza spostare il focus
      categoriesEl.appendChild(catEl);
    });
  }

  function markActiveCategory() {
    Array.prototype.forEach.call(categoriesEl.children, function (catEl) {
      catEl.classList.toggle('selected', catEl.getAttribute('data-category') === state.categoryId);
    });
  }

  /** @param {string} section 'live' | 'guide' (stessi canali, a griglia oraria) | 'vod' | 'series' */
  function showCatalog(section) {
    var type = section === 'guide' ? 'live' : section;
    UI.withLoader(App.loadSection(type)).then(function (data) {
      if (state.section !== section) return;
      var counts = {};
      data.items.forEach(function (item) {
        counts[item.categoryId] = (counts[item.categoryId] || 0) + 1;
      });
      var layout = section === 'guide' ? 'guide' : type === 'live' ? 'list' : 'grid';
      var categories = [{ id: '*', name: 'Tutti', count: data.items.length }].concat(
        data.categories.map(function (c) { return { id: c.id, name: c.name, count: counts[c.id] || 0 }; })
      );
      categories.forEach(function (cat) {
        cat.select = function () {
          if (state.categoryId === cat.id) return;
          state.categoryId = cat.id;
          markActiveCategory();
          var items = cat.id === '*' ? data.items : data.items.filter(function (item) {
            return item.categoryId === cat.id;
          });
          renderItems(items, layout, cat.name);
        };
      });
      renderCategories(categories);
      // Si parte dalla prima categoria vera (di solito "Tutti" è enorme).
      (categories[1] || categories[0]).select();
    }, function (err) {
      if (state.section === section) showMessage('Errore nel caricamento: ' + err.message);
    });
  }

  // ---------- Lista contenuti ----------

  function renderItems(items, layout, title) {
    state.items = items;
    state.layout = layout;
    state.rendered = 0;
    state.renderToken++;
    Nav.forgetZone('browse-items');
    titleEl.textContent = title || '';
    epgQueue.length = 0;
    showEpgInfo(null);
    UI.clear(itemsEl);
    itemsEl.className = 'items scroll layout-' + layout;
    itemsEl.scrollTop = 0;
    itemsEl.scrollLeft = 0;
    if (title && !items.length) showMessage('Nessun contenuto');
    else if (layout === 'guide') itemsEl.appendChild(guideHeader());
    renderMore();
  }

  // Con il mouse si scorre con la rotellina: carica il blocco successivo vicino al fondo.
  itemsEl.addEventListener('scroll', function () {
    if (itemsEl.scrollTop + itemsEl.clientHeight > itemsEl.scrollHeight - 600) renderMore();
  });

  function renderMore() {
    var end = Math.min(state.items.length, state.rendered + CHUNK);
    for (var i = state.rendered; i < end; i++) itemsEl.appendChild(itemElement(state.items[i], i));
    state.rendered = end;
  }

  function itemElement(item, index) {
    if (state.layout === 'guide') return guideRowElement(item, index);
    var fav = Storage.isFavorite(item.type, item.id);
    var itemEl;
    if (state.layout === 'grid') {
      itemEl = h('div.card.focusable', {}, [
        h('div.poster', {}, [
          UI.img(item.icon, 'poster-img'),
          h('span.poster-fallback', { text: item.name }),
          item.progress ? h('div.card-progress', {}, [h('div.card-progress-bar', {
            style: 'width:' + (item.progress * 100).toFixed(1) + '%'
          })]) : null
        ]),
        h('div.card-title', { text: item.name }),
        h('span.fav-badge', { text: '★' })
      ]);
    } else {
      var live = item.type === 'live';
      itemEl = h('div.row.focusable', {}, [
        h('span.row-num', { text: live && item.num ? String(item.num) : '' }),
        UI.img(item.icon, 'row-logo'),
        live
          ? h('div.row-text', {}, [
            h('span.row-name', { text: item.name }),
            h('span.row-epg'),
            h('div.row-progress', {}, [h('div.row-progress-bar')])
          ])
          : h('span.row-name', { text: item.name }),
        state.layout === 'mixed' ? h('span.badge', { text: TYPE_BADGES[item.type] || '' }) : null,
        h('span.fav-badge', { text: '★' })
      ]);
    }
    itemEl.setAttribute('data-zone', 'browse-items');
    itemEl.classList.toggle('is-favorite', fav);
    itemEl.item = item;
    if (itemEl.querySelector('.row-epg')) {
      updateRowEpg(itemEl);
      requestEpg(item.id);
    }
    itemEl.onFocusIn = function () {
      if (index >= state.rendered - PRELOAD_THRESHOLD) renderMore();
      showEpgInfo(item.type === 'live' ? item : null);
    };
    itemEl.onSelect = function () { openItem(item); };
    return itemEl;
  }

  // ---------- Guida TV: programma in onda sui canali ----------

  // La guida si chiede canale per canale (get_short_epg), solo per le righe già mostrate,
  // poche richieste alla volta per non rallentare la TV, e resta in memoria per qualche minuto.
  var EPG_TTL = 5 * 60000;
  var EPG_PARALLEL = 3;
  var EPG_LIMIT = 8; // programmi per canale: bastano per le 3 ore della guida a griglia
  var epgCache = {}; // id canale -> {at, list, loading}
  var epgQueue = [];
  var epgRunning = 0;
  var epgInfoItem = null;

  function programAt(list, now) {
    return list.filter(function (p) { return p.start <= now && p.end > now; })[0] || null;
  }

  function programAfter(list, now) {
    return list.filter(function (p) { return p.start > now; })[0] || null;
  }

  function epgList(id) {
    return (epgCache[id] && epgCache[id].list) || [];
  }

  function requestEpg(id) {
    var entry = epgCache[id];
    if (entry && (entry.loading || Date.now() - entry.at < EPG_TTL)) return;
    if (epgQueue.indexOf(id) === -1) epgQueue.push(id);
    pumpEpg();
  }

  function pumpEpg() {
    while (epgRunning < EPG_PARALLEL && epgQueue.length && App.client) loadEpg(epgQueue.shift());
  }

  function loadEpg(id) {
    var entry = epgCache[id] = epgCache[id] || { at: 0, list: [] };
    entry.loading = true;
    epgRunning++;
    App.client.getShortEpg(id, EPG_LIMIT).then(function (list) {
      entry.list = list;
    }, function () { /* guida non disponibile per questo canale */ }).then(function () {
      entry.loading = false;
      entry.at = Date.now();
      epgRunning--;
      refreshEpgViews(id);
      pumpEpg();
    });
  }

  function refreshEpgViews(id) {
    Array.prototype.forEach.call(itemsEl.children, function (rowEl) {
      if (!rowEl.item || rowEl.item.type !== 'live' || (id !== undefined && rowEl.item.id !== id)) return;
      if (rowEl.classList.contains('guide-row')) renderGuideRow(rowEl);
      else updateRowEpg(rowEl);
    });
    if (epgInfoItem && (id === undefined || epgInfoItem.id === id)) showEpgInfo(epgInfoItem);
  }

  function updateRowEpg(rowEl) {
    var now = Date.now();
    var current = programAt(epgList(rowEl.item.id), now);
    rowEl.classList.toggle('has-epg', !!current);
    rowEl.querySelector('.row-epg').textContent = current
      ? UI.formatClock(current.start) + '–' + UI.formatClock(current.end) + '  ' + current.title
      : '';
    var ratio = current ? (now - current.start) / (current.end - current.start) : 0;
    rowEl.querySelector('.row-progress-bar').style.width = (Math.max(0, Math.min(1, ratio)) * 100).toFixed(1) + '%';
  }

  /** Riquadro con titolo, descrizione e programma successivo del canale selezionato (null = nascosto). */
  function showEpgInfo(item) {
    epgInfoItem = item;
    var now = Date.now();
    var list = item ? epgList(item.id) : [];
    var current = programAt(list, now);
    var next = programAfter(list, now);
    var lines = epgInfoEl.children;
    lines[0].textContent = current
      ? UI.formatClock(current.start) + '–' + UI.formatClock(current.end) + '  ' + current.title
      : '';
    lines[1].textContent = current ? current.description : '';
    lines[2].textContent = next ? 'Dopo: ' + UI.formatClock(next.start) + '  ' + next.title : '';
    epgInfoEl.classList.toggle('visible', !!current);
  }

  // Ogni minuto avanzano le barre; i canali con la guida scaduta vengono richiesti di nuovo.
  setInterval(function () {
    if (!el.classList.contains('active')) return;
    // Guida: ogni mezz'ora la fascia oraria scorre in avanti.
    var header = itemsEl.querySelector('.guide-header');
    if (header && header.windowStart !== guideWindow().start) itemsEl.replaceChild(guideHeader(), header);
    refreshEpgViews();
    Array.prototype.forEach.call(itemsEl.children, function (rowEl) {
      if (rowEl.item && rowEl.item.type === 'live') requestEpg(rowEl.item.id);
    });
  }, 60000);

  // ---------- Guida TV a griglia ----------

  // Fascia di 3 ore a partire dalla mezz'ora in corso; ogni canale è una riga di programmi.
  var GUIDE_HOURS = 3;

  /** Larghezza in px della fascia oraria: fissa sulla TV (layout 1920), più stretta e scorrevole sul telefono. */
  function guideWidth() {
    return root.document.documentElement.classList.contains('mobile') ? 720 : 1000;
  }

  function guideWindow() {
    var start = new Date();
    start.setMinutes(start.getMinutes() < 30 ? 0 : 30, 0, 0);
    return { start: start.getTime(), end: start.getTime() + GUIDE_HOURS * 3600000 };
  }

  function guideX(time, win) {
    return (time - win.start) / (win.end - win.start) * guideWidth();
  }

  function guideHeader() {
    var win = guideWindow();
    var times = h('div.guide-times');
    for (var t = win.start; t < win.end; t += 1800000) {
      var label = h('span.guide-time', { text: UI.formatClock(t) });
      label.style.left = guideX(t, win) + 'px';
      times.appendChild(label);
    }
    var header = h('div.guide-header', {}, [h('div.guide-corner'), times]);
    header.windowStart = win.start;
    return header;
  }

  function guideRowElement(item, index) {
    var rowEl = h('div.guide-row', {}, [
      h('div.guide-channel', {}, [UI.img(item.icon, 'guide-logo'), h('span.guide-name', { text: item.name })]),
      h('div.guide-timeline')
    ]);
    rowEl.item = item;
    rowEl.index = index;
    renderGuideRow(rowEl);
    requestEpg(item.id);
    return rowEl;
  }

  /** Disegna (o ridisegna, quando arriva la guida) i programmi di un canale, mantenendo il focus. */
  function renderGuideRow(rowEl) {
    var item = rowEl.item;
    var timeline = rowEl.lastChild;
    var focused = Nav.current && Nav.current.parentNode === timeline ? Nav.current : null;
    var win = guideWindow();
    var now = Date.now();
    var entry = epgCache[item.id];
    var programs = epgList(item.id).filter(function (p) { return p.end > win.start && p.start < win.end; });
    if (!programs.length) {
      programs = [{ placeholder: true, start: win.start, end: win.end,
        title: entry && !entry.loading && entry.at ? 'Guida non disponibile' : 'Caricamento…' }];
    }
    UI.clear(timeline);
    var refocus = null;
    programs.forEach(function (p) {
      var x1 = Math.max(0, guideX(p.start, win));
      var x2 = Math.min(guideWidth(), guideX(p.end, win));
      var cell = h('div.guide-prog.focusable', { 'data-zone': 'browse-items' }, [
        h('span.guide-prog-time', { text: p.placeholder ? '' : UI.formatClock(p.start) + '–' + UI.formatClock(p.end) }),
        h('span.guide-prog-title', { text: p.title })
      ]);
      cell.style.left = x1 + 'px';
      cell.style.width = Math.max(20, x2 - x1 - 6) + 'px';
      cell.classList.toggle('now', !p.placeholder && p.start <= now && p.end > now);
      cell.item = item;
      cell.program = p.placeholder ? null : p;
      cell.onSelect = function () { openItem(item); };
      cell.onFocusIn = function () {
        if (rowEl.index >= state.rendered - PRELOAD_THRESHOLD) renderMore();
        showGuideInfo(item, cell.program);
      };
      timeline.appendChild(cell);
      // Dopo il ridisegno il focus va sullo stesso programma, altrimenti su quello in onda.
      var same = focused && focused.program && cell.program && focused.program.start === cell.program.start;
      if (focused && (same || !refocus || (cell.classList.contains('now') && !refocus.same))) {
        refocus = cell;
        refocus.same = same;
      }
    });
    if (refocus) Nav.focus(refocus);
  }

  /** Nel riquadro sotto la guida: canale, orario, titolo e descrizione del programma selezionato. */
  function showGuideInfo(item, program) {
    epgInfoItem = null;
    var lines = epgInfoEl.children;
    lines[0].textContent = program
      ? item.name + '  ·  ' + UI.formatClock(program.start) + '–' + UI.formatClock(program.end) + '  ' + program.title
      : '';
    lines[1].textContent = program ? program.description : '';
    lines[2].textContent = program ? 'OK per guardare il canale' : '';
    epgInfoEl.classList.toggle('visible', !!program);
  }

  function showMessage(text) {
    UI.clear(itemsEl);
    itemsEl.appendChild(h('p.empty', { text: text }));
  }

  function openItem(item) {
    if (item.resumeAt !== undefined) { // da "Continua a guardare": riparte subito da dove si era rimasti
      MiniPlayer.close();
      App.show('player', { playlist: [item], index: 0, startAt: Storage.getResume(item.type + ':' + item.id) });
    } else if (item.type === 'live') {
      var channels = state.items.filter(function (i) { return i.type === 'live'; });
      App.show('player', { playlist: channels, index: channels.indexOf(item) });
    } else {
      MiniPlayer.close(); // film e serie si guardano a schermo intero: niente canale in sottofondo
      App.show('detail', { item: item });
    }
  }

  function toggleFavorite(itemEl) {
    var item = itemEl.item;
    if (item.type === 'episode') return; // i preferiti sono serie intere, non singoli episodi
    var added = Storage.toggleFavorite(item);
    itemEl.classList.toggle('is-favorite', added);
    UI.toast(added ? 'Aggiunto ai preferiti' : 'Rimosso dai preferiti');
    if (!added && state.section === 'favorites') {
      var index = state.items.indexOf(item);
      var type = item.type;
      state.categoryId = null;
      showFavorites(type);
      var next = itemsEl.children[Math.min(index, itemsEl.children.length - 1)];
      if (next && next.item) Nav.focus(next);
      else Nav.focusZone('browse-cats');
    }
  }

  // ---------- Preferiti ----------

  /** Film ed episodi lasciati a metà, con la percentuale vista per la barra sulla locandina. */
  function continueItems() {
    return Storage.getContinueWatching().map(function (entry) {
      var item = {};
      Object.keys(entry.item).forEach(function (k) { item[k] = entry.item[k]; });
      item.resumeAt = entry.position;
      item.progress = entry.duration ? Math.min(1, entry.position / entry.duration) : 0;
      return item;
    });
  }

  function showFavorites(selectedType) {
    var favorites = Storage.getFavorites();
    var watching = continueItems();
    var continueCategory = {
      id: 'continue', name: 'Continua a guardare', count: watching.length,
      select: function () {
        if (state.categoryId === 'continue') return;
        state.categoryId = 'continue';
        markActiveCategory();
        renderItems(watching, 'grid', 'Continua a guardare');
        if (!watching.length) showMessage('Qui compaiono i film e gli episodi che interrompi a metà.');
      }
    };
    var categories = [continueCategory].concat(['live', 'vod', 'series'].map(function (type) {
      var items = favorites.filter(function (f) { return f.type === type; });
      return {
        id: type, name: TYPE_LABELS[type], count: items.length,
        select: function () {
          if (state.categoryId === type) return;
          state.categoryId = type;
          markActiveCategory();
          renderItems(items, type === 'live' ? 'list' : 'grid', TYPE_LABELS[type]);
          if (!items.length) showMessage('Nessun preferito: per aggiungerne uno ' + favoriteHint() + '.');
        }
      };
    }));
    renderCategories(categories);
    var initial = categories.filter(function (c) { return c.id === selectedType; })[0] ||
      categories.filter(function (c) { return c.count; })[0] || categories[1]; // tutto vuoto: spiega i preferiti
    initial.select();
  }

  // ---------- Casa (Home Assistant): un'unica schermata ----------

  // In alto scene, luci e clima (condizionatori); in basso a sinistra resta il riquadro del canale,
  // al centro i grafici di temperatura e umidità, a destra la telecamera (misure in style.css, .home-bottom).
  var HOME_PREVIEW_MS = 5000;
  var HOME_STATES_MS = 60000;
  var HOME_CHART_HOURS = 24;
  var CLIMATE_MODES = {
    off: 'Spento', cool: 'Freddo', heat: 'Caldo', auto: 'Auto', dry: 'Deumidifica', fan_only: 'Ventola',
    heat_cool: 'Caldo/Freddo'
  };
  var homeTimers = [];
  var homeToken = 0;
  var homeBottomEl = null; // fascia in basso, figlia della schermata (non della lista che scorre)

  function stopHomeTimers() {
    homeToken++;
    homeTimers.forEach(function (timer) {
      if (timer && timer.stop) timer.stop();
      else clearInterval(timer);
    });
    homeTimers = [];
    Home.onState = function () {};
    if (homeBottomEl && homeBottomEl.parentNode) homeBottomEl.parentNode.removeChild(homeBottomEl);
    homeBottomEl = null;
  }

  function showHome() {
    titleEl.textContent = '';
    if (!Home.configured()) {
      showMessage('Home Assistant non è configurato: vai in Impostazioni → Casa e inserisci indirizzo e token.');
      return;
    }
    UI.withLoader(Home.loadStates()).then(function (data) {
      if (state.section !== 'home') return;
      var sensors = data.temps.concat(data.hums);
      var camera = Home.mainCamera();
      if (!camera && !sensors.length && !data.lights.length && !data.scenes.length && !data.climates.length) {
        showMessage('Nessuna telecamera, sensore, luce, scena o climatizzatore trovati in Home Assistant.');
        return;
      }
      var token = homeToken;
      var live = {}; // entity_id -> funzione che aggiorna il riquadro quando arriva un nuovo stato
      UI.clear(itemsEl);
      itemsEl.className = 'items scroll layout-home';
      if (data.scenes.length) {
        homeHeading('Scene');
        homeScenes(data);
      }
      if (data.lights.length) {
        homeHeading('Luci');
        homeLights(data, live);
      }
      if (data.climates.length) {
        homeHeading('Clima');
        homeClimates(data, live);
      }
      homeBottomEl = h('div.home-bottom');
      el.appendChild(homeBottomEl);
      if (sensors.length) {
        var charts = h('div.home-charts');
        homeBottomEl.appendChild(charts);
        homeSensors(sensors, token, live, charts);
      }
      if (camera) homeCamera(camera, data);
      Home.onState = function (s) { if (live[s.entity_id]) live[s.entity_id](s); };
      Nav.focusZone('browse-items');
    }, function (err) {
      if (state.section === 'home') showMessage('Errore Home Assistant: ' + err.message);
    });
  }

  function homeHeading(text) {
    itemsEl.appendChild(h('h3.home-heading', { text: text }));
  }

  function homeTile(extraClass, children) {
    return h('div.home-tile.focusable' + extraClass, { 'data-zone': 'browse-items' }, children);
  }

  /** Anteprima in basso a destra: l'immagine si aggiorna ogni pochi secondi, OK apre lo stream a schermo intero. */
  function homeCamera(camera, data) {
    var token = homeToken;
    var img = h('img.home-cam-img', { alt: '' });
    var tile = homeTile('.home-cam', [img, h('span.home-cam-name', { text: camera.name })]);
    tile.onSelect = function () {
      var list = [camera].concat(data.cameras.filter(function (c) { return c !== camera; }));
      App.show('camera', { camera: camera, list: list });
    };
    homeBottomEl.appendChild(tile);
    var stop = UI.liveImage(img, function () {
      // Con la schermata coperta dal player non si scarica nulla.
      return token === homeToken && el.classList.contains('active') ? Home.cameraUrl(camera, false) : '';
    }, HOME_PREVIEW_MS);
    homeTimers.push({ stop: stop });
    // I token delle immagini ruotano: ogni tanto si rileggono gli stati.
    homeTimers.push(setInterval(function () {
      if (token === homeToken && el.classList.contains('active')) Home.loadStates().then(null, function () { /* si riprova al prossimo giro */ });
    }, HOME_STATES_MS));
  }

  function sensorText(sensor) {
    return sensor.state === 'unavailable' || sensor.state === 'unknown' ? '—' : sensor.state + ' ' + sensor.unit;
  }

  /** Un riquadro per sensore di temperatura o umidità: valore attuale e grafico delle ultime 24 ore. */
  function homeSensors(sensors, token, live, container) {
    var canvases = {};
    sensors.forEach(function (sensor) {
      var valueEl = h('span.home-chart-value', { text: sensorText(sensor) });
      var canvas = h('canvas.home-chart-canvas', { width: 420, height: 130 });
      var tile = homeTile('.home-chart', [
        h('div.home-chart-head', {}, [h('span.home-chart-name', { text: sensor.name }), valueEl]),
        canvas
      ]);
      tile.onSelect = function () { loadCharts(); }; // OK = aggiorna
      canvases[sensor.id] = canvas;
      live[sensor.id] = function (s) {
        sensor.state = s.state;
        valueEl.textContent = sensorText(sensor);
      };
      container.appendChild(tile);
    });
    function loadCharts() {
      Home.history(sensors.map(function (s) { return s.id; }), HOME_CHART_HOURS).then(function (series) {
        if (token !== homeToken) return;
        series.forEach(function (serie) {
          var sensor = sensors.filter(function (s) { return s.id === serie.id; })[0];
          if (sensor && canvases[serie.id]) drawChart(canvases[serie.id], serie.points, sensor.unit);
        });
      }, function (err) {
        if (token === homeToken) UI.toast('Storico non disponibile: ' + err.message);
      });
    }
    loadCharts();
  }

  /** Linea dei valori nel tempo, con minimo/massimo e un'etichetta oraria ogni 6 ore. */
  function drawChart(canvas, points, unit) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h2 = canvas.height;
    var left = 56;
    var bottom = 26;
    ctx.clearRect(0, 0, w, h2);
    ctx.font = '17px sans-serif';
    ctx.fillStyle = '#8a93a8';
    if (points.length < 2) {
      ctx.fillText('Nessun dato nelle ultime ' + HOME_CHART_HOURS + ' ore', 10, h2 / 2);
      return;
    }
    var end = Date.now();
    var start = end - HOME_CHART_HOURS * 3600000;
    var min = Infinity;
    var max = -Infinity;
    points.forEach(function (p) {
      min = Math.min(min, p.v);
      max = Math.max(max, p.v);
    });
    if (max - min < 1) { // curva quasi piatta: scala minima per non ingrandire il rumore
      var mid = (max + min) / 2;
      min = mid - 0.5;
      max = mid + 0.5;
    }
    function x(t) { return left + (t - start) / (end - start) * (w - left - 6); }
    function y(v) { return 8 + (max - v) / (max - min) * (h2 - bottom - 16); }

    ctx.strokeStyle = '#1c2436';
    ctx.lineWidth = 1;
    [min, max].forEach(function (v) {
      ctx.beginPath();
      ctx.moveTo(left, y(v));
      ctx.lineTo(w - 6, y(v));
      ctx.stroke();
      ctx.fillText(v.toFixed(1), 2, y(v) + 6);
    });
    var tick = new Date(start);
    tick.setMinutes(0, 0, 0);
    for (var t = tick.getTime(); t <= end; t += 3600000) {
      if (t < start || new Date(t).getHours() % 6 !== 0 || x(t) + 36 > w) continue;
      ctx.fillText(UI.formatClock(t), x(t) - 20, h2 - 6);
    }
    ctx.strokeStyle = unit === '%' ? '#35c4a6' : '#ff9a3c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    points.forEach(function (p, i) {
      // Il valore resta costante fino alla variazione successiva (andamento a gradini).
      if (i === 0) ctx.moveTo(x(p.t), y(p.v));
      else {
        ctx.lineTo(x(p.t), y(points[i - 1].v));
        ctx.lineTo(x(p.t), y(p.v));
      }
    });
    ctx.lineTo(x(end), y(points[points.length - 1].v));
    ctx.stroke();
  }

  function lightLabel(light) {
    return light.state === 'on' ? 'Accesa' : light.state === 'off' ? 'Spenta' : 'Non disponibile';
  }

  /** Luci: OK accende o spegne; il riquadro giallo indica che è accesa. */
  function homeLights(data, live) {
    data.lights.forEach(function (light) {
      var stateEl = h('span.home-chip-state', { text: lightLabel(light) });
      var tile = homeTile('.home-chip', [h('span.home-chip-name', { text: light.name }), stateEl]);
      function paint() {
        stateEl.textContent = lightLabel(light);
        tile.classList.toggle('light-on', light.state === 'on');
      }
      paint();
      live[light.id] = function (s) {
        light.state = s.state;
        paint();
      };
      tile.onSelect = function () {
        if (light.state !== 'on' && light.state !== 'off') return;
        Home.toggleLight(light).then(paint, function (err) { UI.toast('Luce non raggiunta: ' + err.message); });
      };
      itemsEl.appendChild(tile);
    });
  }

  function climateLabel(climate) {
    if (climate.state === 'unavailable') return 'Non disponibile';
    var parts = [CLIMATE_MODES[climate.state] || climate.state];
    if (climate.state !== 'off' && typeof climate.target === 'number') parts.push('imposta ' + climate.target + '°');
    if (typeof climate.current === 'number') parts.push('ora ' + climate.current + '°');
    return parts.join('  ·  ');
  }

  /** Climatizzatori: OK accende/spegne, CH+ e CH− alzano e abbassano la temperatura impostata. */
  function homeClimates(data, live) {
    data.climates.forEach(function (climate) {
      var stateEl = h('span.home-chip-state', { text: climateLabel(climate) });
      var tile = homeTile('.home-chip.home-climate', [h('span.home-chip-name', { text: climate.name }), stateEl]);
      function paint() {
        stateEl.textContent = climateLabel(climate);
        tile.classList.toggle('climate-on', climate.state !== 'off' && climate.state !== 'unavailable');
      }
      paint();
      live[climate.id] = function (s) {
        var attrs = s.attributes || {};
        climate.state = s.state;
        climate.target = attrs.temperature;
        climate.current = attrs.current_temperature;
        paint();
      };
      tile.onSelect = function () {
        if (climate.state === 'unavailable') return;
        Home.toggleClimate(climate).then(paint, function (err) { UI.toast('Clima non raggiunto: ' + err.message); });
      };
      tile.onChannel = function (direction) {
        if (climate.state === 'off' || climate.state === 'unavailable') return;
        Home.adjustClimate(climate, direction).then(paint, function (err) { UI.toast('Temperatura non cambiata: ' + err.message); });
      };
      itemsEl.appendChild(tile);
    });
  }

  /** Scene: OK le attiva. */
  function homeScenes(data) {
    data.scenes.forEach(function (scene) {
      var tile = homeTile('.home-chip', [h('span.home-chip-name', { text: scene.name }), h('span.home-chip-state', { text: 'Attiva' })]);
      tile.onSelect = function () {
        Home.activateScene(scene).then(function () {
          UI.toast('Scena "' + scene.name + '" attivata');
        }, function (err) { UI.toast('Scena non attivata: ' + err.message); });
      };
      itemsEl.appendChild(tile);
    });
  }

  // ---------- Ricerca ----------

  var searchInput = h('input.focusable.field.search-field', {
    type: 'text', id: 'search-input', placeholder: 'Cerca canali, film, serie…', 'data-zone': 'browse-cats',
    autocomplete: 'off', spellcheck: 'false'
  });
  searchInput.onSelect = function () { searchInput.focus(); };
  searchInput.addEventListener('input', UI.debounce(function () { runSearch(searchInput.value); }, 500));
  searchInput.addEventListener('blur', function () { runSearch(searchInput.value); });

  function showSearch() {
    categoriesEl.appendChild(searchInput);
    categoriesEl.appendChild(h('p.hint', { text: 'Premi OK per scrivere. Almeno 2 lettere.' }));
    state.query = '';
    runSearch(searchInput.value);
  }

  function runSearch(text) {
    var query = String(text || '').trim().toLowerCase();
    if (state.section !== 'search' || query === state.query) return;
    state.query = query;
    if (query.length < 2) {
      renderItems([], 'mixed', '');
      return;
    }
    var token = ++state.renderToken;
    UI.withLoader(Promise.all(['live', 'vod', 'series'].map(function (type) {
      return App.loadSection(type);
    }))).then(function (sections) {
      if (token !== state.renderToken || state.section !== 'search') return;
      var results = [];
      sections.forEach(function (data) {
        for (var i = 0; i < data.items.length && results.length < SEARCH_LIMIT; i++) {
          if (data.items[i].name.toLowerCase().indexOf(query) !== -1) results.push(data.items[i]);
        }
      });
      renderItems(results, 'mixed', results.length + ' risultati per "' + text.trim() + '"');
    }, function (err) {
      showMessage('Errore nella ricerca: ' + err.message);
    });
  }

  // ---------- Impostazioni ----------

  function showSettings() {
    var info = (App.session && App.session.user_info) || {};
    var account = Storage.getAccount() || {};
    titleEl.textContent = 'Impostazioni';

    function infoRow(label, value) {
      return h('div.info-row', {}, [h('span.info-label', { text: label }), h('span.info-value', { text: value })]);
    }

    function settingButton(id, label, onSelect) {
      var button = h('div.button.focusable.setting', { id: id, 'data-zone': 'browse-items', text: label });
      button.onSelect = onSelect;
      return button;
    }

    var formatLabel = function () {
      return 'Formato canali live: ' + (App.settings.liveFormat === 'm3u8' ? 'HLS (m3u8)' : 'MPEG-TS (ts)');
    };
    var formatButton = settingButton('setting-format', formatLabel(), function () {
      App.settings.liveFormat = App.settings.liveFormat === 'm3u8' ? 'ts' : 'm3u8';
      App.saveSettings();
      formatButton.textContent = formatLabel();
    });

    var lastChannelLabel = function () {
      return 'All\'avvio riapri l\'ultimo canale: ' + (App.settings.resumeLastChannel ? 'Sì' : 'No');
    };
    var lastChannelButton = settingButton('setting-last-channel', lastChannelLabel(), function () {
      App.settings.resumeLastChannel = !App.settings.resumeLastChannel;
      App.saveSettings();
      lastChannelButton.textContent = lastChannelLabel();
    });

    var swipeLabel = function () {
      return 'Cambio canale scorrendo sul video: ' + (App.settings.playerSwipe ? 'Sì' : 'No');
    };
    var swipeButton = Platform.isAndroidApp ? settingButton('setting-player-swipe', swipeLabel(), function () {
      App.settings.playerSwipe = !App.settings.playerSwipe;
      App.saveSettings();
      swipeButton.textContent = swipeLabel();
    }) : null;

    var homePanel = Platform.isTV ? homeSettings(settingButton) : [];

    UI.clear(itemsEl);
    itemsEl.className = 'items scroll layout-settings';
    UI.append(itemsEl, [
      h('div.settings-panel', {}, [
        h('h2', { text: 'Account' }),
        infoRow('Server', account.server || ''),
        infoRow('Utente', account.username || ''),
        infoRow('Stato', info.status || ''),
        infoRow('Scadenza', UI.formatDate(info.exp_date)),
        infoRow('Connessioni', (info.active_cons || 0) + ' attive su ' + (info.max_connections || '?')),
        account.insecureTls ? infoRow('Certificato', 'Non valido, accettato per ' + Xtream.hostOf(account.server)) : null,
        h('h2', { text: 'Riproduzione' }),
        formatButton,
        h('p.hint', { text: 'Se un canale non parte, prova a cambiare formato.' }),
        lastChannelButton,
        swipeButton,
        Platform.isTV ? h('div.home-settings', {}, homePanel) : null,
        h('h2', { text: 'Dati' }),
        settingButton('setting-reload', 'Ricarica liste dal server', function () {
          App.clearCache();
          UI.toast('Le liste verranno ricaricate');
        }),
        settingButton('setting-logout', 'Disconnetti account', function () {
          MiniPlayer.close();
          App.logout();
        })
      ])
    ]);
  }

  /** Campi per collegare Home Assistant: indirizzo, token di accesso e abbinamenti sensore -> telecamera. */
  function homeSettings(settingButton) {
    var saved = Storage.getHome();
    function field(id, label, value, placeholder) {
      var input = h('input.focusable.field', {
        type: 'text', id: id, placeholder: placeholder, 'data-zone': 'browse-items',
        autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false'
      });
      input.value = value || '';
      input.onSelect = function () { input.focus(); };
      return h('label.form-row', {}, [h('span.form-label', { text: label }), input]);
    }
    var urlRow = field('home-url', 'Indirizzo', saved.url, 'http://192.168.1.10:8123');
    var tokenRow = field('home-token', 'Token di accesso', saved.token, 'Token di accesso a lunga durata');
    var camerasRow = field('home-cameras', 'Telecamere (facoltativo)', saved.cameras, 'camera.garage');
    var motionRow = field('home-motion', 'Movimento', saved.motion, 'binary_sensor.ingresso=camera.ingresso');
    var save = settingButton('setting-home-save', 'Salva e verifica Casa', function () {
      Storage.setHome({
        url: Home.normalizeUrl(urlRow.lastChild.value),
        token: tokenRow.lastChild.value.trim(),
        motion: motionRow.lastChild.value.trim(),
        cameras: camerasRow.lastChild.value.trim(),
        popup: Home.config().popup
      });
      Home.stop();
      if (!Home.configured()) {
        UI.toast('Inserisci indirizzo e token');
        return;
      }
      UI.withLoader(Home.loadStates()).then(function (data) {
        Home.start();
        UI.toast('Collegato: ' + data.cameras.length + ' telecamere, ' + (data.temps.length + data.hums.length) +
          ' sensori, ' + data.lights.length + ' luci, ' + data.scenes.length + ' scene', 5000);
      }, function (err) { UI.toast('Casa non raggiunta: ' + err.message, 5000); });
    });
    var popupLabel = function () {
      return 'Telecamera in alto a destra quando c\'è movimento: ' + (Home.config().popup ? 'Sì' : 'No');
    };
    var popupButton = settingButton('setting-home-popup', popupLabel(), function () {
      var config = Storage.getHome();
      config.popup = !Home.config().popup;
      Storage.setHome(config);
      popupButton.textContent = popupLabel();
    });
    // Diagnostica: perché il riquadro del movimento compare (o no).
    var diag = h('div.home-diag');
    function diagRow(label, value) {
      return h('div.info-row', {}, [h('span.info-label', { text: label }), h('span.info-value', { text: value })]);
    }
    function renderDiag() {
      var st = Home.status;
      UI.clear(diag);
      UI.append(diag, [
        diagRow('Tempo reale', st.ws + ' · ' + st.events + ' eventi ricevuti'),
        diagRow('Ultimo sensore', st.last || 'nessun cambio ricevuto'),
        diagRow('Ultimo avviso', st.note || '—')
      ]);
    }
    renderDiag();
    var refreshButton = settingButton('setting-home-diag', 'Aggiorna diagnostica', renderDiag);
    var testButton = settingButton('setting-home-test', 'Prova riquadro telecamera', function () {
      UI.withLoader(Home.loadStates()).then(function (data) {
        var camera = Home.mainCamera();
        if (!camera) {
          UI.toast('Nessuna telecamera disponibile');
          return;
        }
        HomePopup.show(camera, true);
        renderDiag();
      }, function (err) { UI.toast('Casa non raggiunta: ' + err.message, 5000); });
    });
    return [
      h('h2', { text: 'Casa (Home Assistant)' }),
      urlRow, tokenRow, camerasRow, motionRow,
      h('p.hint', { text: 'Token: profilo utente di Home Assistant → Sicurezza → Token di accesso a lunga durata. ' +
        'Telecamere: se Home Assistant ne elenca di non funzionanti, scrivi solo quelle da usare (camera.garage). ' +
        'Movimento (facoltativo): sensore=telecamera, separati da ";".' }),
      save,
      popupButton,
      h('h2', { text: 'Diagnostica movimento' }),
      diag, refreshButton, testButton
    ];
  }

  // ---------- Ultimo canale all'avvio ----------

  var lastChannelOpened = false;

  /** All'apertura dell'app riprende l'ultimo canale guardato, nella lista della sua categoria. */
  function openLastChannel() {
    var last = Storage.getLastChannel();
    if (!App.settings.resumeLastChannel || !last) return;
    App.loadSection('live').then(function (data) {
      if (App.current() !== App.screens.browse) return; // l'utente si è già mosso
      var channels = data.items.filter(function (c) { return c.categoryId === last.categoryId; });
      var index = indexOfId(channels, last.id);
      if (index === -1) {
        channels = data.items;
        index = indexOfId(channels, last.id);
      }
      if (index !== -1) App.show('player', { playlist: channels, index: index });
    }, function () { /* lista non disponibile: si resta sulla home */ });
  }

  function indexOfId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
  }

  // ---------- Orologio ----------

  function updateClock() {
    clockEl.textContent = UI.formatClock(Date.now());
  }
  updateClock();
  setInterval(updateClock, 30000);

  // ---------- Registrazione ----------

  App.register('browse', {
    el: el,
    enter: function () {
      if (isTouch() && !Storage.getFlag('touchTips')) {
        Storage.setFlag('touchTips');
        UI.toast('Suggerimento: tieni premuto un contenuto per i preferiti, scorri a destra o sinistra per cambiare sezione', 7000);
      }
      MiniPlayer.onChange = renderMini;
      if (Platform.isTV) Home.start();
      renderMini();
      selectSection('live');
      Nav.focus(tabsEl.firstChild);
      if (!lastChannelOpened) {
        lastChannelOpened = true;
        openLastChannel();
      }
    },
    resume: function () {
      renderMini();
      // "Continua a guardare" va ricalcolato dopo la visione (posizioni nuove o contenuti finiti).
      if (state.section === 'favorites' && state.categoryId === 'continue') {
        state.categoryId = null;
        showFavorites('continue');
        Nav.focusZone('browse-items') || Nav.focusZone('browse-cats');
      }
      // Aggiorna le stelle dei preferiti (potrebbero essere cambiate nel dettaglio o nel player).
      Array.prototype.forEach.call(itemsEl.children, function (itemEl) {
        if (itemEl.item) itemEl.classList.toggle('is-favorite', Storage.isFavorite(itemEl.item.type, itemEl.item.id));
      });
    },
    handleKey: function (action) {
      if ((action === 'chup' || action === 'chdown') && Nav.current && Nav.current.onChannel) {
        Nav.current.onChannel(action === 'chup' ? 1 : -1); // clima: CH+ / CH- cambiano la temperatura impostata
        return true;
      }
      if (action === 'red' && Nav.current && Nav.current.item) {
        toggleFavorite(Nav.current);
        return true;
      }
      // Riquadro: PLAY lo riporta a schermo intero, STOP lo chiude.
      if (MiniPlayer.active && (action === 'play' || action === 'playpause')) {
        MiniPlayer.expand();
        return true;
      }
      if (MiniPlayer.active && action === 'stop') {
        MiniPlayer.close();
        return true;
      }
      // INDIETRO risale: contenuti -> categorie -> tab -> (doppia pressione) uscita.
      if (action === 'back' && Nav.current) {
        var zone = Nav.current.getAttribute('data-zone');
        if (zone === 'browse-items' && Nav.focusZone('browse-cats')) return true;
        if (zone !== 'browse-tabs') return Nav.focusZone('browse-tabs');
      }
      // Dalle tab, INDIETRO chiude prima il riquadro e solo dopo propone l'uscita.
      if (action === 'back' && MiniPlayer.active) {
        MiniPlayer.close();
        return true;
      }
      return false;
    }
  });
})(this);
