#!/usr/bin/env node
/*
 * Server di sviluppo: serve l'app (cartella app/) e simula un server Xtream Codes.
 *
 *   node dev/mock-server.js [porta]
 *   poi apri http://localhost:8080 e accedi con server http://localhost:8080, utente demo, password demo
 */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

var PORT = Number(process.argv[2] || process.env.PORT || 8080);
var APP_DIR = path.join(__dirname, '..', 'app');
var USER = 'demo';
var PASS = 'demo';

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml'
};

// ---------- Dati finti ----------

var LIVE_CATEGORIES = ['Italia', 'Sport', 'News', 'Bambini', 'Documentari'];
var VOD_CATEGORIES = ['Azione', 'Commedia', 'Drammatici'];
var SERIES_CATEGORIES = ['Crime', 'Fantascienza'];

function image(label, n) {
  return '/mock-img/' + n + '.svg?label=' + encodeURIComponent(label);
}

var live = [];
for (var i = 1; i <= 260; i++) {
  var liveCat = (i - 1) % LIVE_CATEGORIES.length;
  live.push({
    num: i, name: LIVE_CATEGORIES[liveCat] + ' ' + i + (i === 7 ? ' HD' : ''), stream_type: 'live',
    stream_id: 1000 + i, stream_icon: i % 9 === 0 ? '' : image('CH' + i, i), epg_channel_id: 'ch' + i,
    category_id: String(liveCat + 1), tv_archive: 0
  });
}

var vod = [];
for (var v = 1; v <= 90; v++) {
  vod.push({
    num: v, name: 'Film di prova ' + v, stream_type: 'movie', stream_id: 5000 + v,
    stream_icon: v % 11 === 0 ? '' : image('F' + v, v + 300), rating: (5 + (v % 5)).toString(),
    category_id: String(((v - 1) % VOD_CATEGORIES.length) + 11), container_extension: 'mp4'
  });
}

var series = [];
for (var s = 1; s <= 24; s++) {
  series.push({
    num: s, name: 'Serie di prova ' + s, series_id: 8000 + s, cover: image('S' + s, s + 600),
    plot: 'Trama della serie ' + s, rating: '8', category_id: String(((s - 1) % SERIES_CATEGORIES.length) + 21)
  });
}

function categories(names, offset) {
  return names.map(function (name, idx) {
    return { category_id: String(idx + offset), category_name: name, parent_id: 0 };
  });
}

function b64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

function shortEpg(streamId) {
  var hour = 3600;
  var now = Math.floor(Date.now() / 1000);
  var start = now - (now % hour);
  return {
    epg_listings: [0, 1, 2].map(function (k) {
      return {
        id: String(k), epg_id: String(streamId), lang: 'it',
        title: b64(['Telegiornale', 'Film della sera', 'Notte fonda'][k] + ' è in onda'),
        description: b64('Descrizione programma ' + k),
        start: '', end: '',
        start_timestamp: String(start + k * hour), stop_timestamp: String(start + (k + 1) * hour)
      };
    })
  };
}

function seriesInfo(id) {
  var entry = series.filter(function (x) { return String(x.series_id) === String(id); })[0];
  var name = entry ? entry.name : 'Serie';
  var episodes = {};
  [1, 2].forEach(function (season) {
    episodes[season] = [];
    for (var e = 1; e <= (season === 1 ? 8 : 5); e++) {
      episodes[season].push({
        id: String(id * 100 + season * 10 + e), episode_num: e, season: season,
        title: name + ' - S0' + season + 'E0' + e + ' - Episodio ' + e, container_extension: 'mkv',
        info: { duration_secs: 2700, duration: '00:45:00', plot: 'Episodio ' + e }
      });
    }
  });
  return {
    seasons: [{ season_number: 1, name: 'Stagione 1' }, { season_number: 2, name: 'Stagione 2' }],
    info: { name: name, cover: entry ? entry.cover : '', plot: 'Una serie avvincente.', genre: 'Crime', releaseDate: '2021-03-01', rating: '8' },
    episodes: episodes
  };
}

function vodInfo(id) {
  var entry = vod.filter(function (x) { return String(x.stream_id) === String(id); })[0] || {};
  return {
    info: {
      name: entry.name, movie_image: entry.stream_icon, plot: 'Un film di prova per lo sviluppo dell\'app.',
      genre: 'Azione', duration: '01:45:00', releasedate: '2023-05-10', rating: entry.rating
    },
    movie_data: { stream_id: entry.stream_id, container_extension: 'mp4', name: entry.name }
  };
}

function api(query) {
  if (query.username !== USER || query.password !== PASS) {
    return { user_info: { auth: 0 } };
  }
  switch (query.action) {
    case undefined:
      return {
        user_info: {
          username: USER, password: PASS, auth: 1, status: 'Active',
          exp_date: String(Math.floor(Date.now() / 1000) + 90 * 86400),
          active_cons: '0', max_connections: '2', allowed_output_formats: ['m3u8', 'ts']
        },
        server_info: { url: 'localhost', port: String(PORT), server_protocol: 'http', timezone: 'Europe/Rome' }
      };
    case 'get_live_categories': return categories(LIVE_CATEGORIES, 1);
    case 'get_vod_categories': return categories(VOD_CATEGORIES, 11);
    case 'get_series_categories': return categories(SERIES_CATEGORIES, 21);
    case 'get_live_streams': return live;
    case 'get_vod_streams': return vod;
    case 'get_series': return series;
    case 'get_short_epg': return shortEpg(query.stream_id);
    case 'get_vod_info': return vodInfo(query.vod_id);
    case 'get_series_info': return seriesInfo(query.series_id);
    default: return [];
  }
}

function svg(n, label) {
  var hue = (n * 47) % 360;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300">' +
    '<rect width="200" height="300" fill="hsl(' + hue + ',55%,35%)"/>' +
    '<text x="100" y="165" font-family="Arial" font-size="40" fill="#fff" text-anchor="middle">' +
    String(label).replace(/[^\w ]/g, '') + '</text></svg>';
}

// ---------- Server HTTP ----------

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  res.end(body);
}

var server = http.createServer(function (req, res) {
  var parsed = url.parse(req.url, true);
  var pathname = decodeURIComponent(parsed.pathname);

  if (pathname === '/player_api.php') {
    return send(res, 200, 'application/json', JSON.stringify(api(parsed.query)));
  }
  var imgMatch = pathname.match(/^\/mock-img\/(\d+)\.svg$/);
  if (imgMatch) return send(res, 200, MIME['.svg'], svg(Number(imgMatch[1]), parsed.query.label || ''));
  if (/^\/(live|movie|series)\//.test(pathname)) return send(res, 404, 'text/plain', 'Stream finto non disponibile');
  // webapis.js esiste solo sulla TV: nel browser restituiamo uno script vuoto.
  if (pathname.indexOf('/$WEBAPIS/') === 0) return send(res, 200, MIME['.js'], '');

  var file = path.normalize(path.join(APP_DIR, pathname === '/' ? 'index.html' : pathname));
  if (file.indexOf(APP_DIR) !== 0) return send(res, 403, 'text/plain', 'Vietato');
  fs.readFile(file, function (err, data) {
    if (err) return send(res, 404, 'text/plain', 'Non trovato');
    send(res, 200, MIME[path.extname(file)] || 'application/octet-stream', data);
  });
});

if (require.main === module) {
  server.listen(PORT, function () {
    console.log('Xtream TV dev server: http://localhost:' + PORT);
    console.log('Accedi con server http://localhost:' + PORT + ', utente "' + USER + '", password "' + PASS + '"');
  });
}

module.exports = server;
