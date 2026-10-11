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

  function favKey(type, id) {
    return type + ':' + id;
  }

  var Storage = {
    getAccount: function () { return read('account', null); },
    setAccount: function (account) { write('account', account); },
    clearAccount: function () { remove('account'); },

    /** Indicatori "già fatto" (es. suggerimento mostrato una volta). */
    getFlag: function (name) { return !!read('flag.' + name, false); },
    setFlag: function (name) { write('flag.' + name, true); },

    getSettings: function () {
      var settings = read('settings', {});
      return { liveFormat: settings.liveFormat || 'ts' };
    },
    setSettings: function (settings) { write('settings', settings); },

    /** Preferiti: lista ordinata di snapshot {type, id, name, icon, ...} per mostrarli senza ricaricare. */
    getFavorites: function () { return read('favorites', []); },
    isFavorite: function (type, id) {
      var key = favKey(type, id);
      return this.getFavorites().some(function (f) { return favKey(f.type, f.id) === key; });
    },
    /** Aggiunge o rimuove; restituisce true se ora è tra i preferiti. */
    toggleFavorite: function (item) {
      var key = favKey(item.type, item.id);
      var favorites = this.getFavorites();
      var filtered = favorites.filter(function (f) { return favKey(f.type, f.id) !== key; });
      var added = filtered.length === favorites.length;
      if (added) filtered.push(item);
      write('favorites', filtered);
      return added;
    },

    /** Posizioni di ripresa per film ed episodi, in secondi. */
    getResume: function (key) {
      var entry = read('resume', {})[key];
      return entry ? entry.position : 0;
    },
    setResume: function (key, position, duration) {
      var all = read('resume', {});
      // Quasi finito (o troppo all'inizio): non serve ricordare la posizione.
      if (position < 30 || (duration && position > duration * 0.95)) {
        delete all[key];
      } else {
        all[key] = { position: Math.floor(position), at: Date.now() };
      }
      var keys = Object.keys(all);
      if (keys.length > MAX_RESUME_ENTRIES) {
        keys.sort(function (a, b) { return all[a].at - all[b].at; });
        keys.slice(0, keys.length - MAX_RESUME_ENTRIES).forEach(function (k) { delete all[k]; });
      }
      write('resume', all);
    }
  };

  root.Storage = Storage;
})(this);
