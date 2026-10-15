#!/usr/bin/env node
/*
 * Test E2E di SitoTV (sitotv/): primo avvio con indirizzo da scrivere, avvii successivi con apertura
 * automatica e tasto ROSSO per cambiare indirizzo. Il sito esterno è simulato.
 *
 *   node tests/e2e/sitotv.js
 */
'use strict';

var assert = require('assert');
var path = require('path');
var chromium = require('playwright').chromium;

var APP = 'http://sitotv.test/index.html';
var DIR = path.join(__dirname, '..', '..', 'sitotv');

async function main() {
  var browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  var context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.route('http://sitotv.test/**', function (route) {
    route.fulfill({ path: path.join(DIR, new URL(route.request().url()).pathname) });
  });
  await context.route('https://sito.example/**', function (route) {
    route.fulfill({ contentType: 'text/html', body: '<title>Sito</title><a href="#">link</a>' });
  });
  var page = await context.newPage();

  // Primo avvio: modulo visibile, indirizzo senza https:// viene completato.
  await page.goto(APP);
  assert.strictEqual(await page.isVisible('#url'), true, 'modulo visibile al primo avvio');
  await page.keyboard.press('Enter');
  await page.keyboard.type('sito.example/');
  await page.keyboard.press('Enter');
  await page.waitForURL('https://sito.example/');
  assert.strictEqual(await page.title(), 'Sito');

  // Avvio successivo: conto alla rovescia, ROSSO mostra il modulo con l'indirizzo salvato.
  await page.goto(APP);
  assert.match(await page.textContent('#status'), /Apro https:\/\/sito\.example\//);
  await page.evaluate(function () {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { keyCode: 403, bubbles: true }));
  });
  assert.strictEqual(await page.isVisible('#url'), true, 'ROSSO mostra il modulo');
  assert.strictEqual(await page.inputValue('#url'), 'https://sito.example/');

  // Indirizzo non valido: resta sul modulo.
  await page.fill('#url', '   ');
  await page.click('#open');
  assert.strictEqual(await page.textContent('#status'), 'Indirizzo non valido');

  // Senza toccare nulla il sito salvato si apre da solo.
  await page.goto(APP);
  await page.waitForURL('https://sito.example/', { timeout: 8000 });

  await browser.close();
  console.log('SitoTV: OK');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
