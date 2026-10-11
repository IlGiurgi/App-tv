#!/usr/bin/env node
/*
 * Test E2E della versione web: uso col mouse, rotellina, e riproduzione tramite mpegts.js / hls.js.
 * Le librerie dal CDN vengono sostituite da finti player che registrano le chiamate.
 *
 *   node tests/e2e/web.js
 */
'use strict';

var assert = require('assert');
var chromium = require('playwright').chromium;
var server = require('../../dev/mock-server.js');

var FAKE_MPEGTS = [
  'window.libCalls = window.libCalls || [];',
  'window.mpegts = {',
  '  Events: { ERROR: "error" },',
  '  isSupported: function () { return true; },',
  '  createPlayer: function (source) {',
  '    libCalls.push(["mpegts.create", source.url, source.type]);',
  '    return { on: function () {}, attachMediaElement: function () { libCalls.push(["mpegts.attach"]); },',
  '      load: function () { libCalls.push(["mpegts.load"]); }, destroy: function () { libCalls.push(["mpegts.destroy"]); } };',
  '  }',
  '};'
].join('\n');

var FAKE_HLS = [
  'window.libCalls = window.libCalls || [];',
  'function Hls() {}',
  'Hls.Events = { ERROR: "hlsError" };',
  'Hls.isSupported = function () { return true; };',
  'Hls.prototype.on = function () {};',
  'Hls.prototype.loadSource = function (url) { libCalls.push(["hls.load", url]); };',
  'Hls.prototype.attachMedia = function () { libCalls.push(["hls.attach"]); };',
  'Hls.prototype.destroy = function () { libCalls.push(["hls.destroy"]); };',
  'window.Hls = Hls;'
].join('\n');

async function main() {
  await new Promise(function (resolve) { server.listen(0, resolve); });
  var base = 'http://localhost:' + server.address().port;
  var launchOptions = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
  var browser = await chromium.launch(launchOptions);
  var page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  var errors = [];
  var cdnRequests = [];
  page.on('pageerror', function (err) { errors.push(err.message); });
  await page.route('https://cdn.jsdelivr.net/**', function (route) {
    var url = route.request().url();
    cdnRequests.push(url);
    route.fulfill({ contentType: 'application/javascript', body: /mpegts/.test(url) ? FAKE_MPEGTS : FAKE_HLS });
  });

  function libCalls() {
    return page.evaluate(function () { return window.libCalls || []; });
  }
  async function step(name, fn) {
    await fn();
    console.log('ok -', name);
  }

  await page.goto(base);
  await page.waitForSelector('#screen-login.active');

  await step('server irraggiungibile: errore con suggerimento CORS', async function () {
    await page.click('#login-server');
    await page.keyboard.type('http://127.0.0.1:9');
    await page.click('#login-username');
    await page.keyboard.type('demo');
    await page.click('#login-password');
    await page.keyboard.type('demo');
    await page.click('#login-submit');
    await page.waitForFunction(function () { return /CORS/.test(document.getElementById('login-error').textContent); });
    assert.ok(await page.evaluate(function () { return document.documentElement.classList.contains('pointer'); }));
  });

  await step('accesso col mouse', async function () {
    await page.fill('#login-server', base);
    await page.click('#login-submit');
    await page.waitForSelector('#screen-browse.active .items .row');
  });

  await step('clic su categoria e rotellina caricano altri canali', async function () {
    await page.click('.category[data-category="*"]');
    assert.strictEqual(await page.locator('.items .row').count(), 60);
    await page.hover('.items .row >> nth=3');
    for (var i = 0; i < 10 && await page.locator('.items .row').count() <= 60; i++) {
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(100);
    }
    assert.ok(await page.locator('.items .row').count() > 60, 'la rotellina deve caricare il blocco successivo');
  });

  await step('canale .ts riprodotto con mpegts.js, chiuso col pulsante Indietro', async function () {
    await page.evaluate(function () { document.querySelector('.items').scrollTop = 0; });
    await page.click('.items .row >> nth=0');
    await page.waitForSelector('#screen-player.active');
    await page.waitForFunction(function () { return (window.libCalls || []).length >= 3; });
    var calls = await libCalls();
    assert.deepStrictEqual(calls.slice(0, 3), [
      ['mpegts.create', base + '/live/demo/demo/1001.ts', 'mpegts'], ['mpegts.attach'], ['mpegts.load']
    ]);
    assert.deepStrictEqual(cdnRequests, ['https://cdn.jsdelivr.net/npm/mpegts.js@1.8.2/dist/mpegts.js']);
    await page.mouse.move(200, 200);
    await page.click('#screen-player .back-button');
    await page.waitForSelector('#screen-browse.active');
    assert.deepStrictEqual((await libCalls()).pop(), ['mpegts.destroy']);
  });

  await step('formato HLS: canale .m3u8 riprodotto con hls.js', async function () {
    await page.click('.tab[data-tab="settings"]');
    await page.click('#setting-format');
    assert.match(await page.textContent('#setting-format'), /HLS/);
    await page.click('.tab[data-tab="live"]');
    await page.waitForSelector('.items .row');
    await page.click('.items .row >> nth=1');
    await page.waitForFunction(function () {
      return (window.libCalls || []).some(function (c) { return c[0] === 'hls.attach'; });
    });
    var hlsCalls = (await libCalls()).filter(function (c) { return c[0].indexOf('hls.') === 0; });
    assert.deepStrictEqual(hlsCalls, [['hls.load', base + '/live/demo/demo/1006.m3u8'], ['hls.attach']]);
    await page.mouse.move(300, 300);
    await page.click('#screen-player .back-button');
    await page.waitForSelector('#screen-browse.active');
  });

  await step('film: clic su locandina e ritorno col pulsante Indietro', async function () {
    await page.click('.tab[data-tab="vod"]');
    await page.waitForSelector('.items .card');
    await page.click('.items .card >> nth=1');
    await page.waitForSelector('#screen-detail.active');
    await page.waitForFunction(function () { return document.querySelector('.detail-title').textContent === 'Film di prova 4'; });
    await page.click('#screen-detail .back-button');
    await page.waitForSelector('#screen-browse.active');
  });

  await step('telefono: in orizzontale l\'app è dentro lo schermo, in verticale chiede di ruotare', async function () {
    var phone = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    var mobile = await phone.newPage();
    mobile.on('pageerror', function (err) { errors.push(err.message); });
    await mobile.goto(base);
    await mobile.waitForSelector('#screen-login.active');
    var box = await mobile.evaluate(function () {
      var r = document.querySelector('.login-box').getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: document.documentElement.clientWidth, h: document.documentElement.clientHeight };
    });
    assert.ok(box.left >= 0 && box.top >= 0 && box.right <= box.w && box.bottom <= box.h,
      'riquadro di login fuori schermo: ' + JSON.stringify(box));
    assert.strictEqual(await mobile.isVisible('#rotate-hint'), false);
    await mobile.setViewportSize({ width: 390, height: 844 });
    assert.strictEqual(await mobile.isVisible('#rotate-hint'), true);
    await phone.close();
  });

  assert.deepStrictEqual(errors, [], 'errori JavaScript nella pagina');
  await browser.close();
  server.close();
  console.log('\nTest versione web superati.');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
