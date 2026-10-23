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
  // Questi test partono dalla lista canali, non dalla Home a riquadri (provata in launcher.js).
  if (!localStorage.getItem('xtreamtv.settings')) localStorage.setItem('xtreamtv.settings', JSON.stringify({ startSection: 'live' }));
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
  function waitOpens(count, timeout) {
    return page.waitForFunction(function (n) {
      return window.fakeAvplay.calls.filter(function (c) { return c[0] === 'open'; }).length === n;
    }, count, { timeout: timeout || 4000 });
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
    await page.waitForFunction(function () { return document.querySelector('#screen-player').dataset.status === 'playing'; });

    // Il banner elenca i feed di riserva trovati (qui solo l'altro formato: nel mock non ci sono canali con lo stesso nome).
    await page.waitForFunction(function () {
      var tag = document.querySelector('.player-tag.is-feed');
      return tag && /Feed di riserva: .*\(HLS\)/.test(tag.textContent);
    });
    // Canale che si blocca: prima si riprova lo stesso feed, poi si passa all'altro formato.
    await page.evaluate(function () { window.fakeAvplay.listener.onerror('PLAYER_ERROR_CONNECTION_FAILED'); });
    assert.match(await page.textContent('.player-status'), /riprovo \(1 di 6\)/);
    await waitOpens(3);
    assert.strictEqual(await lastOpen(), base + '/live/demo/demo/1011.ts', 'primo tentativo: stesso feed');
    await page.waitForFunction(function () { return document.querySelector('#screen-player').dataset.status === 'playing'; });
    await page.evaluate(function () { window.fakeAvplay.listener.onstreamcompleted(); }); // diretta chiusa dal server
    assert.match(await page.textContent('.player-status'), /riprovo \(2 di 6\)[\s\S]*Feed alternativo: Italia 11 \(HLS\)/);
    await waitOpens(4);
    assert.strictEqual(await lastOpen(), base + '/live/demo/demo/1011.m3u8', 'secondo tentativo: altro feed');
    await page.waitForFunction(function () { return document.querySelector('#screen-player').dataset.status === 'playing'; });
    await press('F4'); // BLU: feed successivo a mano
    await waitOpens(5);
    assert.strictEqual(await lastOpen(), base + '/live/demo/demo/1011.ts', 'BLU torna al primo feed');
    await press('F3'); // GIALLO: ricarica
    await waitOpens(6);
    assert.strictEqual(await lastOpen(), base + '/live/demo/demo/1011.ts', 'GIALLO riapre lo stesso feed');
    await page.waitForFunction(function () { return document.querySelector('#screen-player').dataset.status === 'playing'; });
    // Immagine ferma senza errori: il tempo avanza, poi si blocca e il controllo riapre lo stream.
    await page.evaluate(function () {
      window.fakeTicker = window.setInterval(function () { window.fakeAvplay.time += 500; }, 500);
    });
    await page.waitForTimeout(2500);
    await page.evaluate(function () { window.clearInterval(window.fakeTicker); });
    await waitOpens(7, 10000);
    await page.waitForFunction(function () { return document.querySelector('#screen-player').dataset.status === 'playing'; });
    await press('Escape');
    await page.waitForSelector('#screen-browse.active.mini-active');
    assert.strictEqual(await page.evaluate(function () { return window.fakeAvplay.state; }), 'PLAYING',
      'INDIETRO lascia il canale nel riquadro');
    assert.deepStrictEqual(await page.evaluate(function () {
      return window.fakeAvplay.calls.filter(function (c) { return c[0] === 'setDisplayRect'; }).pop().slice(1);
    }), [1420, 748, 440, 248], 'video ridotto al riquadro in basso a destra');
    // ▼ sull'ultimo canale resta nella lista; ▶ porta al riquadro, ◀ torna alla lista.
    await page.evaluate(function () {
      for (var i = 0; i < 20; i++) {
        var rows = document.querySelectorAll('.items .row');
        Nav.focus(rows[rows.length - 1]);
      }
    });
    await press('ArrowDown');
    assert.strictEqual(await page.evaluate(function () { return Nav.current.getAttribute('data-zone'); }), 'browse-items', '▼ non esce dalla lista');
    await press('ArrowRight');
    assert.ok(await page.evaluate(function () { return Nav.current.classList.contains('mini-player'); }), '▶ porta al riquadro');
    await press('ArrowLeft');
    assert.strictEqual(await page.evaluate(function () { return Nav.current.getAttribute('data-zone'); }), 'browse-items', '◀ torna alla lista');
    await press('Escape', 3); // canali -> categorie -> tab -> Home a riquadri, il canale continua
    await page.waitForSelector('#screen-launcher.active.mini-active');
    assert.strictEqual(await page.evaluate(function () { return window.fakeAvplay.state; }), 'PLAYING');
    assert.deepStrictEqual(await page.evaluate(function () {
      return window.fakeAvplay.calls.filter(function (c) { return c[0] === 'setDisplayRect'; }).pop().slice(1);
    }), [96, 196, 840, 472], 'video nel riquadro Live TV della Home');
    await press('Escape'); // nella Home INDIETRO chiude il riquadro
    assert.strictEqual(await page.evaluate(function () { return window.fakeAvplay.state; }), 'NONE', 'player chiuso');
    assert.ok(!(await page.evaluate(function () { return document.documentElement.classList.contains('playing'); })));
    await press('Enter'); // riquadro Live TV: di nuovo la lista, con il focus sul tab
    await page.waitForSelector('#screen-browse.active');
  });

  await step('diretta: al ritorno dalla sospensione si riapre dal vivo', async function () {
    await page.evaluate(function () { Player.play('http://x.test/live/demo/demo/1.ts', 0, true); });
    await page.waitForFunction(function () { return window.fakeAvplay.state === 'PLAYING'; });
    var opens = await page.evaluate(function () {
      return window.fakeAvplay.calls.filter(function (c) { return c[0] === 'open'; }).length;
    });
    // Nascosta per un attimo (barra del volume): lo stream non si tocca.
    await page.evaluate(function () { Player.suspend(); Player.restore(); });
    await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(function () {
      return window.fakeAvplay.calls.filter(function (c) { return c[0] === 'open'; }).length;
    }), opens, 'sospensione breve: nessuna riapertura');
    // Nascosta a lungo (standby): la diretta riparte dal vivo.
    await page.evaluate(function () {
      var real = Date.now;
      Player.suspend();
      Date.now = function () { return real() + 60000; };
      Player.restore();
      Date.now = real;
    });
    await waitOpens(opens + 1);
    assert.strictEqual(await lastOpen(), 'http://x.test/live/demo/demo/1.ts');
    await page.evaluate(function () { Player.stop(); });
  });

  await step('film lento a caricare: nessun riavvio, avviso a schermo, riavvio solo dopo molto', async function () {
    var opens = await page.evaluate(function () {
      var fake = window.fakeAvplay;
      window.savedPrepare = fake.prepareAsync;
      window.savedOnEvent = Player.onEvent;
      fake.prepareAsync = function () { fake.state = 'READY'; }; // il contenuto non finisce mai di aprirsi
      Player.onEvent = function (type) { window.slowEvents = (window.slowEvents || []).concat(type); };
      window.realNow = Date.now;
      Player.play('http://x.test/movie/demo/demo/1.mp4', 0, false);
      return fake.calls.filter(function (c) { return c[0] === 'open'; }).length;
    });
    // 40 s di attesa (oltre i 12 s delle dirette): avviso, ma lo stream non viene riaperto.
    await page.evaluate(function () { Date.now = function () { return window.realNow() + 40000; }; });
    await page.waitForFunction(function () { return window.slowEvents.indexOf('slow') !== -1; });
    await page.waitForTimeout(1500);
    assert.strictEqual(await page.evaluate(function () {
      return window.fakeAvplay.calls.filter(function (c) { return c[0] === 'open'; }).length;
    }), opens, 'film lento: nessuna riapertura');
    // Dopo oltre due minuti senza apertura si riavvia, e la cronologia dice perché.
    await page.evaluate(function () { Date.now = function () { return window.realNow() + 130000; }; });
    await waitOpens(opens + 1, 6000);
    var log = await page.evaluate(function () {
      Date.now = window.realNow;
      window.fakeAvplay.prepareAsync = window.savedPrepare;
      Player.onEvent = window.savedOnEvent;
      return Player.history().map(function (e) { return e.text; }).join('\n');
    });
    assert.match(log, /film\/serie lento a caricare/);
    assert.match(log, /Il contenuto non si apre \(dopo 1\d\d s, film\/serie\)/);
    await page.evaluate(function () { Player.stop(); });
  });

  await step('film: riproduzione, salvataggio posizione e ripresa', async function () {
    await press('ArrowRight', 2); // dal tab Live TV: Guida TV, poi Film
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
    var opens = await page.evaluate(function () {
      return window.fakeAvplay.calls.filter(function (c) { return c[0] === 'open'; }).length;
    });
    await page.evaluate(function () { window.fakeAvplay.listener.onstreamcompleted(); });
    await waitOpens(opens + 1);
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
