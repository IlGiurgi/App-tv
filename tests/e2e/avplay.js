#!/usr/bin/env node
/*
 * Test E2E del percorso di riproduzione Samsung: sostituisce webapis.avplay con un finto player
 * che registra le chiamate, così si verificano URL degli stream, ripresa e episodio successivo
 * senza una TV.
 *
 *   node tests/e2e/avplay.js
 */
'use strict';

var assert = require('assert');
var chromium = require('playwright').chromium;
var server = require('../../dev/mock-server.js');

/* Eseguito nella pagina prima degli script dell'app. */
function installFakeAvplay(account) {
  if (!localStorage.getItem('xtreamtv.account')) {
    localStorage.setItem('xtreamtv.account', JSON.stringify(account));
  }
  var fake = {
    calls: [], state: 'NONE', listener: null, time: 0,
    open: function (url) { fake.calls.push(['open', url]); fake.state = 'IDLE'; },
    setDisplayRect: function (x, y, w, h) { fake.calls.push(['setDisplayRect', x, y, w, h]); },
    setDisplayMethod: function () {},
    setListener: function (l) { fake.listener = l; },
    prepareAsync: function (ok) { fake.state = 'READY'; setTimeout(ok, 10); },
    play: function () { fake.calls.push(['play']); fake.state = 'PLAYING'; },
    pause: function () { fake.calls.push(['pause']); fake.state = 'PAUSED'; },
    stop: function () { fake.calls.push(['stop']); fake.state = 'IDLE'; },
    close: function () { fake.state = 'NONE'; },
    seekTo: function (ms) { fake.calls.push(['seekTo', ms]); fake.time = ms; },
    getState: function () { return fake.state; },
    getDuration: function () { return 6000000; },
    getCurrentTime: function () { return fake.time; },
    suspend: function () {},
    restore: function () {}
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
  await page.addInitScript(installFakeAvplay, { server: base, username: 'demo', password: 'demo' });

  async function press(key, times) {
    for (var i = 0; i < (times || 1); i++) {
      await page.keyboard.press(key);
      await page.waitForTimeout(60);
    }
  }
  function focusedText() {
    return page.evaluate(function () { return Nav.current ? Nav.current.textContent : null; });
  }
  function lastOpen() {
    return page.evaluate(function () {
      var opens = window.fakeAvplay.calls.filter(function (c) { return c[0] === 'open'; });
      return opens.length ? opens[opens.length - 1][1] : null;
    });
  }
  async function step(name, fn) {
    await fn();
    console.log('ok -', name);
  }

  await page.goto(base);
  await page.waitForSelector('#screen-browse.active .items .row');

  await step('canale live: URL .ts e trasparenza per il piano video', async function () {
    await press('ArrowDown');
    await press('ArrowDown'); // categoria "Italia"
    await press('Enter');
    await press('Enter');
    await page.waitForSelector('#screen-player.active');
    await page.waitForFunction(function () { return document.querySelector('#screen-player').dataset.status === 'playing'; });
    assert.strictEqual(await lastOpen(), base + '/live/demo/demo/1001.ts');
    var transparent = await page.evaluate(function () {
      return document.documentElement.classList.contains('playing') &&
        getComputedStyle(document.documentElement).backgroundColor === 'rgba(0, 0, 0, 0)' &&
        getComputedStyle(document.body).backgroundColor === 'rgba(0, 0, 0, 0)';
    });
    assert.ok(transparent, 'html e body devono essere trasparenti durante la riproduzione');
    await press('Digit1');
    await press('Digit1');
    await page.waitForFunction(function () {
      return window.fakeAvplay.calls.filter(function (c) { return c[0] === 'open'; }).length === 2;
    }, null, { timeout: 4000 });
    assert.strictEqual(await lastOpen(), base + '/live/demo/demo/1011.ts', 'tasti numerici: canale 11');
    await press('Escape');
    await page.waitForSelector('#screen-browse.active.mini-active');
    assert.strictEqual(await page.evaluate(function () { return window.fakeAvplay.state; }), 'PLAYING',
      'INDIETRO lascia il canale nel riquadro');
    assert.deepStrictEqual(await page.evaluate(function () {
      return window.fakeAvplay.calls.filter(function (c) { return c[0] === 'setDisplayRect'; }).pop().slice(1);
    }), [60, 748, 440, 248], 'video ridotto al riquadro in basso a sinistra');
    await press('Escape', 3); // canali -> categorie -> tab -> chiude il riquadro
    assert.strictEqual(await page.evaluate(function () { return window.fakeAvplay.state; }), 'NONE', 'player chiuso');
    assert.ok(!(await page.evaluate(function () { return document.documentElement.classList.contains('playing'); })));
  });

  await step('film: riproduzione, salvataggio posizione e ripresa', async function () {
    await press('ArrowRight', 2); // già sui tab dopo la chiusura del riquadro: Guida TV, poi Film
    await press('Enter');
    await page.waitForSelector('.items .card');
    // Con il tab Guida TV in più, "Film" non sta più sopra le categorie: si va su "Tutti" direttamente.
    await page.evaluate(function () { Nav.focusZone('browse-cats'); });
    await press('Enter'); // OK su "Tutti" porta al primo film
    assert.match(await focusedText(), /^Film di prova 1/);
    await press('Enter');
    await page.waitForFunction(function () { return Nav.current && Nav.current.textContent === '▶ Riproduci'; });
    await press('Enter');
    await page.waitForFunction(function () { return document.querySelector('#screen-player').dataset.status === 'playing'; });
    assert.strictEqual(await lastOpen(), base + '/movie/demo/demo/5001.mp4');
    await page.evaluate(function () { window.fakeAvplay.time = 600000; });
    await press('ArrowRight');
    assert.deepStrictEqual(
      await page.evaluate(function () { return window.fakeAvplay.calls[window.fakeAvplay.calls.length - 1]; }),
      ['seekTo', 630000], '▶ avanza di 30 secondi'
    );
    await press('Escape');
    await page.waitForSelector('#screen-detail.active');
    assert.strictEqual(await focusedText(), '▶ Riprendi da 10:30');
    await press('Enter');
    await page.waitForFunction(function () { return document.querySelector('#screen-player').dataset.status === 'playing'; });
    var seeks = await page.evaluate(function () {
      return window.fakeAvplay.calls.filter(function (c) { return c[0] === 'seekTo'; });
    });
    assert.deepStrictEqual(seeks[seeks.length - 1], ['seekTo', 630000], 'ripresa dalla posizione salvata');
    await press('Escape');
    await press('Escape');
  });

  await step('serie: episodio .mkv e passaggio automatico al successivo', async function () {
    await press('Escape', 2);
    await press('ArrowRight');
    assert.strictEqual(await focusedText(), 'Serie TV');
    await press('Enter');
    await page.waitForSelector('.items .card');
    await page.evaluate(function () { Nav.focusZone('browse-items'); }); // prima serie della categoria
    await press('Enter');
    await page.waitForSelector('#screen-detail.active .episode');
    await press('ArrowDown', 2);
    assert.match(await focusedText(), /^1\. S01E01/);
    await press('Enter');
    await page.waitForFunction(function () { return document.querySelector('#screen-player').dataset.status === 'playing'; });
    assert.strictEqual(await lastOpen(), base + '/series/demo/demo/800111.mkv');
    await page.evaluate(function () { window.fakeAvplay.listener.onstreamcompleted(); });
    await page.waitForFunction(function () {
      return window.fakeAvplay.calls.filter(function (c) { return c[0] === 'open'; }).length >= 6;
    });
    assert.strictEqual(await lastOpen(), base + '/series/demo/demo/800112.mkv');
    assert.match(await page.textContent('.player-title'), /S1E2/);
  });

  assert.deepStrictEqual(errors, [], 'errori JavaScript nella pagina');
  await browser.close();
  server.close();
  console.log('\nTest AVPlay superati.');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
