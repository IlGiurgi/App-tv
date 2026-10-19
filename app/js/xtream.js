/*
 * Client per le API Xtream Codes (player_api.php).
 * Codice ES2015 senza async/await: Tizen 3.0 usa Chromium 47.
 * Esportato come modulo CommonJS (per i test in Node) o come window.Xtream.
 */
(function (root) {
  'use strict';

  var DEFAULT_TIMEOUT = 20000;

  /** Normalizza l'indirizzo del server: aggiunge http://, rimuove slash finali e path di player_api/get.php. */
  function normalizeServer(input) {
    var url = String(input || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
    url = url.replace(/\/(player_api|get|xmltv)\.php.*$/i, '');
    return url.replace(/\/+$/, '');
  }

  /** Lo stesso server con l'altro protocollo (https <-> http): molti provider ne supportano uno solo per porta. */
  function alternateServer(input) {
    var url = normalizeServer(input);
    if (/^https:/i.test(url)) return url.replace(/^https:/i, 'http:');
    if (/^http:/i.test(url)) return url.replace(/^http:/i, 'https:');
    return '';
  }

  /**
   * Dal link completo della lista (".../get.php?username=U&password=P&type=m3u...") o di player_api.php
   * estrae {server, username, password}; null se il testo non contiene utente e password.
   */
  function parseAccountUrl(input) {
    var text = String(input || '').trim();
    var query = text.split('?')[1];
    if (!query) return null;
    var params = {};
    query.split('#')[0].split('&').forEach(function (pair) {
      var eq = pair.indexOf('=');
      if (eq <= 0) return;
      try {
        params[pair.slice(0, eq).toLowerCase()] = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
      } catch (e) { /* parametro con codifica non valida: ignorato */ }
    });
    if (!params.username || !params.password) return null;
    return { server: normalizeServer(text.split('?')[0]), username: params.username, password: params.password };
  }

  /** Nome del server senza protocollo, porta e percorso ("server.esempio.com"). */
  function hostOf(input) {
    var match = /^https?:\/\/([^\/:?#]+)/i.exec(normalizeServer(input));
    return match ? match[1].toLowerCase() : '';
  }

  function enc(value) {
    return encodeURIComponent(String(value));
  }

  /** Decodifica testo base64 UTF-8 (usato dall'EPG Xtream). Restituisce il testo originale se non è base64. */
  function decodeBase64(text) {
    if (!text) return '';
    try {
      var binary = typeof atob === 'function'
        ? atob(text)
        : Buffer.from(text, 'base64').toString('binary');
      var bytes = '';
      for (var i = 0; i < binary.length; i++) {
        bytes += '%' + ('0' + binary.charCodeAt(i).toString(16)).slice(-2);
      }
      return decodeURIComponent(bytes);
    } catch (e) {
      return text;
    }
  }

  /** Gli episodi possono arrivare come oggetto {"1": [...]} o come array di array: li riportiamo a {numStagione: [...]}. */
  function normalizeEpisodes(episodes) {
    var out = {};
    if (!episodes) return out;
    if (Array.isArray(episodes)) {
      episodes.forEach(function (list) {
        if (!Array.isArray(list)) list = [list];
        list.forEach(function (ep) {
          var season = String(ep.season || 1);
          (out[season] = out[season] || []).push(ep);
        });
      });
    } else {
      Object.keys(episodes).forEach(function (season) {
        var list = episodes[season];
        out[String(season)] = Array.isArray(list) ? list : [list];
      });
    }
    Object.keys(out).forEach(function (season) {
      out[season].sort(function (a, b) {
        return (Number(a.episode_num) || 0) - (Number(b.episode_num) || 0);
      });
    });
    return out;
  }

  function sortedSeasonNumbers(episodes) {
    return Object.keys(episodes).sort(function (a, b) { return Number(a) - Number(b); });
  }

  /** Richiesta GET JSON via XMLHttpRequest (supporta timeout, a differenza di fetch). */
  function xhrJson(url, timeout) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = timeout || DEFAULT_TIMEOUT;
      xhr.onload = function () {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error('Errore HTTP ' + xhr.status));
          return;
        }
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (e) {
          reject(new Error('Risposta non valida dal server'));
        }
      };
      xhr.onerror = function () {
        var err = new Error('Impossibile contattare il server (' + url.split('/player_api.php')[0] + ')');
        err.network = true; // nessuna risposta: rete, certificato, CORS o contenuto misto
        reject(err);
      };
      xhr.ontimeout = function () { reject(new Error('Timeout della richiesta')); };
      xhr.send();
    });
  }

  /**
   * @param {{server: string, username: string, password: string}} account
   * @param {function(string): Promise} [request] funzione HTTP iniettabile (test)
   */
  function XtreamClient(account, request) {
    this.server = normalizeServer(account.server);
    this.username = account.username;
    this.password = account.password;
    this.request = request || xhrJson;
  }

  XtreamClient.prototype.apiUrl = function (action, params) {
    var url = this.server + '/player_api.php?username=' + enc(this.username) +
      '&password=' + enc(this.password);
    if (action) url += '&action=' + enc(action);
    Object.keys(params || {}).forEach(function (key) {
      url += '&' + enc(key) + '=' + enc(params[key]);
    });
    return url;
  };

  XtreamClient.prototype.call = function (action, params) {
    return this.request(this.apiUrl(action, params));
  };

  /** Login: restituisce {user_info, server_info} o rifiuta con un messaggio leggibile. */
  XtreamClient.prototype.authenticate = function () {
    return this.call().then(function (data) {
      var info = data && data.user_info;
      if (!info || Number(info.auth) !== 1) throw new Error('Credenziali non valide');
      if (info.status && info.status !== 'Active') throw new Error('Account non attivo (' + info.status + ')');
      return data;
    });
  };

  function asArray(data) {
    return Array.isArray(data) ? data : [];
  }

  XtreamClient.prototype.getCategories = function (type) {
    var action = { live: 'get_live_categories', vod: 'get_vod_categories', series: 'get_series_categories' }[type];
    return this.call(action).then(asArray);
  };

  XtreamClient.prototype.getStreams = function (type) {
    var action = { live: 'get_live_streams', vod: 'get_vod_streams', series: 'get_series' }[type];
    return this.call(action).then(asArray);
  };

  XtreamClient.prototype.getVodInfo = function (vodId) {
    return this.call('get_vod_info', { vod_id: vodId });
  };

  XtreamClient.prototype.getSeriesInfo = function (seriesId) {
    return this.call('get_series_info', { series_id: seriesId }).then(function (data) {
      data = data || {};
      data.episodes = normalizeEpisodes(data.episodes);
      return data;
    });
  };

  /** EPG breve: [{title, description, start, end}] con testi già decodificati e orari in ms. */
  XtreamClient.prototype.getShortEpg = function (streamId, limit) {
    return this.call('get_short_epg', { stream_id: streamId, limit: limit || 2 }).then(function (data) {
      return asArray(data && data.epg_listings).map(function (item) {
        return {
          title: decodeBase64(item.title),
          description: decodeBase64(item.description),
          start: Number(item.start_timestamp) * 1000,
          end: Number(item.stop_timestamp) * 1000
        };
      });
    });
  };

  XtreamClient.prototype.liveUrl = function (streamId, format) {
    return this.server + '/live/' + enc(this.username) + '/' + enc(this.password) + '/' +
      streamId + '.' + (format || 'ts');
  };

  XtreamClient.prototype.vodUrl = function (streamId, extension) {
    return this.server + '/movie/' + enc(this.username) + '/' + enc(this.password) + '/' +
      streamId + '.' + (extension || 'mp4');
  };

  XtreamClient.prototype.episodeUrl = function (episodeId, extension) {
    return this.server + '/series/' + enc(this.username) + '/' + enc(this.password) + '/' +
      episodeId + '.' + (extension || 'mp4');
  };

  // Sigle che distinguono feed e qualità dello stesso canale ("Sky Sport Uno FHD", "Sky Sport Uno HD backup").
  var FEED_TAGS = /\b(?:sd|hd|fhd|uhd|hq|lq|4k|8k|hevc|h\.?26[45]|\d{3,4}p|\d{2}\s?fps|fps|backup|bkp?|alt|raw|multi(?:audio)?)\b/g;

  /** Nome del canale senza prefisso di paese, sigle di qualità e simboli: uguale per i feed dello stesso canale. */
  function channelKey(name) {
    return String(name || '').toLowerCase()
      .replace(/^\s*[[(|]?\s*[a-z]{2,3}\s*[\])|:]\s*/, '') // "IT: ", "[IT] ", "|IT| "
      .replace(/[[(][^\])]*[\])]/g, ' ') // "(backup)", "[HEVC]", "(2)"
      .replace(/[\u00b2-\u00b3\u1d00-\u1dbf\u2070-\u209f]/g, ' ') // ᴴᴰ, ⁴ᴷ e simili
      .replace(FEED_TAGS, ' ')
      .replace(/[^a-z0-9\u00e0-\u00ff]+/g, ' ')
      .trim();
  }

  /** Altri canali live con lo stesso nome (feed alternativi), nell'ordine della lista, al massimo `limit`. */
  function findAlternates(item, items, limit) {
    var key = channelKey(item.name);
    if (!key) return [];
    return items.filter(function (other) {
      return other.id !== item.id && channelKey(other.name) === key;
    }).slice(0, limit || 3);
  }

  var Xtream = {
    Client: XtreamClient,
    channelKey: channelKey,
    findAlternates: findAlternates,
    normalizeServer: normalizeServer,
    alternateServer: alternateServer,
    hostOf: hostOf,
    parseAccountUrl: parseAccountUrl,
    decodeBase64: decodeBase64,
    normalizeEpisodes: normalizeEpisodes,
    sortedSeasonNumbers: sortedSeasonNumbers
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Xtream;
  else root.Xtream = Xtream;
})(this);
