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
    { id: 'vod', label: 'Film' },
    { id: 'series', label: 'Serie TV' },
    { id: 'favorites', label: 'Preferiti' },
    { id: 'search', label: 'Cerca' },
    { id: 'settings', label: 'Impostazioni' }
  ];
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

  // ---------- Scorrimento a destra/sinistra sulla lista: sezione successiva/precedente ----------

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
    // Solo gesti chiaramente orizzontali: lo scorrimento verticale della lista non cambia sezione.
    if (!quick || Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 2) return;
    var ids = TABS.map(function (t) { return t.id; });
    var next = ids[ids.indexOf(state.section) + (dx < 0 ? 1 : -1)];
    if (!next) return;
    selectSection(next);
    Nav.focus(tabsEl.querySelector('[data-tab="' + next + '"]'));
  }, { passive: true });

  function selectSection(section) {
    state.section = section;
    state.categoryId = null;
    markActiveTab();
    el.classList.toggle('no-categories', section === 'settings');
    Nav.forgetZone('browse-cats');
    Nav.forgetZone('browse-items');
    UI.clear(categoriesEl);
    renderItems([], 'list', '');

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
      categoriesEl.appendChild(catEl);
    });
  }

  function markActiveCategory() {
    Array.prototype.forEach.call(categoriesEl.children, function (catEl) {
      catEl.classList.toggle('selected', catEl.getAttribute('data-category') === state.categoryId);
    });
  }

  function showCatalog(type) {
    UI.withLoader(App.loadSection(type)).then(function (data) {
      if (state.section !== type) return;
      var counts = {};
      data.items.forEach(function (item) {
        counts[item.categoryId] = (counts[item.categoryId] || 0) + 1;
      });
      var layout = type === 'live' ? 'list' : 'grid';
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
      if (state.section === type) showMessage('Errore nel caricamento: ' + err.message);
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
    if (title && !items.length) showMessage('Nessun contenuto');
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
    var fav = Storage.isFavorite(item.type, item.id);
    var itemEl;
    if (state.layout === 'grid') {
      itemEl = h('div.card.focusable', {}, [
        h('div.poster', {}, [UI.img(item.icon, 'poster-img'), h('span.poster-fallback', { text: item.name })]),
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
    App.client.getShortEpg(id, 2).then(function (list) {
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
      if (rowEl.item && rowEl.item.type === 'live' && (id === undefined || rowEl.item.id === id)) updateRowEpg(rowEl);
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
    refreshEpgViews();
    Array.prototype.forEach.call(itemsEl.children, function (rowEl) {
      if (rowEl.item && rowEl.item.type === 'live') requestEpg(rowEl.item.id);
    });
  }, 60000);

  function showMessage(text) {
    UI.clear(itemsEl);
    itemsEl.appendChild(h('p.empty', { text: text }));
  }

  function openItem(item) {
    if (item.type === 'live') {
      var channels = state.items.filter(function (i) { return i.type === 'live'; });
      App.show('player', { playlist: channels, index: channels.indexOf(item) });
    } else {
      MiniPlayer.close(); // film e serie si guardano a schermo intero: niente canale in sottofondo
      App.show('detail', { item: item });
    }
  }

  function toggleFavorite(itemEl) {
    var item = itemEl.item;
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

  function showFavorites(selectedType) {
    var favorites = Storage.getFavorites();
    var categories = ['live', 'vod', 'series'].map(function (type) {
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
    });
    renderCategories(categories);
    var initial = categories.filter(function (c) { return c.id === selectedType; })[0] ||
      categories.filter(function (c) { return c.count; })[0] || categories[0];
    initial.select();
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
      renderMini();
      selectSection('live');
      Nav.focus(tabsEl.firstChild);
    },
    resume: function () {
      renderMini();
      // Aggiorna le stelle dei preferiti (potrebbero essere cambiate nel dettaglio o nel player).
      Array.prototype.forEach.call(itemsEl.children, function (itemEl) {
        if (itemEl.item) itemEl.classList.toggle('is-favorite', Storage.isFavorite(itemEl.item.type, itemEl.item.id));
      });
    },
    handleKey: function (action) {
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
