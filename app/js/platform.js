/*
 * Dove sta girando l'app: TV Samsung (AVPlay), app Android (Capacitor) o semplice browser.
 */
(function (root) {
  'use strict';

  var capacitor = root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform()
    ? root.Capacitor : null;

  function plugin(name) {
    if (!capacitor) return null;
    return capacitor.registerPlugin ? capacitor.registerPlugin(name) : (capacitor.Plugins || {})[name] || null;
  }

  root.Platform = {
    /** TV Samsung: riproduzione con AVPlay. */
    isTV: !!(root.webapis && root.webapis.avplay),
    /** App Android: richieste di rete native (niente CORS) e lettore video ExoPlayer. */
    isAndroidApp: !!capacitor,
    plugin: plugin
  };
})(this);
