'use strict';

var test = require('node:test');
var assert = require('node:assert');
var Xtream = require('../../app/js/xtream.js');

test('normalizeServer aggiunge il protocollo e rimuove path superflui', function () {
  assert.strictEqual(Xtream.normalizeServer('esempio.com:8080'), 'http://esempio.com:8080');
  assert.strictEqual(Xtream.normalizeServer(' https://esempio.com/ '), 'https://esempio.com');
  assert.strictEqual(Xtream.normalizeServer('http://esempio.com:80/player_api.php?username=a'), 'http://esempio.com:80');
  assert.strictEqual(Xtream.normalizeServer('http://esempio.com/get.php?username=a&type=m3u'), 'http://esempio.com');
  assert.strictEqual(Xtream.normalizeServer(''), '');
});

test('alternateServer scambia https e http', function () {
  assert.strictEqual(Xtream.alternateServer('https://esempio.com:2052/get.php?username=a'), 'http://esempio.com:2052');
  assert.strictEqual(Xtream.alternateServer('http://esempio.com:8080'), 'https://esempio.com:8080');
  assert.strictEqual(Xtream.alternateServer('esempio.com'), 'https://esempio.com');
  assert.strictEqual(Xtream.alternateServer(''), '');
});

test('parseAccountUrl estrae server, utente e password dal link completo', function () {
  assert.deepStrictEqual(
    Xtream.parseAccountUrl(' https://srv.esempio.tv:2052/get.php?username=Ab12&password=x%26y%3D1&type=m3u&output=mpegts '),
    { server: 'https://srv.esempio.tv:2052', username: 'Ab12', password: 'x&y=1' }
  );
  assert.deepStrictEqual(
    Xtream.parseAccountUrl('srv.esempio.tv/player_api.php?password=p&USERNAME=u'),
    { server: 'http://srv.esempio.tv', username: 'u', password: 'p' }
  );
  assert.strictEqual(Xtream.parseAccountUrl('http://srv.esempio.tv:8080'), null);
  assert.strictEqual(Xtream.parseAccountUrl('http://srv.esempio.tv/get.php?username=u'), null);
  assert.strictEqual(Xtream.parseAccountUrl(''), null);
});

test('hostOf estrae solo il nome del server', function () {
  assert.strictEqual(Xtream.hostOf('https://Sma2.Esempio.online:2052/get.php?username=a'), 'sma2.esempio.online');
  assert.strictEqual(Xtream.hostOf('esempio.com'), 'esempio.com');
  assert.strictEqual(Xtream.hostOf(''), '');
});

test('apiUrl e URL degli stream codificano le credenziali', function () {
  var client = new Xtream.Client({ server: 'esempio.com:8080/', username: 'mario rossi', password: 'p&ss' });
  assert.strictEqual(
    client.apiUrl('get_vod_info', { vod_id: 12 }),
    'http://esempio.com:8080/player_api.php?username=mario%20rossi&password=p%26ss&action=get_vod_info&vod_id=12'
  );
  assert.strictEqual(client.liveUrl(5, 'm3u8'), 'http://esempio.com:8080/live/mario%20rossi/p%26ss/5.m3u8');
  assert.strictEqual(client.liveUrl(5), 'http://esempio.com:8080/live/mario%20rossi/p%26ss/5.ts');
  assert.strictEqual(client.vodUrl(7, 'mkv'), 'http://esempio.com:8080/movie/mario%20rossi/p%26ss/7.mkv');
  assert.strictEqual(client.episodeUrl(9, 'mp4'), 'http://esempio.com:8080/series/mario%20rossi/p%26ss/9.mp4');
});

test('decodeBase64 gestisce UTF-8 e testo non codificato', function () {
  var encoded = Buffer.from('Città è bella', 'utf8').toString('base64');
  assert.strictEqual(Xtream.decodeBase64(encoded), 'Città è bella');
  assert.strictEqual(Xtream.decodeBase64(''), '');
  assert.strictEqual(Xtream.decodeBase64('non base64!!'), 'non base64!!');
});

