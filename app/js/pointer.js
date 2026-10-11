/*
 * Supporto mouse (browser sul PC, o telecomandi Samsung con puntatore).
 *
 * Clic su un elemento = focus + OK; elementi con data-action eseguono quell'azione (es. "back").
 * Nel player: clic = OK (info / pausa), doppio clic = schermo intero, muovere il mouse mostra le info.
 * Al primo movimento del mouse <html> riceve la classe "pointer": compaiono i pulsanti Indietro
 * e le liste diventano scorrevoli con la rotellina.
 */
(function (root) {
  'use strict';

  var DOUBLE_CLICK_MS = 250;
  var doc = root.document;
  var html = doc.documentElement;
  var playerClickTimer = null;

  function enable() {
    html.classList.add('pointer');
  }

  function isPlayerActive() {
    return App.current() === App.screens.player;
  }

  // Sui touchscreen: liste scorrevoli col dito e pulsanti Indietro visibili.
  doc.addEventListener('touchstart', enable, { passive: true });

  doc.addEventListener('mousemove', function () {
    enable();
    var screen = App.current();
    if (screen && screen.onPointerMove) screen.onPointerMove();
  });

  doc.addEventListener('click', function (event) {
    enable();
    var target = event.target;
    var actionEl = target.closest('[data-action]');
    if (actionEl) {
      App.handleAction(actionEl.getAttribute('data-action'));
      return;
    }
    var el = target.closest('.focusable');
    if (el && Nav.root && Nav.root.contains(el)) {
      Nav.focus(el);
      if (el.tagName === 'INPUT') el.focus();
      else if (typeof el.onSelect === 'function') el.onSelect();
      return;
    }
    if (isPlayerActive()) {
      // Aspetta un attimo: se arriva un doppio clic è "schermo intero", non "pausa".
      clearTimeout(playerClickTimer);
      playerClickTimer = setTimeout(function () { App.handleAction('enter'); }, DOUBLE_CLICK_MS);
    }
  });

  doc.addEventListener('dblclick', function () {
    if (!isPlayerActive()) return;
    clearTimeout(playerClickTimer);
    if (doc.fullscreenElement) doc.exitFullscreen();
    else if (html.requestFullscreen) html.requestFullscreen();
  });
})(this);
