#!/usr/bin/env node
/*
 * Smoke test end-to-end: avvia il mock server, apre l'app in Chromium a 1920x1080
 * e la usa solo con la tastiera (frecce, Invio, Esc = INDIETRO, F1 = ROSSO), come un telecomando.
 *
 *   node tests/e2e/smoke.js [cartella-screenshot]
 */
'use strict';

var path = require('path');
var assert = require('assert');
var chromium = require('playwright').chromium;
var server = require('../../dev/mock-server.js');

var SHOTS = process.argv[2] || path.join(__dirname, '..', '..', 'test-results');

function listen() {
  return new Promise(function (resolve) {
    server.listen(0, function () { resolve(server.address().port); });
  });
}

async function main() {
  var port = await listen();
  var base = 'http://localhost:' + port;
  var launchOptions = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
  var browser = await chromium.launch(launchOptions);
  var page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  var errors = [];
  page.on('pageerror', function (err) { errors.push(err.message); });

  async function press(key, times) {
    for (var i = 0; i < (times || 1); i++) {
      await page.keyboard.press(key);
      await page.waitForTimeout(60);
    }
  }
  function focusedText() {
    return page.evaluate(function () { return Nav.current ? Nav.current.textContent : null; });
  }
  async function activeScreen() {
    return page.evaluate(function () { return document.querySelector('.screen.active').id; });
  }
  async function shot(name) {
    await page.screenshot({ path: path.join(SHOTS, name + '.png') });
  }
  async function step(name, fn) {
    await fn();
    console.log('ok -', name);
  }

  await page.goto(base);

  await step('login con credenziali errate mostra un errore', async function () {
    await page.waitForSelector('#screen-login.active');
    await press('Enter');
    await page.keyboard.type(base);
    await press('Enter');
    await press('ArrowDown');
    await press('Enter');
    await page.keyboard.type('demo');
    await press('Enter');
    await press('ArrowDown');
    await press('Enter');
    await page.keyboard.type('sbagliata');
    await press('Enter');
    await press('ArrowDown');
    assert.strictEqual(await focusedText(), 'Accedi');
    await press('Enter');
    await page.waitForFunction(function () {
      return document.getElementById('login-error').textContent === 'Credenziali non valide';
    });
    await shot('01-login');
  });

  await step('login corretto apre la home con i canali live', async function () {
    await press('ArrowUp');
    await press('Enter');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('demo');
    await press('Enter');
    await press('ArrowDown');
    await press('Enter');
    await page.waitForSelector('#screen-browse.active');
    await page.waitForSelector('.items .row');
    assert.strictEqual(await page.locator('.items .row').count(), 52);
    assert.strictEqual(await page.textContent('.items-title'), 'Italia');
    await shot('02-live');
  });

  await step('navigazione: tab -> categorie -> canali, caricamento a blocchi', async function () {
    await press('ArrowDown');
    assert.strictEqual(await focusedText(), 'Tutti260');
    await press('ArrowDown', 2);
    await page.waitForTimeout(400);
    assert.strictEqual(await page.textContent('.items-title'), 'Sport');
    await press('ArrowUp', 2);
    await page.waitForTimeout(400);
    assert.strictEqual(await page.textContent('.items-title'), 'Tutti');
    assert.strictEqual(await page.locator('.items .row').count(), 60, 'primo blocco da 60');
    await press('ArrowRight');
    await press('ArrowDown', 55);
    assert.ok(await page.locator('.items .row').count() > 60, 'il blocco successivo deve essere caricato');
    assert.match(await focusedText(), /56/);
    await press('ArrowLeft');
    assert.strictEqual(await focusedText(), 'Tutti260', 'torna alla categoria ricordata');
    await press('Enter');
    assert.match(await focusedText(), /^56Italia 56/, 'OK sulla categoria riporta al canale ricordato');
  });

  await step('ROSSO aggiunge il canale ai preferiti', async function () {
    await press('F1');
    assert.strictEqual(await page.locator('.items .row.is-favorite').count(), 1);
  });

  await step('in fondo alla lista ▼ non salta alle categorie', async function () {
    await page.evaluate(function () {
      // La lista si carica a blocchi: ci si porta fino all'ultimo canale vero.
      for (var i = 0; i < 20; i++) {
        var rows = document.querySelectorAll('.items .row');
        Nav.focus(rows[rows.length - 1]);
      }
    });
    var before = await focusedText();
    await press('ArrowDown');
    await press('ArrowDown');
    assert.strictEqual(await focusedText(), before, 'il focus resta sull\'ultimo canale');
    assert.strictEqual(await page.evaluate(function () { return Nav.current.getAttribute('data-zone'); }), 'browse-items');
    await press('ArrowUp'); // risalendo si muove normalmente
    assert.notStrictEqual(await focusedText(), before);
    await page.evaluate(function () { Nav.focus(document.querySelector('.items .row.is-favorite') || document.querySelector('.items .row')); });
  });

  await step('apertura player, zapping e ritorno', async function () {
    await press('Enter');
    await page.waitForSelector('#screen-player.active');
    assert.strictEqual(await page.textContent('.player-title'), 'Italia 56');
    await page.waitForFunction(function () {
      return document.querySelector('.epg-now').textContent.indexOf('Telegiornale è in onda') !== -1;
    });
    await press('ArrowUp');
    assert.strictEqual(await page.textContent('.player-title'), 'Sport 57');
    // Lo stream finto non esiste: il player riprova da solo prima di arrendersi.
    await page.waitForFunction(function () {
      return /riprovo \(\d di 6\)/.test(document.querySelector('.player-status').textContent);
    });
    await shot('03-player');
    await press('Escape');
    await page.waitForSelector('#screen-browse.active');
    assert.match(await focusedText(), /Italia 56/);
  });

  await step('INDIETRO risale fino ai tab, poi chiede conferma per uscire', async function () {
    await press('Escape');
    assert.match(await focusedText(), /^Tutti/);
    await press('Escape');
    assert.strictEqual(await focusedText(), 'Live TV');
    // Il canale che sta riprovando è rimasto nel riquadro: il primo INDIETRO dalle tab lo chiude.
    assert.ok(await page.evaluate(function () { return MiniPlayer.active; }), 'canale nel riquadro');
    await press('Escape');
    assert.ok(!(await page.evaluate(function () { return MiniPlayer.active; })), 'riquadro chiuso');
    await press('Escape');
    await page.waitForFunction(function () {
      return document.getElementById('toast').textContent.indexOf('per uscire') !== -1;
    });
    assert.strictEqual(await activeScreen(), 'screen-browse');
  });

  await step('guida TV: griglia oraria con i programmi dei canali', async function () {
    await press('ArrowRight');
    assert.strictEqual(await focusedText(), 'Guida TV');
    await press('Enter');
    await page.waitForSelector('.items.layout-guide .guide-prog.now');
    assert.ok(await page.locator('.guide-header .guide-time').count() >= 6, 'fascia di 3 ore a mezz\'ore');
    await press('ArrowDown');
    await press('Enter'); // OK su "Tutti": primo programma della guida
    assert.match(await page.textContent('.epg-info-now'), /Italia 1 .*Telegiornale/);
    await shot('04-guida');
    await press('Escape', 2);
    assert.strictEqual(await focusedText(), 'Guida TV');
  });

  await step('film: griglia e dettaglio', async function () {
    await press('ArrowRight');
    assert.strictEqual(await focusedText(), 'Film');
    await press('Enter');
    await page.waitForSelector('.items .card');
    assert.strictEqual(await page.textContent('.items-title'), 'Azione');
    await shot('04-film');
    await press('ArrowDown');
    await press('ArrowRight');
    await press('ArrowRight');
    await press('Enter');
    await page.waitForSelector('#screen-detail.active');
    await page.waitForFunction(function () {
      return document.querySelector('.detail-meta').textContent.indexOf('2023') === 0;
    });
    assert.strictEqual(await focusedText(), '▶ Riproduci');
    await shot('05-film-detail');
    await press('Escape');
    await page.waitForSelector('#screen-browse.active');
  });

  await step('serie: stagioni ed episodi', async function () {
    await press('Escape', 2);
    assert.strictEqual(await focusedText(), 'Film');
    await press('ArrowRight');
    assert.strictEqual(await focusedText(), 'Serie TV');
    await press('Enter');
    await page.waitForSelector('.items .card');
    await press('ArrowDown');
    await press('ArrowRight');
    await press('Enter');
    await page.waitForSelector('#screen-detail.active .episode');
    assert.strictEqual(await page.locator('.episode').count(), 8);
    await press('ArrowDown');
    assert.strictEqual(await focusedText(), 'Stagione 1');
    await press('ArrowRight');
    assert.strictEqual(await page.locator('.episode').count(), 5);
    await press('ArrowDown');
    assert.match(await focusedText(), /^1\. S02E01 - Episodio 1/);
    await shot('06-serie');
    await press('Escape');
  });

  await step('preferiti', async function () {
    await press('Escape', 2);
    await press('ArrowRight');
    assert.strictEqual(await focusedText(), 'Preferiti');
    await press('Enter');
    assert.strictEqual(await page.locator('.items .row').count(), 1);
    assert.match(await page.textContent('.items .row'), /Italia 56/);
  });

  await step('ricerca', async function () {
    await press('ArrowRight');
    await press('Enter');
    await press('ArrowDown');
    assert.strictEqual(await page.evaluate(function () { return Nav.current.id; }), 'search-input');
    await press('Enter');
    await page.keyboard.type('prova 7');
    await press('Enter');
    await page.waitForFunction(function () {
      return /risultati/.test(document.querySelector('.items-title').textContent);
    });
    var title = await page.textContent('.items-title');
    assert.strictEqual(title, '12 risultati per "prova 7"');
    await shot('07-ricerca');
  });

  await step('impostazioni', async function () {
    await press('ArrowUp');
    await press('ArrowRight');
    assert.strictEqual(await focusedText(), 'Impostazioni');
    await press('Enter');
    await press('ArrowDown');
    assert.match(await focusedText(), /Formato canali live: MPEG-TS/);
    await press('Enter');
    assert.match(await focusedText(), /HLS/);
    assert.strictEqual(await page.evaluate(function () {
      return JSON.parse(localStorage.getItem('xtreamtv.settings')).liveFormat;
    }), 'm3u8');
    await press('ArrowDown');
    assert.match(await focusedText(), /Apri all'avvio: Live TV/);
    await press('Enter');
    assert.match(await focusedText(), /Apri all'avvio: Preferiti/);
    await shot('08-impostazioni');
  });

  await step('la sessione resta salvata dopo il riavvio e riparte l\'ultimo canale', async function () {
    await page.reload();
    await page.waitForSelector('#screen-player.active');
    assert.strictEqual(await page.textContent('.player-title'), 'Sport 57');
    await press('Escape');
    await page.waitForSelector('#screen-browse.active .items .row');
    // "Apri all'avvio: Preferiti": sotto il canale c'è la sezione Preferiti, sui canali TV.
    assert.strictEqual(await page.textContent('.tab.selected'), 'Preferiti');
    assert.strictEqual(await page.textContent('.category.selected .category-name'), 'Canali TV');
  });

  assert.deepStrictEqual(errors, [], 'errori JavaScript nella pagina');
  await browser.close();
  server.close();
  console.log('\nTutti i test E2E sono passati. Screenshot in ' + SHOTS);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
