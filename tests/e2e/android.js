#!/usr/bin/env node
/*
 * Test E2E dell'app Android: simula Capacitor (plugin NativePlayer e App) in un telefono emulato e
 * verifica layout per telefono, playlist passata al lettore nativo, ripresa, tasto Indietro e uscita.
 *
 *   node tests/e2e/android.js
 */
'use strict';

var assert = require('assert');
var chromium = require('playwright').chromium;
var server = require('../../dev/mock-server.js');

/* Eseguito nella pagina prima degli script dell'app. */
function installFakeCapacitor(account) {
  if (!localStorage.getItem('xtreamtv.account')) {
    localStorage.setItem('xtreamtv.account', JSON.stringify(account));
  }
  var fake = { plays: [], resolvePlay: null, backListeners: [], exited: false, trustedHosts: [] };
  var plugins = {
    NativePlayer: {
      play: function (options) {
        fake.plays.push(JSON.parse(JSON.stringify(options)));
        return new Promise(function (resolve) { fake.resolvePlay = resolve; });
      }
    },
    ServerTrust: {
      setAllowedHost: function (options) {
        fake.trustedHosts.push(options.host);
        return Promise.resolve();
      }
    },
    App: {
      addListener: function (event, cb) { if (event === 'backButton') fake.backListeners.push(cb); },
      exitApp: function () { fake.exited = true; }
    }
  };
  window.Capacitor = {
    isNativePlatform: function () { return true; },
    registerPlugin: function (name) { return plugins[name]; }
  };
  window.fakeAndroid = fake;
}

