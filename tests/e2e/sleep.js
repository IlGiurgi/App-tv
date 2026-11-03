#!/usr/bin/env node
/*
 * Test E2E sulla TV di: timer di spegnimento, "Stai ancora guardando?", scene di Home Assistant
 * all'avvio/fine di un film e avvisi dei sensori senza telecamera.
 *
 *   node tests/e2e/sleep.js
 */
'use strict';

var assert = require('assert');
var chromium = require('playwright').chromium;
var server = require('../../dev/mock-server.js');

function installTv(config) {
  localStorage.setItem('xtreamtv.account', JSON.stringify(config.account));
  localStorage.setItem('xtreamtv.home', JSON.stringify(config.home));
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
    home: {
      url: base, token: 'ha-test-token', cameras: 'camera.giardino',
      alerts: 'binary_sensor.porta_ingresso=Porta aperta', sceneStart: 'scene.cinema', sceneEnd: 'scene.sera'
    }
  });

  async function step(name, fn) {
    await fn();
    console.log('ok -', name);
  }
  function haLog() {
    return page.evaluate(function () { return fetch('/mock-ha/log').then(function (r) { return r.json(); }); });
  }
  function openChannel() {
    return page.evaluate(function () {
      return App.loadSection('live').then(function (data) {
        App.show('player', { playlist: data.items.slice(0, 3), index: 0 });
      });
    });
  }
  function playerOpen() {
    return page.evaluate(function () { return App.current() === App.screens.player; });
  }

  await page.goto(base);
  await page.waitForSelector('#screen-launcher.active');

  await step('timer: ⏯ sul live lo imposta, un tasto durante l\'avviso lo annulla', async function () {
    await openChannel();
    await page.waitForSelector('#screen-player.active');
    await page.evaluate(function () { App.handleAction('playpause'); });
    assert.strictEqual(await page.evaluate(function () { return Sleep.remaining(); }), 30);
    assert.match(await page.textContent('.player-tags'), /30 min/);
    await page.evaluate(function () { Sleep.check(Date.now() + 29.5 * 60000); });
    await page.waitForSelector('#sleep-prompt.visible');
    await page.keyboard.press('ArrowDown'); // chiude l'avviso senza cambiare canale
    assert.ok(!(await page.isVisible('#sleep-prompt')));
    assert.strictEqual(await page.evaluate(function () { return Sleep.remaining(); }), 0);
    assert.ok(await playerOpen());
  });

  await step('timer scaduto: la riproduzione si ferma e si torna alla Home', async function () {
    await page.evaluate(function () { App.handleAction('playpause'); });
    await page.evaluate(function () { Sleep.check(Date.now() + 29.5 * 60000); });
    await page.waitForSelector('#sleep-prompt.visible');
    await page.evaluate(function () { Sleep.check(Date.now() + 31 * 60000); });
    assert.ok(!(await page.isVisible('#sleep-prompt')));
    assert.ok(!(await playerOpen()));
    assert.strictEqual(await page.evaluate(function () { return !!Player.url; }), false);
  });

  await step('inattività: dopo le ore scelte chiede e poi ferma', async function () {
    await openChannel();
    await page.waitForSelector('#screen-player.active');
    await page.evaluate(function () {
      App.settings.idleHours = 2;
      Sleep.setLastActivity(Date.now() - 3 * 3600000);
      Sleep.check();
    });
    await page.waitForSelector('#sleep-prompt.visible');
    await page.keyboard.press('ArrowDown');
    assert.ok(await playerOpen());
    await page.evaluate(function () {
      Sleep.setLastActivity(Date.now() - 3 * 3600000);
      Sleep.check();
      Sleep.check(Date.now() + 61000);
    });
    assert.ok(!(await playerOpen()));
  });

  await step('scene: parte all\'inizio di un film e quella di fine a riproduzione ferma', async function () {
    await page.evaluate(function () { Cinema.setEndDelay(200); });
    await page.evaluate(function () {
      return App.loadSection('vod').then(function (data) {
        App.show('player', { playlist: [data.items[0]], index: 0 });
      });
    });
    await page.waitForFunction(function () {
      return fetch('/mock-ha/log').then(function (r) { return r.json(); }).then(function (log) {
        return log.some(function (e) { return e[2] === 'scene.cinema'; });
      });
    }, null, { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(function () {
      return fetch('/mock-ha/log').then(function (r) { return r.json(); }).then(function (log) {
        return log.some(function (e) { return e[2] === 'scene.sera'; });
      });
    }, null, { timeout: 5000 });
    var log = await haLog();
    assert.strictEqual(log.filter(function (e) { return e[2] === 'scene.cinema'; }).length, 1);
  });

  await step('avvisi: il sensore della porta mostra un riquadro con il testo, OK lo chiude', async function () {
    await page.waitForFunction(function () { return Home.status.ws === 'connesso'; }, null, { timeout: 8000 });
    await page.evaluate(function () { return fetch('/mock-ha/motion?entity=binary_sensor.porta_ingresso'); });
    await page.waitForSelector('#home-popup.visible.text-only');
    assert.match(await page.textContent('#home-popup'), /Porta aperta/);
    await page.keyboard.press('Enter');
    assert.ok(!(await page.isVisible('#home-popup')));
  });

  assert.deepStrictEqual(errors, [], 'errori JavaScript nella pagina');
  await browser.close();
  server.close();
  console.log('\nTest timer, scene e avvisi superati.');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
