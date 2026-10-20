/*
 * "Le tue partite": cerca nella guida TV le parole scelte nelle Impostazioni (squadre, piloti, tornei)
 * e avvisa poco prima dell'inizio.
 *
 * Si guardano solo i canali preferiti e quelli delle categorie sportive, un feed per canale
 * (gli altri feed con lo stesso nome si aggiungono ai risultati), una richiesta alla volta:
 * il server non si accorge della ricerca, nemmeno mentre si guarda un canale.
 *
 * Le funzioni pure (parseTerms, findMatches, whenLabel) si esportano anche come modulo CommonJS per i test.
 */
(function (root) {
  'use strict';

  var SCAN_EVERY_MS = 3 * 3600000;
  var GAP_MS = 1500; // pausa tra due canali
  var WATCHING_WAIT_MS = 30000; // mentre si guarda un canale la ricerca si ferma e riprende a fine visione
  var EPG_LIMIT = 20; // programmi per canale: circa un giorno sui canali sportivi
  var MAX_CHANNELS = 80;
  var HORIZON_MS = 48 * 3600000;
  var ALERT_BEFORE_MS = 10 * 60000;
  var ALERT_SHOW_MS = 30000;
  var SPORT_CATEGORY = /sport|calcio|football|soccer|dazn|eurosport|champions|serie a|tennis|motor|formula|f1|motogp|basket|nba/i;
  var DAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

  var MERGE_MS = 15 * 60000; // partenze così vicine = la stessa partita

  function fold(text) {
    var s = String(text || '').toLowerCase();
    // Senza accenti: "Atlético" trova "atletico". normalize esiste da Chromium 34.
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s;
  }

  /** "Inter, Sinner; F1" -> ['inter', 'sinner', 'f1'] (separatori: , ; a capo). */
  function parseTerms(text) {
    return String(text || '').split(/[,;\n]/).map(function (t) { return fold(t).trim(); }).filter(Boolean);
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Parola intera: "Inter" non deve trovare "Internazionali" né "F1" trovare "F1000". */
  function termMatcher(terms) {
    if (!terms.length) return function () { return false; };
    var pattern = new RegExp('(^|[^a-z0-9])(' + terms.map(escapeRegExp).join('|') + ')(?=$|[^a-z0-9])');
    return function (title) { return pattern.test(fold(title)); };
  }

  /** Le parole dell'utente che compaiono nel titolo, ordinate: "psg|barcellona". */
  function termsIn(title, terms) {
    var found = terms.filter(function (t) { return termMatcher([t])(title); });
    return found.sort().join('|');
  }

  /** Parole del titolo (almeno 3 lettere) tolte le parole dell'utente: "psg - barcellona" -> ['barcellona']. */
  function titleWords(title, hits) {
    var skip = hits.split(/[| ]/);
    return fold(title).split(/[^a-z0-9]+/).filter(function (w) { return w.length > 2 && skip.indexOf(w) === -1; });
  }

  function shareTerm(a, b) {
    var bs = b.split('|');
    return a.split('|').some(function (t) { return bs.indexOf(t) !== -1; });
  }

  /** Stessa partita scritta in modo diverso: partenza entro 15 minuti, una parola dell'utente in comune, una parola del titolo in comune. */
  function sameProgram(m, p, hits, words) {
    if (m.start === p.start && fold(m.title).trim() === fold(p.title).trim()) return true;
    if (Math.abs(m.start - p.start) > MERGE_MS || !shareTerm(m.hits, hits)) return false;
    return words.some(function (w) { return m.words.indexOf(w) !== -1; });
  }

  /**
   * @param {Array<{channels: Array, epg: Array}>} scanned un elemento per canale (con i suoi feed alternativi)
   * @returns {Array<{title, start, end, channels}>} programmi che contengono una delle parole, dal più vicino;
   *   lo stesso programma alla stessa ora su più canali diventa una riga sola.
   */
  function findMatches(scanned, terms, now) {
    var matches = termMatcher(terms);
    var list = [];
    scanned.forEach(function (entry) {
      entry.epg.forEach(function (p) {
        if (p.end <= now || p.start > now + HORIZON_MS || !matches(p.title)) return;
        var hits = termsIn(p.title, terms);
        var words = titleWords(p.title, hits);
        var match = null;
        list.forEach(function (m) {
          if (!match && sameProgram(m, p, hits, words)) match = m;
        });
        if (!match) {
          match = { title: p.title, start: p.start, end: p.end, channels: [], hits: hits, words: words };
          list.push(match);
        }
        entry.channels.forEach(function (ch) {
          if (!match.channels.some(function (c) { return c.id === ch.id; })) match.channels.push(ch);
        });
      });
    });
    list.forEach(function (m) { delete m.hits; delete m.words; });
    return list.sort(function (a, b) { return a.start - b.start; });
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /** "In onda", "Oggi 20:45", "Domani 18:00", "Sab 15:00". */
  function whenLabel(match, now) {
    if (match.start <= now) return 'In onda';
    var d = new Date(match.start);
    var time = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    var today = new Date(now);
    today.setHours(0, 0, 0, 0);
    var days = Math.floor((match.start - today.getTime()) / 86400000);
    return (days === 0 ? 'Oggi' : days === 1 ? 'Domani' : DAYS[d.getDay()]) + ' ' + time;
  }

  /** Nomi dei canali da mostrare: "Sky Sport Uno, DAZN 1" (al massimo tre). */
  function channelNames(match) {
    var names = [];
    match.channels.forEach(function (ch) {
      if (names.indexOf(ch.name) === -1) names.push(ch.name);
    });
    return names.slice(0, 3).join(', ') + (names.length > 3 ? '…' : '');
  }

  var pure = { parseTerms: parseTerms, findMatches: findMatches, whenLabel: whenLabel, channelNames: channelNames };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = pure;
    return;
  }

  // ---------- Nell'app ----------

  var doc = root.document;
  var scanning = false;
  var alertEl = doc.getElementById('match-alert');
  var alertTitle = alertEl.querySelector('.match-alert-title');
  var alertText = alertEl.querySelector('.match-alert-text');
  var alertMatch = null;
  var alertTimer = null;
  var alerted = {}; // partite già annunciate (titolo|inizio)

  function saved() {
    return Storage.getMatches();
  }

  function snapshot(ch) {
    return { type: 'live', id: ch.id, name: ch.name, icon: ch.icon || '', num: ch.num, categoryId: ch.categoryId };
  }

  /** Canali da guardare: preferiti prima, poi categorie sportive; un solo feed per nome. */
  function candidates(data) {
    var favoriteIds = {};
    Storage.getFavorites().forEach(function (f) { if (f.type === 'live') favoriteIds[f.id] = true; });
    var sportCategories = {};
    data.categories.forEach(function (c) { if (SPORT_CATEGORY.test(c.name)) sportCategories[c.id] = true; });
    var groups = [];
    var byKey = {};
    function add(ch) {
      var key = Xtream.channelKey(ch.name) || ch.id;
      if (byKey[key]) {
        if (byKey[key].indexOf(ch) === -1) byKey[key].push(ch);
        return;
      }
      byKey[key] = [ch];
      groups.push(byKey[key]);
    }
    data.items.forEach(function (ch) { if (favoriteIds[ch.id]) add(ch); });
    data.items.forEach(function (ch) { if (sportCategories[ch.categoryId]) add(ch); });
    // Feed alternativi anche fuori dalle categorie sportive (es. la riserva in "Italia").
    data.items.forEach(function (ch) {
      var group = byKey[Xtream.channelKey(ch.name)];
      if (group && group.indexOf(ch) === -1) group.push(ch);
    });
    return groups.slice(0, MAX_CHANNELS);
  }

  /** Nuovi risultati: la Home e le Impostazioni si aggiornano ascoltando 'matcheschange' su document. */
  function changed() {
    doc.dispatchEvent(new root.CustomEvent('matcheschange'));
  }

  var Matches = {
    gapMs: GAP_MS,

    terms: function () {
      return parseTerms(App.settings.followTerms);
    },

    /** Partite non ancora finite, dalla più vicina. */
    list: function () {
      var now = Date.now();
      return (saved().items || []).filter(function (m) { return m.end > now; });
    },

    lastScan: function () {
      return saved().at || 0;
    },

    isScanning: function () {
      return scanning;
    },

    /** Rilegge la guida dei canali; con `force` anche se l'ultima ricerca è recente. */
    refresh: function (force) {
      var terms = this.terms();
      var last = saved();
      if (scanning || !App.client || !terms.length) return;
      // Mai richieste in più al server mentre si guarda un canale (la partita!): si rimanda a dopo.
      if (Player.url && !force) return;
      if (!force && last.terms === terms.join(',') && Date.now() - (last.at || 0) < SCAN_EVERY_MS) return;
      scanning = true;
      App.loadSection('live').then(function (data) {
        var groups = candidates(data);
        var scanned = [];
        var client = App.client;
        function step(i) {
          if (App.client !== client) { // disconnesso o cambiato account
            scanning = false;
            return;
          }
          if (Player.url) { // si è aperto un canale a ricerca in corso: pausa finché non si smette
            setTimeout(function () { step(i); }, WATCHING_WAIT_MS);
            return;
          }
          if (i >= groups.length) {
            scanning = false;
            Storage.setMatches({
              at: Date.now(), terms: terms.join(','),
              items: findMatches(scanned, terms, Date.now()).map(function (m) {
                return { title: m.title, start: m.start, end: m.end, channels: m.channels.map(snapshot) };
              })
            });
            changed();
            return;
          }
          client.getShortEpg(groups[i][0].id, EPG_LIMIT).then(function (epg) {
            scanned.push({ channels: groups[i], epg: epg });
          }, function () { /* canale senza guida */ }).then(function () {
            setTimeout(function () { step(i + 1); }, Matches.gapMs);
          });
        }
        step(0);
      }, function () { scanning = false; });
    },

    /** Apre la partita sul primo canale; gli altri feed restano a portata di ▲/▼ e del recupero automatico. */
    watch: function (match) {
      var current = App.current();
      if (current === App.screens.player) App.back();
      if (App.current() === App.screens.player) return; // non si è potuto chiudere
      App.show('player', { playlist: match.channels, index: 0 });
    }
  };

  // ---------- Avviso poco prima dell'inizio ----------

  function hideAlert() {
    alertMatch = null;
    clearTimeout(alertTimer);
    alertEl.classList.remove('visible');
  }

  function watchingIt(match) {
    var item = MiniPlayer.item() || (App.current() === App.screens.player && App.screens.player.item && App.screens.player.item());
    return !!item && match.channels.some(function (ch) { return ch.id === item.id; });
  }

  function checkAlerts() {
    if (!App.client || alertMatch) return;
    var now = Date.now();
    Matches.list().some(function (match) {
      var key = match.title + '|' + match.start;
      if (alerted[key] || match.start - now > ALERT_BEFORE_MS || now - match.start > 60000) return false;
      alerted[key] = true;
      if (watchingIt(match)) return false;
      alertMatch = match;
      var minutes = Math.max(1, Math.round((match.start - now) / 60000));
      alertTitle.textContent = match.title;
      alertText.textContent = (match.start > now ? 'Tra ' + minutes + (minutes === 1 ? ' minuto' : ' minuti') : 'Inizia ora') +
        ' su ' + channelNames(match) + '  ·  OK per guardarla';
      alertEl.classList.add('visible');
      clearTimeout(alertTimer);
      alertTimer = setTimeout(hideAlert, ALERT_SHOW_MS);
      return true;
    });
  }

  /** Con l'avviso a schermo OK apre la partita e INDIETRO lo chiude; gli altri tasti restano alla schermata. */
  Matches.handleKey = function (action) {
    if (!alertMatch) return false;
    if (action === 'enter') {
      var match = alertMatch;
      hideAlert();
      Matches.watch(match);
      return true;
    }
    if (action === 'back') {
      hideAlert();
      return true;
    }
    return false;
  };
  alertEl.addEventListener('click', function () { Matches.handleKey('enter'); });

  setInterval(function () {
    checkAlerts();
    Matches.refresh(false);
  }, 30000);

  Matches.alertNow = checkAlerts; // per i test
  root.Matches = Matches;
  Object.keys(pure).forEach(function (k) { Matches[k] = pure[k]; });
})(this);
