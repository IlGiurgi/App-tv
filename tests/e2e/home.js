#!/usr/bin/env node
/*
 * Test E2E del tab "Casa" (Home Assistant) sulla TV: telecamere, grafici, luci, scene, schermo intero e
 * riquadro del sensore di movimento, contro il Home Assistant finto di dev/mock-ha.js (REST + WebSocket).
 *
 *   node tests/e2e/home.js
 */
'use strict';

var assert = require('assert');
var chromium = require('playwright').chromium;
var server = require('../../dev/mock-server.js');

/* Eseguito nella pagina prima degli script dell'app: finto AVPlay (= TV) e collegamento a Home Assistant. */
function installTv(config) {
  localStorage.setItem('xtreamtv.account', JSON.stringify(config.account));
  if (!localStorage.getItem('xtreamtv.home')) localStorage.setItem('xtreamtv.home', JSON.stringify(config.home));
  var fake = {
    state: 'NONE',
    open: function () { fake.state = 'IDLE'; }, setDisplayRect: function () {}, setDisplayMethod: function () {},
    setListener: function () {}, prepareAsync: function (ok) { fake.state = 'READY'; setTimeout(ok, 10); },
    play: function () { fake.state = 'PLAYING'; }, pause: function () {}, stop: function () { fake.state = 'IDLE'; },
    close: function () { fake.state = 'NONE'; }, seekTo: function () {}, getState: function () { return fake.state; },
    getDuration: function () { return 0; }, getCurrentTime: function () { return 0; }, suspend: function () {}, restore: function () {}
  };
  window.webapis = { avplay: fake };
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
    home: { url: base, token: 'ha-test-token', motion: 'binary_sensor.mov_ingresso=camera.giardino' }
  });

  async function press(key, times) {
    for (var i = 0; i < (times || 1); i++) {
      await page.keyboard.press(key);
      await page.waitForTimeout(60);
    }
  }
  function haLog() {
    return page.evaluate(function (b) { return fetch(b + '/mock-ha/log').then(function (r) { return r.json(); }); }, base);
  }
  /** Porta il focus sul riquadro della dashboard che contiene il testo. */
  async function focusTile(text) {
    var found = await page.evaluate(function (t) {
      var tile = Array.prototype.filter.call(document.querySelectorAll('.home-tile'), function (el) {
        return el.textContent.indexOf(t) !== -1;
      })[0];
      if (tile) Nav.focus(tile);
      return !!tile;
    }, text);
    assert.ok(found, 'riquadro non trovato: ' + text);
  }
  async function step(name, fn) {
    await fn();
    console.log('ok -', name);
  }

  await page.goto(base);
  await page.waitForSelector('#screen-browse.active .items .row');

  await step('tab Casa sulla TV: dashboard con telecamere, clima, luci e scene in una schermata', async function () {
    await page.evaluate(function () { Nav.focus(document.querySelector('[data-tab="home"]')); });
    await press('Enter');
    await page.waitForSelector('.home-cam');
    assert.strictEqual(await page.locator('.home-cam').count(), 2);
    assert.strictEqual(await page.locator('.home-chart').count(), 2);
    assert.strictEqual(await page.locator('.home-chip').count(), 4, '2 luci + 2 scene');
    assert.strictEqual(await page.locator('.categories').isVisible(), false, 'niente sezioni da scorrere');
    await page.waitForFunction(function () {
      var img = document.querySelector('.home-cam-img');
      return img && img.complete && img.naturalWidth > 0;
    });
    assert.match(await page.locator('.home-cam-img').first().getAttribute('src'), /\/api\/camera_proxy\/camera\.giardino\?token=def/);
    assert.match(await page.locator('.home-chart-value').first().textContent(), /48 %|21\.4 °C/);
    await page.waitForFunction(function () {
      var canvas = document.querySelector('.home-chart-canvas');
      var data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (var i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
      return false;
    });
  });

  await step('frecce: dalle telecamere ai grafici e alle luci senza cambiare sezione', async function () {
    await page.evaluate(function () { Nav.focus(document.querySelector('.home-cam')); });
    await press('ArrowDown');
    assert.ok(await page.evaluate(function () { return Nav.current.classList.contains('home-chart'); }), 'giù: clima');
    await press('ArrowDown');
    assert.ok(await page.evaluate(function () { return Nav.current.classList.contains('home-chip'); }), 'giù: luci');
  });

  await step('OK su una telecamera: stream a schermo intero e INDIETRO', async function () {
    await page.evaluate(function () { Nav.focus(document.querySelector('.home-cam')); });
    await press('Enter');
    await page.waitForSelector('#screen-camera.active');
    assert.match(await page.locator('.camera-full').getAttribute('src'), /\/api\/camera_proxy_stream\/camera\.giardino/);
    await press('ArrowRight');
    assert.match(await page.locator('.camera-title').textContent(), /Ingresso\s+·\s+2\/2/);
    await press('Escape');
    await page.waitForSelector('#screen-browse.active');
    assert.ok(!(await page.locator('.camera-full').getAttribute('src')), 'lo stream si chiude uscendo');
  });

  await step('luci: OK accende/spegne', async function () {
    await focusTile('Luce camera');
    assert.match(await page.locator('.home-tile.focused').textContent(), /Spenta/);
    await press('Enter');
    await page.waitForFunction(function () { return /Accesa/.test(document.querySelector('.home-tile.focused').textContent); });
    assert.ok(await page.locator('.home-tile.focused.light-on').count());
    var log = await haLog();
    assert.deepStrictEqual(log[log.length - 1], ['light', 'turn_on', 'light.camera']);
  });

  await step('scene: OK le attiva', async function () {
    await focusTile('Cinema');
    await press('Enter');
    await page.waitForFunction(function () { return /attivata/.test(document.getElementById('toast').textContent); });
    var log = await haLog();
    assert.deepStrictEqual(log[log.length - 1], ['scene', 'turn_on', 'scene.cinema']);
  });

  await step('movimento mentre guardi un canale: riquadro, OK ingrandisce, INDIETRO torna al canale', async function () {
    await page.evaluate(function () {
      App.show('player', { playlist: [{ type: 'live', id: '1001', name: 'Canale 1', num: 1, categoryId: '1' }], index: 0 });
    });
    await page.waitForSelector('#screen-player.active');
    await page.waitForFunction(function () { return Home.ws && Home.ws.readyState === 1; });
    await page.waitForTimeout(300);
    await page.evaluate(function (b) { return fetch(b + '/mock-ha/motion'); }, base);
    await page.waitForSelector('#home-popup.visible');
    assert.match(await page.locator('#home-popup img').getAttribute('src'), /camera_proxy\/camera\.giardino/);
    await press('Enter');
    await page.waitForSelector('#screen-camera.active');
    assert.match(await page.locator('.camera-title').textContent(), /Giardino/);
    assert.strictEqual(await page.locator('#home-popup.visible').count(), 0, 'il riquadro si chiude');
    await press('Escape');
    await page.waitForSelector('#screen-player.active');
  });

  await step('il riquadro si chiude con INDIETRO senza uscire dal canale', async function () {
    // Il sensore è già "on" nel finto HA: l'evento di un nuovo scatto (off -> on) si genera a mano.
    await page.evaluate(function () {
      Home.handleEvent({
        old_state: { state: 'off' },
        new_state: { entity_id: 'binary_sensor.mov_ingresso', state: 'on', attributes: { device_class: 'motion' } }
      });
    });
    await page.waitForSelector('#home-popup.visible');
    await press('Escape');
    assert.strictEqual(await page.locator('#home-popup.visible').count(), 0);
    assert.strictEqual(await page.locator('#screen-player.active').count(), 1, 'il canale resta aperto');
  });

  await step('impostazioni: sezione Casa con i campi', async function () {
    await press('Escape'); // dal canale al riquadro nella lista
    await page.waitForSelector('#screen-browse.active');
    await page.evaluate(function () { Nav.focus(document.querySelector('[data-tab="settings"]')); });
    await press('Enter');
    await page.waitForSelector('#home-url');
    assert.strictEqual(await page.inputValue('#home-url'), base);
    assert.strictEqual(await page.locator('#home-token').count(), 1);
    assert.strictEqual(await page.locator('#setting-home-save').count(), 1);
  });

  assert.deepStrictEqual(errors, [], 'nessun errore JavaScript: ' + errors.join('; '));
  await browser.close();
  server.close();
  console.log('Test Casa: tutto ok');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
