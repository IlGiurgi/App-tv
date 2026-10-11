/*
 * Schermata di accesso: server, utente e password Xtream.
 */
(function (root) {
  'use strict';

  var h = UI.h;
  var el = root.document.getElementById('screen-login');
  var fields = {};
  var errorEl;

  function input(name, label, type, placeholder) {
    var field = h('input.focusable.field', {
      type: type, id: 'login-' + name, placeholder: placeholder, 'data-zone': 'login',
      autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false'
    });
    // OK sul campo apre la tastiera a schermo della TV.
    field.onSelect = function () { field.focus(); };
    fields[name] = field;
    return h('label.form-row', {}, [h('span.form-label', { text: label }), field]);
  }

  function submit() {
    var account = {
      server: fields.server.value.trim(),
      username: fields.username.value.trim(),
      password: fields.password.value
    };
    if (!account.server || !account.username || !account.password) {
      showError('Compila tutti i campi');
      return;
    }
    showError('');
    UI.withLoader(App.login(account)).then(function () {
      App.reset('browse', {});
    }, function (err) {
      showError(err.message + webHint(err, account.server));
    });
  }

  /** Nel browser (non sulla TV) gli errori di rete hanno spesso cause specifiche del web. */
  function webHint(err, server) {
    if (Player.isNative() || !err.network) return '';
    var page = root.location.protocol;
    if (page === 'https:' && /^http:/i.test(Xtream.normalizeServer(server))) {
      return '\nQuesta pagina è https: il browser blocca i server http. Usa l\'indirizzo https del server o l\'app sulla TV.';
    }
    return '\nSe dalla TV funziona, il server blocca le richieste dal browser (CORS): usa l\'app sulla TV.';
  }

  function showError(message) {
    errorEl.textContent = message;
  }

  var button = h('button.focusable.button.primary', { id: 'login-submit', 'data-zone': 'login', text: 'Accedi' });
  button.onSelect = submit;
  errorEl = h('p.form-error', { id: 'login-error' });

  UI.append(el, h('div.login-box', {}, [
    h('h1.login-title', { text: 'Xtream TV' }),
    h('p.login-subtitle', { text: 'Inserisci i dati del tuo abbonamento IPTV (Xtream Codes)' }),
    input('server', 'Server', 'url', 'http://esempio.com:8080'),
    input('username', 'Utente', 'text', 'username'),
    input('password', 'Password', 'password', 'password'),
    errorEl,
    button,
    h('p.hint', { text: 'Usa le frecce per spostarti e OK per scrivere nel campo selezionato.' })
  ]));

  App.register('login', {
    el: el,
    enter: function (params) {
      var account = params.account || {};
      fields.server.value = account.server || '';
      fields.username.value = account.username || '';
      fields.password.value = account.password || '';
      showError(params.error || '');
      Nav.focus(account.server ? button : fields.server);
    }
  });
})(this);
