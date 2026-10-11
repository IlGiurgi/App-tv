/*
 * Mappatura dei tasti del telecomando Samsung (e della tastiera, per lo sviluppo nel browser).
 */
(function (root) {
  'use strict';

  var CODES = {
    37: 'left', 38: 'up', 39: 'right', 40: 'down',
    13: 'enter',
    10009: 'back', 27: 'back', 8: 'back',
    427: 'chup', 428: 'chdown', 33: 'chup', 34: 'chdown',
    10252: 'playpause', 415: 'play', 19: 'pause', 413: 'stop',
    417: 'ff', 412: 'rw',
    403: 'red', 404: 'green', 405: 'yellow', 406: 'blue',
    112: 'red', 113: 'green', 114: 'yellow', 115: 'blue',
    65376: 'done', 65385: 'cancel'
  };

  // Tasti che su Tizen vanno registrati esplicitamente per riceverne gli eventi.
  var TIZEN_KEYS = [
    'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
    'ChannelUp', 'ChannelDown', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
  ];

  function register() {
    var input = root.tizen && root.tizen.tvinputdevice;
    if (!input) return;
    TIZEN_KEYS.forEach(function (name) {
      try { input.registerKey(name); } catch (e) { /* tasto non supportato su questo modello */ }
    });
  }

  /** Restituisce {action, digit} per un KeyboardEvent; action è null per i tasti non gestiti. */
  function parse(event) {
    var code = event.keyCode;
    if (code >= 48 && code <= 57) return { action: 'digit', digit: code - 48 };
    if (code >= 96 && code <= 105) return { action: 'digit', digit: code - 96 };
    return { action: CODES[code] || null, digit: null };
  }

  root.Keys = { register: register, parse: parse };
})(this);
