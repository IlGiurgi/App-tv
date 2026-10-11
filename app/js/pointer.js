/*
 * Supporto mouse (browser sul PC, o telecomandi Samsung con puntatore).
 *
 * Clic su un elemento = focus + OK; elementi con data-action eseguono quell'azione (es. "back").
 * Nel player: clic = OK (info / pausa), doppio clic = schermo intero, muovere il mouse mostra le info.
 * Al primo movimento del mouse <html> riceve la classe "pointer": compaiono i pulsanti Indietro
 * e le liste diventano scorrevoli con la rotellina.
 * Pressione prolungata (o clic destro) su un canale, film o serie = tasto ROSSO: aggiungi/rimuovi preferito.
 */
(function (root) {
  'use strict';

  var DOUBLE_CLICK_MS = 250;
  var LONG_PRESS_MS = 550;
  var LONG_PRESS_TOLERANCE = 10; // px di movimento oltre i quali è uno scorrimento, non una pressione
  var doc = root.document;
  var html = doc.documentElement;
  var playerClickTimer = null;
  var press = null; // pressione prolungata in corso: {el, x, y, timer}
  // Vero dopo una pressione prolungata, fino al prossimo tocco o clic del mouse: il "clic" generato
  // dal rilascio del dito va ignorato e il menu contestuale di Android non deve ripetere l'azione.
  var longPressDone = false;
  var lastTouchAt = 0;
  var EMULATED_MOUSE_MS = 1000; // dopo un tocco il browser genera anche eventi mouse "finti"

  function enable() {
    html.classList.add('pointer');
  }

  function isPlayerActive() {
    return App.current() === App.screens.player;
  }

  /** Elemento della lista (canale, film, serie) sotto il dito o il mouse, se c'è. */
  function itemElement(target) {
    var el = target && target.closest ? target.closest('.focusable') : null;
    return el && el.item && Nav.root && Nav.root.contains(el) ? el : null;
  }

  function longPress(el) {
    if (press) clearTimeout(press.timer);
    press = null;
    longPressDone = true;
    Nav.focus(el);
    App.handleAction('red');
    if (root.navigator.vibrate) root.navigator.vibrate(30);
  }

  function cancelPress() {
    if (press) clearTimeout(press.timer);
    press = null;
  }

  // Sui touchscreen: liste scorrevoli col dito e pulsanti Indietro visibili.
  doc.addEventListener('touchstart', function (event) {
    enable();
    cancelPress();
    longPressDone = false;
    var el = itemElement(event.target);
    if (!el || event.touches.length !== 1) return;
    var touch = event.touches[0];
    press = { el: el, x: touch.clientX, y: touch.clientY, timer: setTimeout(function () { longPress(el); }, LONG_PRESS_MS) };
  }, { passive: true });

  doc.addEventListener('touchmove', function (event) {
    if (!press) return;
    var touch = event.touches[0];
    if (Math.abs(touch.clientX - press.x) > LONG_PRESS_TOLERANCE || Math.abs(touch.clientY - press.y) > LONG_PRESS_TOLERANCE) {
      cancelPress();
    }
  }, { passive: true });

  doc.addEventListener('touchend', function () {
    lastTouchAt = Date.now();
    cancelPress();
  }, { passive: true });
  doc.addEventListener('touchcancel', cancelPress, { passive: true });

  // Un vero clic del mouse annulla lo stato; i mousedown emulati subito dopo un tocco no.
  doc.addEventListener('mousedown', function () {
    if (Date.now() - lastTouchAt > EMULATED_MOUSE_MS) longPressDone = false;
  });

  // Android apre il menu contestuale con la pressione prolungata; col mouse è il clic destro.
  doc.addEventListener('contextmenu', function (event) {
    var el = itemElement(event.target);
    if (!el && !press) return;
    event.preventDefault();
    if (press) longPress(press.el); // il menu contestuale è arrivato prima del nostro timer
    else if (!longPressDone) longPress(el);
  });

  doc.addEventListener('mousemove', function () {
    enable();
    var screen = App.current();
    if (screen && screen.onPointerMove) screen.onPointerMove();
  });

  doc.addEventListener('click', function (event) {
    enable();
    if (longPressDone) {
      event.preventDefault();
      return;
    }
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
