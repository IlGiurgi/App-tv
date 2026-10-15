/*
 * Genera le icone PNG dell'app da dev/icon/hometivu.svg (Tizen + Android) con Chromium di Playwright.
 *   node dev/icon/render.js        (CHROMIUM_PATH=... per usare un Chrome già installato)
 */
'use strict';

var fs = require('fs');
var path = require('path');
var chromium = require('playwright').chromium;

var ROOT = path.join(__dirname, '..', '..');
var RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
var BG = '#101422';
var svg = fs.readFileSync(path.join(__dirname, 'hometivu.svg'), 'utf8');
var mark = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

/** Pagina con il disegno: scale riduce il marchio (zona sicura delle icone adattive), shape = sfondo. */
function page(size, opts) {
  var scale = opts.scale || 1;
  var offset = 256 * (1 - scale);
  var bg = opts.shape === 'square' ? '<rect width="512" height="512" rx="' + (opts.radius || 0) + '" fill="' + BG + '"/>'
    : opts.shape === 'circle' ? '<circle cx="256" cy="256" r="256" fill="' + BG + '"/>' : '';
  return '<html><body style="margin:0;background:transparent">' +
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="' + size + '" height="' + size + '">' +
    bg + '<g transform="translate(' + offset + ' ' + offset + ') scale(' + scale + ')">' + mark + '</g></svg>' +
    '</body></html>';
}

function splashPage(w, h) {
  var side = Math.min(w, h);
  var icon = Math.round(side * 0.42);
  return '<html><body style="margin:0;width:' + w + 'px;height:' + h + 'px;background:' + BG + ';display:flex;' +
    'flex-direction:column;align-items:center;justify-content:center;font-family:Arial,sans-serif">' +
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="56 56 400 400" width="' + icon + '" height="' + icon + '">' + mark + '</svg>' +
    '<div style="color:#fff;font-size:' + Math.round(side * 0.075) + 'px;font-weight:bold;letter-spacing:2px;margin-top:' +
    Math.round(side * 0.03) + 'px">Home<span style="color:#5aa9ff">Tivu</span></div></body></html>';
}

async function shot(browser, html, w, h, file) {
  var p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await p.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  await p.close();
  console.log('ok', path.relative(ROOT, file), w + 'x' + h);
}

async function main() {
  var browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  // TV Samsung: quadrata con angoli arrotondati.
  await shot(browser, page(512, { shape: 'square', radius: 96, scale: 1.08 }), 512, 512, path.join(ROOT, 'app', 'hometivu.png'));
  var densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (var d in densities) {
    var k = densities[d];
    var dir = path.join(RES, 'mipmap-' + d);
    await shot(browser, page(48 * k, { shape: 'square', radius: 90, scale: 1.08 }), 48 * k, 48 * k, path.join(dir, 'ic_launcher.png'));
    await shot(browser, page(48 * k, { shape: 'circle', scale: 1.0 }), 48 * k, 48 * k, path.join(dir, 'ic_launcher_round.png'));
    // Icona adattiva: solo il marchio, nella zona sicura (66% centrale dei 108dp).
    await shot(browser, page(108 * k, { scale: 0.78 }), 108 * k, 108 * k, path.join(dir, 'ic_launcher_foreground.png'));
  }
  var splash = fs.readdirSync(RES).filter(function (n) { return /^drawable/.test(n); });
  for (var i = 0; i < splash.length; i++) {
    var file = path.join(RES, splash[i], 'splash.png');
    if (!fs.existsSync(file)) continue;
    // Stesse misure della splash esistente (larghezza e altezza nell'intestazione PNG).
    var header = fs.readFileSync(file);
    var w = header.readUInt32BE(16);
    var h = header.readUInt32BE(20);
    await shot(browser, splashPage(w, h), w, h, file);
  }
  await browser.close();
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
