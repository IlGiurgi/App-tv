#!/usr/bin/env node
/*
 * Test E2E della Home a riquadri sulla TV: riquadri, locandine casuali di Film e Serie, dati di Casa,
 * apertura delle sezioni, ritorno con INDIETRO e canale che continua nel riquadro Live TV.
 *
 *   node tests/e2e/launcher.js [cartella-screenshot]
 */
'use strict';

var path = require('path');
var assert = require('assert');
var chromium = require('playwright').chromium;
var server = require('../../dev/mock-server.js');

var SHOTS = process.argv[2] || path.join(__dirname, '..', '..', 'test-results');

/* Eseguito nella pagina prima degli script dell'app: finto AVPlay (= TV) e collegamento a Home Assistant. */
function installTv(config) {
  localStorage.setItem('xtreamtv.account', JSON.stringify(config.account));
  if (!localStorage.getItem('xtreamtv.home')) localStorage.setItem('xtreamtv.home', JSON.stringify(config.home));
  var fake = {
    state: 'NONE',
    open: function () { fake.state = 'IDLE'; }, setDisplayRect: function (x, y, w, h) { fake.rect = [x, y, w, h]; }, setDisplayMethod: function () {},
    setListener: function () {}, prepareAsync: function (ok) { fake.state = 'READY'; setTimeout(ok, 10); },
    play: function () { fake.state = 'PLAYING'; }, pause: function () {}, stop: function () { fake.state = 'IDLE'; },
    close: function () { fake.state = 'NONE'; }, seekTo: function () {}, getState: function () { return fake.state; },
    getDuration: function () { return 0; }, getCurrentTime: function () { return 0; }, suspend: function () {}, restore: function () {}
  };
  window.webapis = { avplay: fake };
  window.fakeAvplay = fake;
}

