/*
 * SitoTV: apre a schermo intero un sito scelto dall'utente.
 * L'indirizzo si scrive al primo avvio e viene ricordato; agli avvii successivi il sito si apre
 * da solo dopo qualche secondo, e il tasto ROSSO (o OK) in quel momento permette di cambiarlo.
 * Il sito è aperto nella finestra dell'app (non in un iframe), così riceve direttamente
 * frecce, OK e INDIETRO e funziona anche con i siti che vietano l'incorporamento.
 */
(function () {
  'use strict';

  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27, RED: 403 };
  var STORE = 'sitotv.url';
  var DELAY = 4;

  var input = document.getElementById('url');
  var button = document.getElementById('open');
  var form = document.getElementById('form');
  var status = document.getElementById('status');
  var items = [input, button];
  var focusIndex = 0;
  var timer = null;

  function load() {
    try { return localStorage.getItem(STORE) || ''; } catch (e) { return ''; }
  }

  function save(url) {
    try { localStorage.setItem(STORE, url); } catch (e) { /* ignora */ }
  }

  /** Aggiunge https:// se manca; restituisce '' se non sembra un indirizzo. */
  function normalize(text) {
    var url = (text || '').replace(/^\s+|\s+$/g, '');
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    return /^https?:\/\/[^\s\/]+/i.test(url) && !/\s/.test(url) ? url : '';
  }

  function exitApp() {
    try { window.tizen.application.getCurrentApplication().exit(); } catch (e) { window.close(); }
  }

  function setFocus(i) {
    focusIndex = i;
    for (var k = 0; k < items.length; k++) items[k].className = k === i ? 'focus' : '';
    if (i !== 0) input.blur();
  }

  function go(url) {
    save(url);
    status.textContent = 'Apertura di ' + url + '...';
    form.className = 'hidden';
    window.location.href = url;
  }

  function submit() {
    var url = normalize(input.value);
    if (url) go(url);
    else status.textContent = 'Indirizzo non valido';
  }

  function showForm() {
    clearInterval(timer);
    timer = null;
    status.textContent = '';
    form.className = '';
    setFocus(0);
  }

  function countdown(url) {
    var left = DELAY;
    form.className = 'hidden';
    function tick() {
      if (left <= 0) { clearInterval(timer); go(url); return; }
      status.textContent = 'Apro ' + url + ' tra ' + left + ' s. Premi OK o ROSSO per cambiare indirizzo.';
      left--;
    }
    tick();
    timer = setInterval(tick, 1000);
  }

  document.addEventListener('keydown', function (e) {
    var code = e.keyCode;
    if (code === KEY.BACK || code === KEY.ESC) { e.preventDefault(); exitApp(); return; }
    if (timer) {
      if (code === KEY.RED || code === KEY.ENTER) { e.preventDefault(); showForm(); }
      return;
    }
    if (code === KEY.DOWN || code === KEY.UP) { e.preventDefault(); setFocus(code === KEY.DOWN ? 1 : 0); }
    else if (code === KEY.ENTER) {
      e.preventDefault();
      if (focusIndex === 1) submit();
      else if (document.activeElement === input) submit();
      else input.focus();
    }
  });

  button.addEventListener('click', submit);
  input.addEventListener('focus', function () { setFocus(0); });

  try {
    window.tizen.tvinputdevice.registerKey('ColorF0Red');
  } catch (e) { /* non è una TV */ }

  var saved = load();
  input.value = saved;
  if (saved) countdown(saved);
  else showForm();
})();
