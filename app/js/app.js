/*
 * Nucleo dell'app: pila delle schermate, gestione dei tasti, sessione Xtream e cache dei contenuti.
 *
 * Ogni schermata registrata è un oggetto con:
 *   el                 elemento <section> della schermata
 *   enter(params)      chiamata quando la schermata viene aperta
 *   resume()           (opz.) quando si torna alla schermata da una successiva
 *   leave()            (opz.) quando la schermata viene chiusa
 *   handleKey(action, key) (opz.) restituisce true se ha gestito il tasto
 */
(function (root) {
  'use strict';

  var EXIT_CONFIRM_MS = 2000;
  var DESIGN_WIDTH = 1920;
  var DESIGN_HEIGHT = 1080;

  var lastBackAt = 0;

  /** Converte i dati grezzi Xtream in oggetti uniformi usati da liste, preferiti e player. */
  var normalizers = {
    live: function (s) {
      return {
        type: 'live', id: String(s.stream_id), name: s.name || '', icon: s.stream_icon || '',
        num: s.num, categoryId: String(s.category_id)
      };
    },
    vod: function (s) {
      return {
        type: 'vod', id: String(s.stream_id), name: s.name || '', icon: s.stream_icon || '',
        ext: s.container_extension || 'mp4', rating: s.rating, categoryId: String(s.category_id)
      };
    },
    series: function (s) {
      return {
        type: 'series', id: String(s.series_id), name: s.name || '', icon: s.cover || '',
        rating: s.rating, categoryId: String(s.category_id)
      };
    }
  };

  var App = {
    client: null,
    session: null, // {user_info, server_info}
    settings: Storage.getSettings(),
    screens: {},
    stack: [],
    cache: {},

    register: function (name, screen) {
      this.screens[name] = screen;
    },

    current: function () {
      return this.stack[this.stack.length - 1] || null;
    },

    /** Apre una schermata sopra quella corrente. */
    show: function (name, params) {
      var previous = this.current();
      if (previous) previous.lastFocus = Nav.current;
      this.activate(this.screens[name]);
      this.stack.push(this.screens[name]);
      this.screens[name].enter(params || {});
    },

    /** Sostituisce l'intera pila con una schermata (es. login -> home). */
    reset: function (name, params) {
      while (this.stack.length) {
        var screen = this.stack.pop();
        if (screen.leave) screen.leave();
      }
      this.show(name, params);
    },

    back: function () {
      if (this.stack.length > 1) {
        var closing = this.stack.pop();
        if (closing.leave) closing.leave();
        var previous = this.current();
        this.activate(previous);
        if (previous.resume) previous.resume();
        if (previous.lastFocus && Nav.isFocusable(previous.lastFocus)) Nav.focus(previous.lastFocus);
        else Nav.ensureFocus();
        return;
      }
      var now = Date.now();
      if (now - lastBackAt < EXIT_CONFIRM_MS) {
        this.exit();
      } else {
        lastBackAt = now;
        UI.toast('Premi di nuovo INDIETRO per uscire');
      }
    },

    activate: function (screen) {
      Object.keys(this.screens).forEach(function (key) {
        var s = this.screens[key];
        s.el.classList.toggle('active', s === screen);
      }, this);
      Nav.setRoot(screen.el);
    },

    exit: function () {
      Player.stop();
      try {
        root.tizen.application.getCurrentApplication().exit();
      } catch (e) {
        UI.toast('Uscita disponibile solo sulla TV');
      }
    },

    /** Login: verifica le credenziali e salva l'account. */
    login: function (account) {
      var client = new Xtream.Client(account);
      return client.authenticate().then(function (session) {
        App.client = client;
        App.session = session;
        App.cache = {};
        Storage.setAccount({ server: client.server, username: account.username, password: account.password });
        return session;
      });
    },

    logout: function () {
      Player.stop();
      Storage.clearAccount();
      this.client = null;
      this.session = null;
      this.cache = {};
      this.reset('login', {});
    },

    /** Categorie e contenuti di un tipo ('live' | 'vod' | 'series'), scaricati una volta per sessione. */
    loadSection: function (type) {
      var cache = this.cache;
      if (!cache[type]) {
        cache[type] = Promise.all([
          this.client.getCategories(type),
          this.client.getStreams(type)
        ]).then(function (results) {
          return {
            categories: results[0].map(function (c) {
              return { id: String(c.category_id), name: c.category_name || '' };
            }),
            items: results[1].map(normalizers[type])
          };
        });
        cache[type].catch(function () { delete cache[type]; });
      }
      return cache[type];
    },

    clearCache: function () {
      this.cache = {};
    },

    streamUrl: function (item) {
      if (item.type === 'live') return this.client.liveUrl(item.id, this.settings.liveFormat);
      if (item.type === 'vod') return this.client.vodUrl(item.id, item.ext);
      return this.client.episodeUrl(item.id, item.ext);
    },

    saveSettings: function () {
      Storage.setSettings(this.settings);
    }
  };

  function onKeyDown(event) {
    var key = Keys.parse(event);
    var active = root.document.activeElement;

    // Mentre si scrive in un campo di testo i tasti vanno al campo, tranne quelli per uscirne.
    if (active && active.tagName === 'INPUT') {
      var leave = key.action === 'enter' || key.action === 'done' || key.action === 'cancel' ||
        key.action === 'up' || key.action === 'down' ||
        (key.action === 'back' && event.keyCode !== 8);
      if (!leave) return;
      active.blur();
      event.preventDefault();
      if (key.action !== 'up' && key.action !== 'down') return;
    }

    if (!key.action) return;
    event.preventDefault();
    App.handleAction(key.action, key);
  }

  /** Esegue un'azione del telecomando (anche da mouse): prima la schermata, poi il comportamento standard. */
  App.handleAction = function (action, key) {
    var screen = App.current();
    if (!screen) return;
    if (screen.handleKey && screen.handleKey(action, key || { action: action, digit: null })) return;

    switch (action) {
      case 'left':
      case 'right':
      case 'up':
      case 'down':
        Nav.move(key.action);
        break;
      case 'enter':
        if (Nav.current && typeof Nav.current.onSelect === 'function') Nav.current.onSelect();
        break;
      case 'back':
        App.back();
        break;
    }
  };

  /** Adatta il layout 1920x1080 alla finestra, centrandolo (sulla TV la scala è 1). */
  function fitToWindow() {
    var scale = Math.min(root.innerWidth / DESIGN_WIDTH, root.innerHeight / DESIGN_HEIGHT);
    var x = Math.max(0, (root.innerWidth - DESIGN_WIDTH * scale) / 2);
    var y = Math.max(0, (root.innerHeight - DESIGN_HEIGHT * scale) / 2);
    root.document.getElementById('app').style.transform =
      'translate(' + x + 'px, ' + y + 'px) scale(' + scale + ')';
    Nav.scale = scale;
  }

  function start() {
    Keys.register();
    fitToWindow();
    root.addEventListener('resize', fitToWindow);
    root.document.addEventListener('keydown', onKeyDown);
    root.document.addEventListener('visibilitychange', function () {
      if (root.document.hidden) Player.suspend();
      else Player.restore();
    });

    var account = Storage.getAccount();
    if (!account) {
      App.show('login', {});
      return;
    }
    UI.withLoader(App.login(account)).then(function () {
      App.reset('browse', {});
    }, function (err) {
      App.show('login', { account: account, error: err.message });
    });
  }

  root.App = App;
  root.addEventListener('load', start);
})(this);
