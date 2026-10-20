/*
 * Persistenza locale (localStorage): account, impostazioni, preferiti, posizioni di ripresa.
 */
(function (root) {
  'use strict';

  var PREFIX = 'xtreamtv.';
  var MAX_RESUME_ENTRIES = 200;

  function read(key, fallback) {
    try {
      var raw = root.localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      root.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      // Spazio esaurito o storage non disponibile: l'app continua a funzionare senza persistenza.
    }
  }

  function remove(key) {
    try { root.localStorage.removeItem(PREFIX + key); } catch (e) { /* ignorato */ }
  }

  var favIndex = null; // cache di isFavorite, azzerata a ogni modifica

  function favKey(type, id) {
    return type + ':' + id;
  }

  var Storage = {
    getAccount: function () { return read('account', null); },
    setAccount: function (account) { write('account', account); },
    clearAccount: function () { remove('account'); },

    /** Collegamento a Home Assistant (solo TV): {url, token, motion}, inserito dall'utente nelle Impostazioni. */
    getHome: function () { return read('home', {}); },
    setHome: function (home) { write('home', home); },

    /** Indicatori "già fatto" (es. suggerimento mostrato una volta). */
    getFlag: function (name) { return !!read('flag.' + name, false); },
    setFlag: function (name) { write('flag.' + name, true); },

    getSettings: function () {
      var settings = read('settings', {});
      return {
        liveFormat: settings.liveFormat || 'ts',
        // Sezione all'apertura: 'launcher' = Home a riquadri (solo TV), 'last' = ultima usata.
        startSection: settings.startSection || 'launcher',
        resumeLastChannel: settings.resumeLastChannel !== false,
        playerSwipe: settings.playerSwipe === true, // app Android: cambio canale scorrendo sul video
        screensaverMin: typeof settings.screensaverMin === 'number' ? settings.screensaverMin : 5, // 0 = mai
        followTerms: settings.followTerms || '' // "Le tue partite": parole da cercare nella guida
      };
    },
    setSettings: function (settings) { write('settings', settings); },

    /** Preferiti: lista ordinata di snapshot {type, id, name, icon, ...} per mostrarli senza ricaricare. */
    getFavorites: function () { return read('favorites', []); },
    isFavorite: function (type, id) {
      // Indice in memoria: renderizzare centinaia di righe non rilegge e riparsa il JSON a ogni riga.
      if (!favIndex) {
        favIndex = {};
        this.getFavorites().forEach(function (f) { favIndex[favKey(f.type, f.id)] = true; });
      }
      return favIndex[favKey(type, id)] === true;
    },
    /** Aggiunge o rimuove; restituisce true se ora è tra i preferiti. */
    toggleFavorite: function (item) {
      var key = favKey(item.type, item.id);
      var favorites = this.getFavorites();
      var filtered = favorites.filter(function (f) { return favKey(f.type, f.id) !== key; });
      var added = filtered.length === favorites.length;
      if (added) filtered.push(item);
      write('favorites', filtered);
      favIndex = null;
      return added;
    },

    /** Posizioni di ripresa per film ed episodi, in secondi. */
    getResume: function (key) {
      var entry = read('resume', {})[key];
      return entry ? entry.position : 0;
    },
    /** @param {Object} [item] snapshot del contenuto, per elencarlo in "Continua a guardare" */
    setResume: function (key, position, duration, item) {
      var all = read('resume', {});
      // Quasi finito (o troppo all'inizio): non serve ricordare la posizione.
      if (position < 30 || (duration && position > duration * 0.95)) {
        delete all[key];
      } else {
        var previous = all[key] || {};
        all[key] = {
          position: Math.floor(position), duration: Math.floor(duration || previous.duration || 0),
          at: Date.now(), item: item || previous.item
        };
      }
      var keys = Object.keys(all);
      if (keys.length > MAX_RESUME_ENTRIES) {
        keys.sort(function (a, b) { return all[a].at - all[b].at; });
        keys.slice(0, keys.length - MAX_RESUME_ENTRIES).forEach(function (k) { delete all[k]; });
      }
      write('resume', all);
    },

    /** Film ed episodi lasciati a metà, dal più recente: [{item, position, duration}]. */
    getContinueWatching: function (limit) {
      var all = read('resume', {});
      return Object.keys(all)
        .filter(function (k) { return all[k].item; })
        .sort(function (a, b) { return all[b].at - all[a].at; })
        .slice(0, limit || 40)
        .map(function (k) { return { item: all[k].item, position: all[k].position, duration: all[k].duration }; });
    },

    /** "Le tue partite": ultima ricerca nella guida {at, terms, items: [{title, start, end, channels}]}. */
    getMatches: function () { return read('matches', {}); },
    setMatches: function (matches) { write('matches', matches); },

    /** Ultimo canale live guardato (snapshot), per riaprirlo all'avvio. */
    getLastChannel: function () { return read('lastChannel', null); },
    setLastChannel: function (item) { write('lastChannel', item); },

    /** Ultima sezione aperta (Live TV, Preferiti...), per "Apri all'avvio: Ultima sezione usata". */
    getLastSection: function () { return read('lastSection', 'live'); },
    setLastSection: function (section) { write('lastSection', section); }
  };

  root.Storage = Storage;
})(this);