async function main() {
  await new Promise(function (resolve) { server.listen(0, resolve); });
  var base = 'http://localhost:' + server.address().port;
  var launchOptions = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
  var browser = await chromium.launch(launchOptions);
  var page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  var errors = [];
  page.on('pageerror', function (err) { errors.push(err.message); });
  await page.addInitScript(installTv, {
    account: { server: base, username: 'demo', password: 'demo' },
    home: { url: base, token: 'ha-test-token', cameras: 'camera.giardino', climates: 'climate.salotto' }
  });

  async function press(key, times) {
    for (var i = 0; i < (times || 1); i++) {
      await page.keyboard.press(key);
      await page.waitForTimeout(60);
    }
  }
  function focusedTile() {
    return page.evaluate(function () { return Nav.current ? Nav.current.getAttribute('data-tile') : null; });
  }
  function posters(type) {
    return page.evaluate(function (t) {
      return Array.prototype.map.call(document.querySelectorAll('.lh-' + t + ' .lh-poster-img'), function (img) {
        return img.getAttribute('src');
      });
    }, type);
  }
  async function step(name, fn) {
    await fn();
    console.log('ok -', name);
  }

  await page.goto(base);

  await step('all\'avvio sulla TV si apre la Home a riquadri, con il focus su Live TV', async function () {
    await page.waitForSelector('#screen-launcher.active');
    assert.strictEqual(await page.locator('#screen-launcher .lh-tile').count(), 8);
    assert.strictEqual(await focusedTile(), 'live');
    var live = await page.evaluate(function () {
      var r = document.querySelector('.lh-live'); // offset*: il riquadro a fuoco è ingrandito
      return [r.offsetLeft, r.offsetTop, r.offsetWidth, r.offsetHeight];
    });
    assert.deepStrictEqual(live, [96, 196, 840, 560]);
    await page.waitForFunction(function () { return /canali/.test(document.querySelector('.lh-live .lh-sub').textContent); });
  });

  await step('Casa: luci, clima, meteo e immagine della telecamera', async function () {
    await page.waitForFunction(function () { return document.querySelectorAll('.lh-chips span').length === 2; });
    assert.deepStrictEqual(await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('.lh-chips span'), function (s) { return s.textContent; });
    }), ['1 luce accesa', 'Clima 25,5°']);
    assert.match(await page.textContent('.lh-weather'), /19° Parzialmente nuvoloso/);
    assert.match(await page.locator('.lh-cam-img').getAttribute('src'), /\/api\/camera_proxy\/camera\.giardino\?token=def/);
    assert.strictEqual(await page.textContent('.lh-cam-name'), 'Giardino');
  });

  await step('Film e Serie: tre locandine caricate che cambiano a caso', async function () {
    await page.waitForFunction(function () {
      return document.querySelectorAll('.lh-vod .lh-poster.loaded').length === 3 &&
        document.querySelectorAll('.lh-series .lh-poster.loaded').length === 3;
    }, null, { timeout: 15000 });
    assert.match(await page.textContent('.lh-vod .lh-sub'), /\d+ film/);
    var before = await posters('vod');
    await page.waitForFunction(function (prev) {
      var now = Array.prototype.map.call(document.querySelectorAll('.lh-vod .lh-poster-img'), function (img) {
        return img.getAttribute('src');
      });
      return now.some(function (src, i) { return src !== prev[i]; });
    }, before, { timeout: 15000 });
    await page.screenshot({ path: path.join(SHOTS, 'launcher-01-home.png') });
  });

  await step('frecce tra i riquadri, OK apre la sezione e INDIETRO torna alla Home', async function () {
    await press('ArrowRight');
    assert.strictEqual(await focusedTile(), 'favorites');
    await press('ArrowDown');
    assert.strictEqual(await focusedTile(), 'vod');
    await press('ArrowDown');
    assert.strictEqual(await focusedTile(), 'settings');
    await press('ArrowUp');
    await press('Enter');
    await page.waitForSelector('#screen-browse.active');
    assert.strictEqual(await page.textContent('.tab.selected'), 'Film');
    await press('Escape');
    await page.waitForSelector('#screen-launcher.active');
    assert.strictEqual(await focusedTile(), 'vod', 'il focus torna sul riquadro da cui si era partiti');
  });

  await step('canale nel riquadro: INDIETRO fino alla Home e il video gira nel riquadro Live TV', async function () {
    await press('ArrowLeft');
    assert.strictEqual(await focusedTile(), 'live');
    await press('Enter');
    await page.waitForSelector('#screen-browse.active');
    assert.strictEqual(await page.textContent('.tab.selected'), 'Live TV');
    await press('ArrowDown');
    await press('ArrowDown'); // categoria "Italia"
    await press('Enter');
    await press('Enter');
    await page.waitForSelector('#screen-player.active');
    var channel = await page.textContent('.player-title');
    await press('Escape');
    await page.waitForSelector('#screen-browse.active.mini-active');
    await press('Escape'); // lista -> categorie
    await press('Escape'); // categorie -> tab
    await press('Escape'); // tab -> Home
    await page.waitForSelector('#screen-launcher.active.mini-active');
    assert.strictEqual(await page.evaluate(function () { return window.fakeAvplay.state; }), 'PLAYING', 'il canale continua');
    assert.deepStrictEqual(await page.evaluate(function () { return window.fakeAvplay.rect; }), [96, 196, 840, 472]);
    assert.ok((await page.textContent('.lh-now')).indexOf(channel) === 0, 'nome del canale nel riquadro Live TV');
    var hole = await page.evaluate(function () {
      return getComputedStyle(document.documentElement).backgroundColor === 'rgba(0, 0, 0, 0)' &&
        getComputedStyle(document.querySelector('.lh-live')).backgroundColor === 'rgba(0, 0, 0, 0)';
    });
    assert.ok(hole, 'il riquadro Live TV lascia vedere il video sotto la pagina');
    await page.screenshot({ path: path.join(SHOTS, 'launcher-02-canale.png') });
    await press('Escape');
    await page.waitForSelector('#screen-launcher.active:not(.mini-active)');
    assert.notStrictEqual(await page.evaluate(function () { return window.fakeAvplay.state; }), 'PLAYING', 'INDIETRO ferma il canale');
    assert.match(await page.textContent('.lh-now'), new RegExp('^Ultimo canale: ' + channel));
  });

  await step('Impostazioni: "Apri all\'avvio" parte dalla Home a riquadri', async function () {
    await page.evaluate(function () { Nav.focus(document.querySelector('[data-tile="settings"]')); });
    await press('Enter');
    await page.waitForSelector('#screen-browse.active');
    assert.strictEqual(await page.textContent('.tab.selected'), 'Impostazioni');
    assert.match(await page.textContent('#setting-start-section'), /Apri all'avvio: Home a riquadri/);
  });

  await step('Impostazioni: "Prova canale di riserva" elenca i feed trovati e mostra il nome confrontato', async function () {
    await page.evaluate(function () {
      // Un canale con due varianti nella lista: la diagnosi deve riconoscerle come lo stesso canale.
      App.cache.live.then(function (data) {
        var base = data.items[0];
        data.items.push({ type: 'live', id: '9001', name: 'IT: ' + base.name + ' FHD', icon: '', num: 9001, categoryId: base.categoryId });
        data.items.push({ type: 'live', id: '9002', name: base.name + ' (backup)', icon: '', num: 9002, categoryId: base.categoryId });
        Storage.setLastChannel({ type: 'live', id: base.id, name: base.name, icon: '', num: base.num, categoryId: base.categoryId });
      });
    });
    await page.evaluate(function () { Nav.focus(document.getElementById('setting-feeds')); });
    await press('Enter');
    await page.waitForSelector('.feed-listing .info-row');
    var rows = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('.feed-listing .info-row .info-label'), function (l) { return l.textContent; });
    });
    assert.strictEqual(rows.length, 3);
    assert.match(rows[0], /^IT: .* FHD$/);
    assert.match(rows[1], /\(backup\)$/);
    assert.match(rows[2], /\(HLS\)$/);
    assert.match(await page.textContent('.feed-listing .home-heading'), /nome confrontato: "\w+ \d+"/);
    await press('Enter'); // il primo feed si apre
    await page.waitForSelector('#screen-player.active');
    assert.match(await page.textContent('.player-title'), /^IT: /);
    await press('Escape');
    await page.waitForSelector('#screen-browse.active');
  });

  await step('Le tue partite: ricerca nella guida, Preferiti, avviso e sensore di Home Assistant', async function () {
    // Con un canale in riproduzione la ricerca aspetta: prima si ferma quello aperto dalla prova dei feed.
    await page.evaluate(function () { MiniPlayer.close(); Matches.gapMs = 0; });
    await page.evaluate(function () { Nav.focus(document.getElementById('follow-terms')); });
    await press('Enter');
    await page.keyboard.type('telegiornale');
    await press('Enter');
    await page.evaluate(function () { Nav.focus(document.getElementById('setting-follow-save')); });
    await press('Enter');
    await page.waitForFunction(function () { return Matches.list().length === 1 && !Matches.isScanning(); }, null, { timeout: 10000 });
    var match = await page.evaluate(function () { return Matches.list()[0]; });
    assert.strictEqual(match.title, 'Telegiornale è in onda');
    assert.ok(match.channels.length > 1 && match.channels.every(function (c) { return /^Sport /.test(c.name); }),
      'canali della categoria Sport, uniti in una riga');
    assert.match(await page.textContent('#screen-browse .settings-panel'), /1 partita trovata/);

    // Preferiti → Le tue partite: OK apre il canale.
    await page.evaluate(function () { Nav.focus(document.querySelector('.tab[data-tab="favorites"]')); });
    await press('Enter');
    await page.waitForSelector('.categories .category');
    await page.evaluate(function () {
      var cat = Array.prototype.filter.call(document.querySelectorAll('.categories .category'), function (c) {
        return /Le tue partite/.test(c.textContent);
      })[0];
      Nav.focus(cat);
    });
    await press('Enter');
    await page.waitForSelector('.items .row.is-match');
    assert.match(await page.textContent('.items .row.is-match'), /In onda {2}· {2}Telegiornale è in onda[\s\S]*su Sport/);
    await press('Escape', 3);
    await page.waitForSelector('#screen-launcher.active');
    assert.match(await page.textContent('.lh-match'), /Le tue partite\s*In onda {2}Telegiornale è in onda/);

    // Avviso 10 minuti prima: OK apre la partita e il sensore di Home Assistant riceve il canale.
    var channel = await page.evaluate(function () {
      var m = Matches.list()[0];
      Storage.setMatches({ at: Date.now(), terms: 'telegiornale', items: [{
        title: 'Inter - Milan', start: Date.now() + 5 * 60000, end: Date.now() + 2 * 3600000, channels: m.channels
      }] });
      Matches.alertNow();
      return m.channels[0].name;
    });
    await page.waitForSelector('#match-alert.visible');
    assert.match(await page.textContent('#match-alert'), /Inter - Milan[\s\S]*Tra 5 minuti su Sport/);
    await press('Enter');
    await page.waitForSelector('#screen-player.active');
    assert.strictEqual(await page.textContent('.player-title'), channel);
    assert.ok(!(await page.isVisible('#match-alert')));
    await page.waitForFunction(function (name) {
      return fetch('/mock-ha/posted').then(function (r) { return r.json(); }).then(function (posted) {
        var s = posted['sensor.hometivu_tv'];
        return s && s.state === name && s.attributes.tipo === 'canale' && s.attributes.programma === 'Telegiornale è in onda';
      });
    }, channel, { timeout: 5000 });
    await press('Escape');
    await page.waitForFunction(function () {
      return fetch('/mock-ha/posted').then(function (r) { return r.json(); }).then(function (posted) {
        return posted['sensor.hometivu_tv'].state !== 'spento'; // il canale continua nel riquadro
      });
    });
  });

  assert.deepStrictEqual(errors, [], 'errori JavaScript nella pagina');
  await browser.close();
  server.close();
  console.log('\nTest Home a riquadri superati.');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
