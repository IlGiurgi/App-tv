/*
 * Helper per costruire il DOM in modo sicuro (solo textContent, mai innerHTML con dati del server).
 */
(function (root) {
  'use strict';

  var doc = root.document;
  var toastTimer = null;
  var loaderCount = 0;

  /**
   * h('div.cls1.cls2', {attr: value, onFocusIn: fn}, [children | 'testo'])
   * Le proprietà che iniziano con "on" vengono assegnate all'elemento (handler), le altre come attributi.
   */
  function h(spec, props, children) {
    var parts = spec.split('.');
    var el = doc.createElement(parts[0] || 'div');
    if (parts.length > 1) el.className = parts.slice(1).join(' ');
    Object.keys(props || {}).forEach(function (key) {
      var value = props[key];
      if (value === undefined || value === null || value === false) return;
      if (key.indexOf('on') === 0) el[key] = value;
      else if (key === 'text') el.textContent = value;
      else el.setAttribute(key, value === true ? '' : value);
    });
    append(el, children);
    return el;
  }

  function append(el, children) {
    if (children === undefined || children === null) return;
    if (!Array.isArray(children)) children = [children];
    children.forEach(function (child) {
      if (child === undefined || child === null || child === false) return;
      el.appendChild(typeof child === 'string' || typeof child === 'number'
        ? doc.createTextNode(String(child)) : child);
    });
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  /** Immagine che si nasconde se l'URL è vuoto o non si carica. */
  function img(src, className) {
    var el = h('img.' + (className || 'thumb'), { alt: '' });
    if (!src) {
      el.style.visibility = 'hidden';
      return el;
    }
    el.onerror = function () { el.style.visibility = 'hidden'; };
    el.src = src;
    return el;
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /** Secondi -> "1:02:03" oppure "2:03". */
  function formatDuration(seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    var hrs = Math.floor(seconds / 3600);
    var min = Math.floor((seconds % 3600) / 60);
    var sec = seconds % 60;
    return (hrs ? hrs + ':' + pad2(min) : min) + ':' + pad2(sec);
  }

  function formatClock(ms) {
    var d = new Date(ms);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function formatDate(unixSeconds) {
    if (!unixSeconds || unixSeconds === 'null') return 'Illimitata';
    var d = new Date(Number(unixSeconds) * 1000);
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function toast(message, duration) {
    var el = doc.getElementById('toast');
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('visible'); }, duration || 2500);
  }

  /** Mostra lo spinner finché la promise non si conclude. */
  function withLoader(promise) {
    var el = doc.getElementById('loader');
    loaderCount++;
    el.classList.add('visible');
    function done() {
      loaderCount = Math.max(0, loaderCount - 1);
      if (!loaderCount) el.classList.remove('visible');
    }
    return promise.then(function (value) { done(); return value; }, function (err) { done(); throw err; });
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  root.UI = {
    h: h,
    append: append,
    clear: clear,
    img: img,
    formatDuration: formatDuration,
    formatClock: formatClock,
    formatDate: formatDate,
    toast: toast,
    withLoader: withLoader,
    debounce: debounce
  };
})(this);