test('normalizeEpisodes accetta oggetto o array e ordina gli episodi', function () {
  var fromObject = Xtream.normalizeEpisodes({ 2: [{ episode_num: 2 }, { episode_num: 1 }], 10: [{ episode_num: 1 }] });
  assert.deepStrictEqual(fromObject['2'].map(function (e) { return e.episode_num; }), [1, 2]);
  assert.deepStrictEqual(Xtream.sortedSeasonNumbers(fromObject), ['2', '10']);

  var fromArray = Xtream.normalizeEpisodes([[{ season: 1, episode_num: 3 }, { season: 1, episode_num: 1 }], [{ season: 2, episode_num: 1 }]]);
  assert.deepStrictEqual(Object.keys(fromArray).sort(), ['1', '2']);
  assert.strictEqual(fromArray['1'][0].episode_num, 1);
  assert.deepStrictEqual(Xtream.normalizeEpisodes(null), {});
});

test('authenticate rifiuta credenziali errate e account scaduti', async function () {
  function fake(response) {
    return new Xtream.Client({ server: 'x', username: 'u', password: 'p' }, function () {
      return Promise.resolve(response);
    });
  }
  await assert.rejects(fake({ user_info: { auth: 0 } }).authenticate(), /Credenziali non valide/);
  await assert.rejects(fake({ user_info: { auth: 1, status: 'Expired' } }).authenticate(), /Expired/);
  await assert.rejects(fake([]).authenticate(), /Credenziali non valide/);
  var ok = await fake({ user_info: { auth: 1, status: 'Active' }, server_info: {} }).authenticate();
  assert.strictEqual(ok.user_info.status, 'Active');
});

test('getShortEpg decodifica titoli e converte gli orari in millisecondi', async function () {
  var requested = null;
  var client = new Xtream.Client({ server: 'x', username: 'u', password: 'p' }, function (url) {
    requested = url;
    return Promise.resolve({
      epg_listings: [{ title: Buffer.from('Tg1').toString('base64'), description: '', start_timestamp: '100', stop_timestamp: '200' }]
    });
  });
  var epg = await client.getShortEpg(42, 2);
  assert.match(requested, /action=get_short_epg&stream_id=42&limit=2$/);
  assert.deepStrictEqual(epg, [{ title: 'Tg1', description: '', start: 100000, end: 200000 }]);
});

test('getStreams restituisce sempre un array', async function () {
  var client = new Xtream.Client({ server: 'x', username: 'u', password: 'p' }, function () {
    return Promise.resolve({ error: 'boh' });
  });
  assert.deepStrictEqual(await client.getStreams('live'), []);
});

test('channelKey ignora prefisso di paese, qualità e sigle dei feed', function () {
  var key = Xtream.channelKey('Sky Sport Uno');
  assert.strictEqual(key, 'sky sport uno');
  ['IT: Sky Sport Uno FHD', '[IT] SKY SPORT UNO HD', '|IT| Sky Sport Uno ᴴᴰ', 'Sky Sport Uno (backup)',
    'IT | Sky Sport Uno HEVC 50fps', 'Sky Sport Uno 1080p', 'SKY SPORT UNO 4K'].forEach(function (name) {
    assert.strictEqual(Xtream.channelKey(name), key, name);
  });
  assert.notStrictEqual(Xtream.channelKey('Sky Sport 251'), Xtream.channelKey('Sky Sport 252'));
  assert.notStrictEqual(Xtream.channelKey('Rai 1 HD'), Xtream.channelKey('Rai 2 HD'));
  assert.strictEqual(Xtream.channelKey('Canale 5 HD'), 'canale 5');
});

test('findAlternates trova gli altri feed dello stesso canale', function () {
  var items = [
    { id: '1', name: 'IT: DAZN 1 FHD' }, { id: '2', name: 'IT: DAZN 2 FHD' },
    { id: '3', name: 'DAZN 1 HD' }, { id: '4', name: 'DAZN 1 (backup)' }, { id: '5', name: 'DAZN 1 SD' }
  ];
  assert.deepStrictEqual(Xtream.findAlternates(items[0], items).map(function (i) { return i.id; }), ['3', '4', '5']);
  assert.deepStrictEqual(Xtream.findAlternates(items[0], items, 1).map(function (i) { return i.id; }), ['3']);
  assert.deepStrictEqual(Xtream.findAlternates(items[1], items), []);
});
