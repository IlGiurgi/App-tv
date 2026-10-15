/*
 * Navigazione spaziale con le frecce del telecomando.
 *
 * Gli elementi navigabili hanno la classe "focusable" e (opzionale) data-zone.
 * Il focus è "virtuale" (classe "focused"): non si usa il focus DOM, così sulla TV
 * la tastiera a schermo si apre solo quando l'utente preme OK su un campo di testo.
 * Quando ci si sposta verso un'altra zona si torna all'ultimo elemento focalizzato in quella zona.
 */
(function (root) {
  'use strict';

  var EDGE_TOLERANCE = 2;
  var SCROLL_MARGIN = 24;

  var Nav = {
    root: null,
    current: null,
    memory: {},
    scale: 1,
    stickyDown: {}, // zone da cui ▼ non esce: {nomeZona: true}

    setRoot: function (el) {
      this.root = el;
    },

    focusables: function () {
      if (!this.root) return [];
      return Array.prototype.filter.call(this.root.querySelectorAll('.focusable'), function (el) {
        return el.offsetParent !== null && !el.classList.contains('disabled');
      });
    },

    focus: function (el) {
      if (!el) return;
      var previous = this.current;
      if (previous && previous !== el) {
        previous.classList.remove('focused');
        if (typeof previous.onFocusOut === 'function') previous.onFocusOut();
      }
      this.current = el;
      el.classList.add('focused');
      var zone = el.getAttribute('data-zone');
      if (zone) this.memory[zone] = el;
      scrollIntoView(el, this.scale);
      if (previous !== el && typeof el.onFocusIn === 'function') el.onFocusIn();
    },

    /** Focalizza l'ultimo elemento usato nella zona, altrimenti il primo disponibile. */
    focusZone: function (zone) {
      var remembered = this.memory[zone];
      if (remembered && this.isFocusable(remembered)) {
        this.focus(remembered);
        return true;
      }
      var first = this.focusables().filter(function (el) { return el.getAttribute('data-zone') === zone; })[0];
      if (first) this.focus(first);
      return !!first;
    },

    focusFirst: function () {
      this.focus(this.focusables()[0]);
    },

    isFocusable: function (el) {
      return !!el && el.isConnected !== false && this.root && this.root.contains(el) &&
        el.offsetParent !== null && el.classList.contains('focusable');
    },

    forgetZone: function (zone) {
      delete this.memory[zone];
    },

    /** Riprende il focus se l'elemento corrente è stato rimosso o nascosto. */
    ensureFocus: function () {
      if (!this.isFocusable(this.current)) this.focusFirst();
    },

    move: function (direction) {
      var current = this.current;
      if (!this.isFocusable(current)) {
        this.focusFirst();
        return true;
      }
      var target = findNeighbor(current, this.focusables(), direction);
      if (!target) return false;
      var zone = target.getAttribute('data-zone');
      // In fondo a una lista "bloccata" la freccia giù non salta in un'altra zona (es. le categorie).
      var currentZone = current.getAttribute('data-zone');
      if (direction === 'down' && currentZone && this.stickyDown[currentZone] && zone !== currentZone) return true;
      var remembered = zone && this.memory[zone];
      if (zone && zone !== current.getAttribute('data-zone') &&
          remembered && this.isFocusable(remembered) && isInDirection(rectOf(current), rectOf(remembered), direction)) {
        target = remembered;
      }
      this.focus(target);
      return true;
    }
  };

  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }

  function isInDirection(from, to, direction) {
    switch (direction) {
      case 'left': return to.right <= from.left + EDGE_TOLERANCE;
      case 'right': return to.left >= from.right - EDGE_TOLERANCE;
      case 'up': return to.bottom <= from.top + EDGE_TOLERANCE;
      case 'down': return to.top >= from.bottom - EDGE_TOLERANCE;
    }
    return false;
  }

  /** Distanza tra due intervalli su un asse (0 se si sovrappongono). */
  function gap(aStart, aEnd, bStart, bEnd) {
    if (bEnd < aStart) return aStart - bEnd;
    if (bStart > aEnd) return bStart - aEnd;
    return 0;
  }

  function findNeighbor(current, candidates, direction) {
    var from = rectOf(current);
    var horizontal = direction === 'left' || direction === 'right';
    var best = null;
    var bestScore = Infinity;
    candidates.forEach(function (el) {
      if (el === current) return;
      var to = rectOf(el);
      if (!isInDirection(from, to, direction)) return;
      var primary = horizontal
        ? gap(from.left, from.right, to.left, to.right)
        : gap(from.top, from.bottom, to.top, to.bottom);
      var secondary = horizontal
        ? gap(from.top, from.bottom, to.top, to.bottom)
        : gap(from.left, from.right, to.left, to.right);
      // Penalizza il disallineamento più della distanza: si resta su righe/colonne coerenti.
      var score = primary + secondary * 3;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    });
    return best;
  }

  /** Scorre il contenitore ".scroll" più vicino quanto basta per rendere visibile l'elemento. */
  function scrollIntoView(el, scale) {
    var container = el.parentNode;
    while (container && container.classList && !container.classList.contains('scroll')) {
      container = container.parentNode;
    }
    if (!container || !container.classList) return;
    var c = container.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    var margin = SCROLL_MARGIN * scale;
    if (r.top < c.top + margin) container.scrollTop -= (c.top + margin - r.top) / scale;
    else if (r.bottom > c.bottom - margin) container.scrollTop += (r.bottom - (c.bottom - margin)) / scale;
    if (r.left < c.left + margin) container.scrollLeft -= (c.left + margin - r.left) / scale;
    else if (r.right > c.right - margin) container.scrollLeft += (r.right - (c.right - margin)) / scale;
  }

  root.Nav = Nav;
})(this);
