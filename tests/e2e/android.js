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
  /** Trascina il dito verso l'alto sopra un elemento (tocchi reali via Chrome DevTools Protocol). */
  async function swipeUp(selector) {
    var box = await page.locator(selector).first().boundingBox();
    var x = box.x + box.width / 2;
    var startY = Math.min(box.y + box.height - 20, 800);
    var cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x, y: startY }] });
    for (var y = startY - 30; y >= startY - 450; y -= 30) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x, y: y }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(300);
  }

  /** Tiene il dito fermo su un elemento per ~0,9 s (pressione prolungata). */
  async function longPress(selector) {
    var box = await page.locator(selector).first().boundingBox();
    var point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    var cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await page.waitForTimeout(900);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(300);
  }

  /** Trascina il dito in orizzontale sopra un elemento (dx < 0 = verso sinistra). */
  async function swipeHorizontal(selector, dx) {
    var box = await page.locator(selector).first().boundingBox();
    var y = box.y + Math.min(box.height / 2, 300);
    var startX = dx < 0 ? box.x + box.width - 30 : box.x + 30;
    var cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y: y }] });
    for (var i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: startX + dx * i / 10, y: y }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(400);
  }

  function selectedTab() {
    return page.evaluate(function () { return document.querySelector('.tab.selected').getAttribute('data-tab'); });
  }

  async function step(name, fn) {
    await fn();
    console.log('ok -', name);
  }

  await page.goto(base);
  await page.waitForSelector('#screen-browse.active .items .row');

  await step('al primo avvio su telefono compare il suggerimento sui gesti', async function () {
    assert.match(await page.textContent('#toast'), /tieni premuto/);
  });

  await step('layout per telefono e tasto Indietro registrato', async function () {
    assert.ok(await page.evaluate(function () { return document.documentElement.classList.contains('mobile'); }));
    assert.strictEqual(await page.evaluate(function () { return window.fakeAndroid.backListeners.length; }), 1);
  });

  await step('scorrimento col dito: lista canali (con caricamento a blocchi) e dettaglio serie', async function () {
    await page.tap('.category[data-category="*"]');
    assert.strictEqual(await page.locator('.items .row').count(), 60);
    for (var i = 0; i < 12 && await page.locator('.items .row').count() <= 60; i++) await swipeUp('.items');
    assert.ok(await page.evaluate(function () { return document.querySelector('.items').scrollTop > 0; }),
      'la lista canali deve scorrere col dito');
    assert.ok(await page.locator('.items .row').count() > 60, 'scorrendo si caricano i canali successivi');

    await page.tap('.tab[data-tab="series"]');
    await page.waitForSelector('.items .card');
    await page.tap('.items .card >> nth=0');
    await page.waitForSelector('#screen-detail.active .episode');
    await swipeUp('#screen-detail');
    assert.ok(await page.evaluate(function () { return document.getElementById('screen-detail').scrollTop > 0; }),
      'il dettaglio della serie deve scorrere col dito');
    await pressAndroidBack();
    await page.waitForSelector('#screen-browse.active');
    await page.tap('.tab[data-tab="live"]');
    await page.waitForSelector('.items .row');
  });

  await step('preferiti col dito: pressione prolungata aggiunge e rimuove, senza aprire il canale', async function () {
    await page.tap('.tab[data-tab="favorites"]');
    assert.match(await page.textContent('.items'), /tieni premuto/);
    await page.tap('.tab[data-tab="live"]');
    await page.waitForSelector('.items .row');
    var playsBefore = await page.evaluate(function () { return window.fakeAndroid.plays.length; });
    await longPress('.items .row >> nth=0');
    assert.strictEqual(await page.locator('.items .row >> nth=0').getAttribute('class').then(function (c) {
      return / is-favorite/.test(c);
    }), true, 'pressione prolungata: aggiunto ai preferiti');
    assert.strictEqual(await page.evaluate(function () { return window.fakeAndroid.plays.length; }), playsBefore,
      'la pressione prolungata non deve aprire il canale');
    assert.strictEqual(await page.evaluate(function () { return document.querySelector('.screen.active').id; }), 'screen-browse');
    await page.tap('.tab[data-tab="favorites"]');
    assert.strictEqual(await page.locator('.items .row').count(), 1);
    await longPress('.items .row >> nth=0');
    assert.strictEqual(await page.locator('.items .row').count(), 0, 'seconda pressione: rimosso');
    await page.tap('.tab[data-tab="live"]');
    await page.waitForSelector('.items .row');
  });

  await step('scorrere a destra e sinistra sulla lista cambia sezione', async function () {
    assert.strictEqual(await selectedTab(), 'live');
    await swipeHorizontal('.items', -250);
    assert.strictEqual(await selectedTab(), 'vod');
    await page.waitForSelector('.items .card');
    await swipeHorizontal('.items', -250);
    assert.strictEqual(await selectedTab(), 'series');
    await swipeHorizontal('.items', 250);
    await swipeHorizontal('.items', 250);
    assert.strictEqual(await selectedTab(), 'live');
    await swipeHorizontal('.items', 250);
    assert.strictEqual(await selectedTab(), 'live', 'prima sezione: nessun cambio');
    await page.waitForSelector('.items .row');
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