async function main() {
  await new Promise(function (resolve) { server.listen(0, resolve); });
  var base = 'http://localhost:' + server.address().port;
  var launchOptions = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
  var browser = await chromium.launch(launchOptions);
  var context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  var page = await context.newPage();
  var errors = [];
  page.on('pageerror', function (err) { errors.push(err.message); });
  await page.addInitScript(installFakeCapacitor, { server: base, username: 'demo', password: 'demo' });

  function lastPlay() {
    return page.evaluate(function () { return window.fakeAndroid.plays[window.fakeAndroid.plays.length - 1]; });
  }
  function closePlayer(result) {
    return page.evaluate(function (r) { window.fakeAndroid.resolvePlay(r); }, result);
  }
  function pressAndroidBack() {
    return page.evaluate(function () { window.fakeAndroid.backListeners[0](); });
  }
  async function step(name, fn) {
    await fn();
    console.log('ok -', name);
  }

  await page.goto(base);
  await page.waitForSelector('#screen-browse.active .items .row');

  await step('layout per telefono e tasto Indietro registrato', async function () {
    assert.ok(await page.evaluate(function () { return document.documentElement.classList.contains('mobile'); }));
    assert.strictEqual(await page.evaluate(function () { return window.fakeAndroid.backListeners.length; }), 1);
  });

  await step('canale live: playlist della categoria al lettore nativo', async function () {
    await page.tap('.items .row >> nth=1');
    await page.waitForFunction(function () { return window.fakeAndroid.plays.length === 1; });
    var play = await lastPlay();
    assert.strictEqual(play.items.length, 52);
    assert.strictEqual(play.index, 1);
    assert.strictEqual(play.live, true);
    assert.deepStrictEqual(play.items[1], { url: base + '/live/demo/demo/1006.ts', title: 'Italia 6' });
    await closePlayer({ index: 3, position: 50, duration: 0 });
    await page.waitForSelector('#screen-browse.active');
  });

  await step('liste enormi: al lettore arriva una finestra di 201 canali', async function () {
    await page.evaluate(function () {
      var big = [];
      for (var i = 0; i < 5000; i++) big.push({ type: 'live', id: String(i), name: 'Canale ' + i });
      App.show('player', { playlist: big, index: 2500 });
    });
    await page.waitForFunction(function () { return window.fakeAndroid.plays.length === 2; });
    var play = await lastPlay();
    assert.strictEqual(play.items.length, 201);
    assert.strictEqual(play.items[play.index].title, 'Canale 2500');
    await closePlayer({ index: 0, position: 0, duration: 0 });
    await page.waitForSelector('#screen-browse.active');
  });

  await step('film: ripresa salvata alla chiusura del lettore', async function () {
    await page.tap('.tab[data-tab="vod"]');
    await page.waitForSelector('.items .card');
    await page.tap('.items .card >> nth=0');
    await page.waitForFunction(function () { return Nav.current && Nav.current.textContent === '▶ Riproduci'; });
    await page.tap('.detail-actions [data-key="play"]');
    await page.waitForFunction(function () { return window.fakeAndroid.plays.length === 3; });
    var play = await lastPlay();
    assert.deepStrictEqual(play, {
      items: [{ url: base + '/movie/demo/demo/5001.mp4', title: 'Film di prova 1' }], index: 0, startAt: 0, live: false
    });
    await closePlayer({ index: 0, position: 600, duration: 6000 });
    await page.waitForSelector('#screen-detail.active [data-key="resume"]');
    assert.strictEqual(await page.textContent('[data-key="resume"]'), '▶ Riprendi da 10:00');
    await page.tap('[data-key="resume"]');
    await page.waitForFunction(function () { return window.fakeAndroid.plays.length === 4; });
    assert.strictEqual((await lastPlay()).startAt, 600);
    await closePlayer({ index: 0, position: 5990, duration: 6000 });
    await page.waitForSelector('#screen-detail.active');
    assert.strictEqual(await page.locator('[data-key="resume"]').count(), 0, 'film finito: niente ripresa');
  });

  await step('serie: episodi visti per intero e ripresa sull\'ultimo', async function () {
    await pressAndroidBack();
    await page.waitForSelector('#screen-browse.active');
    await page.evaluate(function () { Storage.setResume('episode:800111', 500, 2700); });
    await page.tap('.tab[data-tab="series"]');
    await page.waitForSelector('.items .card');
    await page.tap('.items .card >> nth=0');
    await page.waitForSelector('.episode');
    await page.tap('.episode >> nth=0');
    await page.waitForFunction(function () { return window.fakeAndroid.plays.length === 5; });
    var play = await lastPlay();
    assert.strictEqual(play.startAt, 500, 'il primo episodio riparte dalla posizione salvata');
    assert.strictEqual(play.items.length, 8);
    assert.strictEqual(play.items[0].url, base + '/series/demo/demo/800111.mkv');
    await closePlayer({ index: 2, position: 100, duration: 2700 });
    await page.waitForSelector('#screen-detail.active .episode');
    var durations = await page.$$eval('.episode-duration', function (els) { return els.map(function (e) { return e.textContent; }); });
    assert.deepStrictEqual(durations.slice(0, 3), ['00:45:00', '00:45:00', 'ripresa da 1:40'],
      'episodi 1-2 visti per intero (ripresa cancellata), episodio 3 da riprendere');
  });

  await step('certificato non valido: eccezione solo se spuntata, rimossa se il login fallisce e al logout', async function () {
    await pressAndroidBack();
    await page.waitForSelector('#screen-browse.active');
    await page.tap('.tab[data-tab="settings"]');
    await page.tap('#setting-logout');
    await page.waitForSelector('#screen-login.active #login-trust');
    function trusted() { return page.evaluate(function () { return window.fakeAndroid.trustedHosts.slice(); }); }
    assert.deepStrictEqual(await trusted(), [null], 'il logout rimuove l\'eccezione');

    await page.tap('#login-server'); await page.keyboard.type(base);
    await page.tap('#login-username'); await page.keyboard.type('demo');
    await page.tap('#login-password'); await page.keyboard.type('sbagliata');
    await page.tap('#login-trust');
    assert.match(await page.textContent('#login-trust'), /^☑/);
    await page.tap('#login-submit');
    await page.waitForFunction(function () { return /Credenziali/.test(document.getElementById('login-error').textContent); });
    assert.deepStrictEqual(await trusted(), [null, 'localhost', null], 'login fallito: eccezione rimossa');

    await page.fill('#login-password', 'demo');
    await page.tap('#login-submit');
    await page.waitForSelector('#screen-browse.active .items .row');
    assert.deepStrictEqual((await trusted()).pop(), 'localhost');
    assert.strictEqual(await page.evaluate(function () {
      return JSON.parse(localStorage.getItem('xtreamtv.account')).insecureTls;
    }), true);
    await page.tap('.tab[data-tab="settings"]');
    assert.match(await page.textContent('.settings-panel'), /Non valido, accettato per localhost/);
    await page.tap('.tab[data-tab="live"]');
  });

  await step('tasto Indietro di Android: risale e poi chiude l\'app', async function () {
    await pressAndroidBack();
    await page.waitForSelector('#screen-browse.active');
    for (var i = 0; i < 5 && !(await page.evaluate(function () { return window.fakeAndroid.exited; })); i++) {
      await pressAndroidBack();
    }
    assert.ok(await page.evaluate(function () { return window.fakeAndroid.exited; }), 'doppio Indietro deve uscire');
  });

  assert.deepStrictEqual(errors, [], 'errori JavaScript nella pagina');
  await browser.close();
  server.close();
  console.log('\nTest app Android superati.');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
