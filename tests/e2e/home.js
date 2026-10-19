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
  // Questi test partono dalla lista canali, non dalla Home a riquadri (provata in launcher.js).
  if (!localStorage.getItem('xtreamtv.settings')) localStorage.setItem('xtreamtv.settings', JSON.stringify({ startSection: 'live' }));
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
    home: {
      url: base, token: 'ha-test-token', motion: 'binary_sensor.mov_ingresso=camera.giardino',
      // Solo il condizionatore e i sensori scelti (cameretta); il meteo è il primo trovato.
      climates: 'climate.salotto', sensors: 'sensor.temp_soggiorno; sensor.umid_soggiorno'
    }
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
    assert.strictEqual(await page.locator('.home-cam').count(), 1, 'una sola telecamera in basso a destra');
    assert.strictEqual(await page.locator('.home-chart').count(), 2);
    assert.strictEqual(await page.locator('.home-chip').count(), 5, '2 scene + 2 luci + 1 climatizzatore');
    var order = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('.home-heading'), function (n) { return n.textContent; });
    });
    assert.deepStrictEqual(order, ['Scene', 'Luci', 'Clima'], 'in alto scene, poi luci, poi clima');
    var geometry = await page.evaluate(function () {
      var cam = document.querySelector('.home-cam').getBoundingClientRect();
      var chart = document.querySelector('.home-chart').getBoundingClientRect();
      var chip = document.querySelector('.home-chip').getBoundingClientRect();
      return { camLeft: cam.left, camTop: cam.top, chartTop: chart.top, chartRight: chart.right, chipBottom: chip.bottom };
    });
    assert.ok(geometry.camLeft >= 1280 && geometry.camTop < 400, 'telecamera in alto a destra');
    assert.ok(geometry.chartTop >= 740 && geometry.chartRight < geometry.camLeft, 'grafici in basso, a sinistra della telecamera');
    assert.ok(geometry.chipBottom < 740, 'le scene stanno in alto');
    var weather = await page.textContent('.home-weather');
    assert.match(weather, /Fuori.*18\.5 °C.*Parzialmente nuvoloso.*umidità 62 %/, 'meteo fuori in basso a sinistra');
    assert.strictEqual(await page.evaluate(function () { return document.querySelector('.home-weather').getBoundingClientRect().top >= 740; }), true);
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

  await step('troppi sensori: se ne mostrano 2 (c\'è il meteo) e un avviso invita a sceglierli', async function () {
    async function openCasa(sensors) {
      await page.evaluate(function (value) {
        var config = JSON.parse(localStorage.getItem('xtreamtv.home'));
        config.sensors = value;
        localStorage.setItem('xtreamtv.home', JSON.stringify(config));
        Nav.focus(document.querySelector('[data-tab="live"]'));
      }, sensors);
      await press('Enter');
      await page.evaluate(function () { Nav.focus(document.querySelector('[data-tab="home"]')); });
      await press('Enter');
      await page.waitForSelector('.home-cam');
    }
    await openCasa('');
    assert.strictEqual(await page.locator('.home-chart').count(), 2, 'al massimo 2 grafici con il meteo');
    await page.waitForFunction(function () { return /Mostrati 2 sensori su 3/.test(document.getElementById('toast').textContent); });
    await openCasa('sensor.temp_soggiorno; sensor.umid_soggiorno');
    assert.strictEqual(await page.locator('.home-chart').count(), 2);
  });

  await step('frecce: dalle scene alle luci, al clima e ai grafici senza cambiare sezione', async function () {
    await focusTile('Cinema');
    await press('ArrowDown');
    assert.match(await page.locator('.home-tile.focused').textContent(), /Luce/, 'giù: luci');
    await press('ArrowDown');
    assert.match(await page.locator('.home-tile.focused').textContent(), /Condizionatore/, 'giù: clima');
    await press('ArrowDown');
    assert.ok(await page.evaluate(function () { return Nav.current.classList.contains('home-weather'); }), 'giù: meteo');
    await press('ArrowRight');
    assert.ok(await page.evaluate(function () { return Nav.current.classList.contains('home-chart'); }), 'destra: grafici');
  });

  await step('clima: CH+ alza la temperatura, OK spegne e riaccende', async function () {
    await focusTile('Condizionatore');
    assert.match(await page.locator('.home-tile.focused').textContent(), /Freddo.*imposta 23°.*ora 25\.5°/);
    await press('PageUp');
    await page.waitForFunction(function () { return /imposta 23\.5°/.test(document.querySelector('.home-tile.focused').textContent); });
    var log = await haLog();
    assert.deepStrictEqual(log[log.length - 1], ['climate', 'set_temperature', 'climate.salotto', 23.5]);
    await press('Enter');
    await page.waitForFunction(function () { return /Spento/.test(document.querySelector('.home-tile.focused').textContent); });
    log = await haLog();
    assert.deepStrictEqual(log[log.length - 1], ['climate', 'turn_off', 'climate.salotto']);
    await press('Enter');
    await page.waitForFunction(function () { return !/Spento/.test(document.querySelector('.home-tile.focused').textContent); });
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
    await page.waitForFunction(function () { return document.querySelector('#home-popup img').getAttribute('src'); });
    assert.match(await page.locator('#home-popup img').getAttribute('src'), /camera_proxy\/camera\.giardino/);
    assert.ok(await page.evaluate(function () {
      var img = document.querySelector('#home-popup img');
      return img.complete && img.naturalWidth > 0;
    }), 'l\'immagine del riquadro è caricata, non nera');
    assert.strictEqual(await page.evaluate(function () {
      return getComputedStyle(document.getElementById('home-popup')).opacity;
    }), '0.75', 'il riquadro è un po trasparente');
    await press('Enter');
    await page.waitForSelector('#screen-camera.active.mini-active');
    assert.match(await page.locator('.camera-title').textContent(), /Giardino/);
    assert.strictEqual(await page.locator('#home-popup.visible').count(), 0, 'il riquadro si chiude');
    assert.deepStrictEqual(await page.evaluate(function () { return window.fakeAvplay.rect; }), [60, 748, 440, 248],
      'il canale resta in basso a sinistra mentre la telecamera è a schermo intero');
    assert.strictEqual(await page.evaluate(function () { return window.fakeAvplay.state; }), 'PLAYING');
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

  await step('Casa con un canale nel riquadro: telecamera e canale grandi, in colonna a destra', async function () {
    await press('Escape'); // dal canale a schermo intero al riquadro
    await page.waitForSelector('#screen-browse.active.mini-active');
    await page.evaluate(function () { Nav.focus(document.querySelector('[data-tab="home"]')); });
    await press('Enter');
    await page.waitForSelector('.home-cam');
    await page.waitForFunction(function () { return window.fakeAvplay.rect && window.fakeAvplay.rect[2] === 560; });
    assert.deepStrictEqual(await page.evaluate(function () { return window.fakeAvplay.rect; }), [1300, 681, 560, 315],
      'canale grande in basso a destra');
    var boxes = await page.evaluate(function () {
      var cam = document.querySelector('.home-cam').getBoundingClientRect();
      var mini = document.querySelector('.mini-player').getBoundingClientRect();
      return { camW: cam.width, camBottom: cam.bottom, camLeft: cam.left, miniTop: mini.top, miniLeft: mini.left, miniW: mini.width };
    });
    assert.strictEqual(boxes.camW, 560, 'telecamera grande');
    assert.ok(boxes.camBottom < boxes.miniTop, 'telecamera sopra il canale');
    assert.strictEqual(boxes.camLeft, boxes.miniLeft, 'stessa colonna');
    assert.strictEqual(boxes.miniW, 560);
    // Frecce: telecamera -> canale (giù) -> telecamera (su) -> riquadri a sinistra (sinistra); fine riga -> telecamera.
    function focusedKind() {
      return page.evaluate(function () {
        var c = Nav.current;
        if (c.classList.contains('mini-player')) return 'canale';
        if (c.classList.contains('home-cam')) return 'telecamera';
        if (c.classList.contains('tab')) return 'tab';
        return 'sinistra:' + c.textContent.slice(0, 12);
      });
    }
    await focusTile('Giardino');
    await press('ArrowDown');
    assert.strictEqual(await focusedKind(), 'canale', 'giù dalla telecamera: il canale');
    await press('ArrowUp');
    assert.strictEqual(await focusedKind(), 'telecamera', 'su dal canale: la telecamera');
    await press('ArrowLeft');
    assert.match(await focusedKind(), /^sinistra:/, 'sinistra dalla telecamera: un riquadro a sinistra, non la barra');
    await press('ArrowDown');
    await press('ArrowDown');
    await press('ArrowDown');
    await press('ArrowRight');
    await press('ArrowRight');
    await press('ArrowRight');
    await press('ArrowRight');
    assert.ok(['canale', 'telecamera'].indexOf(await focusedKind()) !== -1, 'a fine riga ▶ porta a telecamera o canale');
    await focusTile('Sera');
    await press('ArrowRight');
    assert.strictEqual(await focusedKind(), 'telecamera', 'a fine riga delle scene: la telecamera');
    await press('ArrowDown');
    await press('ArrowLeft');
    await focusTile('Giardino');
    await press('ArrowDown');
    await press('ArrowLeft');
    assert.match(await focusedKind(), /^sinistra:/, 'sinistra dal canale: un riquadro a sinistra');
    await page.evaluate(function () { MiniPlayer.expand(); }); // di nuovo a schermo intero per i passi successivi
    await page.waitForSelector('#screen-player.active');
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

  await step('impostazioni: elenco delle entità disponibili', async function () {
    await page.evaluate(function () { Nav.focus(document.querySelector('#setting-home-list')); });
    await press('Enter');
    await page.waitForSelector('.home-listing .info-row');
    var text = await page.textContent('.home-listing');
    assert.match(text, /camera\.ingresso/);
    assert.match(text, /climate\.cucina/, 'elenca anche i condizionatori esclusi dal filtro');
    assert.match(text, /weather\.casa/);
  });

  await step('impostazioni: diagnostica e pulsante di prova del riquadro', async function () {
    assert.match(await page.textContent('.home-diag'), /connesso/, 'tempo reale connesso');
    await page.evaluate(function () { Nav.focus(document.querySelector('#setting-home-test')); });
    await press('Enter');
    await page.waitForSelector('#home-popup.visible');
    await press('Escape'); // chiude il riquadro senza uscire
    assert.strictEqual(await page.locator('#home-popup.visible').count(), 0);
  });

  await step('impostazioni: il riquadro del movimento si può disattivare', async function () {
    assert.match(await page.textContent('#setting-home-popup'), /Sì/);
    await page.evaluate(function () { Nav.focus(document.querySelector('#setting-home-popup')); });
    await press('Enter');
    assert.match(await page.textContent('#setting-home-popup'), /No/);
    await page.evaluate(function () {
      App.show('player', { playlist: [{ type: 'live', id: '1001', name: 'Canale 1', num: 1, categoryId: '1' }], index: 0 });
    });
    await page.waitForSelector('#screen-player.active');
    await page.evaluate(function () {
      Home.handleEvent({
        old_state: { state: 'off' },
        new_state: { entity_id: 'binary_sensor.mov_ingresso', state: 'on', attributes: { device_class: 'motion' } }
      });
    });
    await page.waitForTimeout(400);
    assert.strictEqual(await page.locator('#home-popup.visible').count(), 0, 'disattivato: nessun riquadro');
    assert.match(await page.evaluate(function () { return Home.status.note; }), /disattivato/, 'la diagnostica spiega il motivo');
  });

  await step('sensore senza tipo ma abbinato nelle Impostazioni: il riquadro compare', async function () {
    await page.evaluate(function () {
      var config = JSON.parse(localStorage.getItem('xtreamtv.home'));
      config.popup = true;
      localStorage.setItem('xtreamtv.home', JSON.stringify(config));
      Home.handleEvent({
        old_state: { state: 'off' },
        new_state: { entity_id: 'binary_sensor.mov_ingresso', state: 'on', attributes: {} }
      });
    });
    await page.waitForSelector('#home-popup.visible');
  });

  await step('telecamere scelte nelle Impostazioni: le altre non compaiono', async function () {
    var ids = await page.evaluate(function () {
      var config = JSON.parse(localStorage.getItem('xtreamtv.home'));
      config.cameras = 'camera.ingresso';
      localStorage.setItem('xtreamtv.home', JSON.stringify(config));
      return Home.loadStates().then(function (data) {
        return data.cameras.map(function (c) { return c.id; });
      });
    });
    assert.deepStrictEqual(ids, ['camera.ingresso']);
  });

  await step('condizionatori, sensori e meteo: vuoto = tutti, altrimenti solo quelli scelti', async function () {
    var counts = await page.evaluate(function () {
      var config = JSON.parse(localStorage.getItem('xtreamtv.home'));
      config.climates = '';
      config.sensors = '';
      localStorage.setItem('xtreamtv.home', JSON.stringify(config));
      return Home.loadStates().then(function (data) {
        return { climates: data.climates.length, temps: data.temps.length, hums: data.hums.length, weathers: data.weathers.length };
      });
    });
    assert.deepStrictEqual(counts, { climates: 2, temps: 2, hums: 1, weathers: 1 });
  });

  assert.deepStrictEqual(errors, [],'nessun errore JavaScript: ' + errors.join('; '));
  await browser.close();
  server.close();
  console.log('Test Casa: tutto ok');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
