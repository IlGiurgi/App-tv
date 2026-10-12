/*
 * Schermata di accesso: server, utente e password Xtream.
 */
(function (root) {
  'use strict';

  var h = UI.h;
  var el = root.document.getElementById('screen-login');
  var fields = {};
  var errorEl;
  var trustToggle = null;
  var trustInvalidCertificate = false;

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

  /** Link completo incollato nel campo Server: compila da solo utente e password. */
  function fillFromAccountUrl() {
    var parsed = Xtream.parseAccountUrl(fields.server.value);
    if (!parsed) return false;
    fields.server.value = parsed.server;
    fields.username.value = parsed.username;
    fields.password.value = parsed.password;
    return true;
  }

  function submit() {
    fillFromAccountUrl();
    var account = {
      server: fields.server.value.trim(),
      username: fields.username.value.trim(),
      password: fields.password.value,
      insecureTls: trustInvalidCertificate || undefined
    };
    if (!account.server || !account.username || !account.password) {
      showError('Compila tutti i campi');
      return;
    }
    showError('');
    var host = trustInvalidCertificate ? Xtream.hostOf(account.server) : null;
    UI.withLoader(setTrustedHost(host).then(function () {
      return App.login(account);
    })).then(function () {
      App.reset('browse', {});
    }, function (err) {
      // Login fallito: nessuna eccezione al certificato deve restare attiva.
      if (host) setTrustedHost(null);
      showError(err.message + networkHint(err, account.server));
    });
  }

  /** App Android: autorizza (o con null rimuove) il certificato non valido di un solo server. */
  function setTrustedHost(host) {
    if (!Platform.isAndroidApp) return Promise.resolve();
    return Platform.plugin('ServerTrust').setAllowedHost({ host: host });
  }

  function setTrust(value) {
    trustInvalidCertificate = !!value;
    if (trustToggle) {
      trustToggle.textContent = (value ? '☑' : '☐') + '  Accetta il certificato non valido di questo server';
      trustToggle.classList.toggle('checked', !!value);
    }
  }

  /** Suggerimento per gli errori di rete; nel browser le cause tipiche sono diverse da TV e telefono. */
  function networkHint(err, server) {
    if (!err.network) return '';
    if (Platform.isTV || Platform.isAndroidApp) {
      var certificate = Platform.isAndroidApp && !trustInvalidCertificate && /^https:/i.test(Xtream.normalizeServer(server))
        ? '\nSe il browser segnala "connessione non sicura" per questo server, spunta "Accetta il certificato non valido".'
        : '';
      return '\n' + (err.triedBoth ? 'Provato sia con https:// che con http://. ' : '') +
        'Controlla indirizzo e porta, e che il dispositivo sia connesso a internet.' + certificate;
    }
    var page = root.location.protocol;
    if (page === 'https:' && /^http:/i.test(Xtream.normalizeServer(server))) {
      return '\nQuesta pagina è https: il browser blocca i server http. Usa l\'indirizzo https del server o l\'app sulla TV.';
    }
    return '\nDal browser il server non risponde: può bloccare le richieste dai siti web (CORS) o funzionare ' +
      'solo in http, che una pagina https non può usare. Usa l\'app sulla TV o sul telefono Android.';
  }

  function showError(message) {
    errorEl.textContent = message;
  }

  var button = h('button.focusable.button.primary', { id: 'login-submit', 'data-zone': 'login', text: 'Accedi' });
  button.onSelect = submit;
  errorEl = h('p.form-error', { id: 'login-error' });

  if (Platform.isAndroidApp) {
    trustToggle = h('div.focusable.toggle', { id: 'login-trust', 'data-zone': 'login' });
    trustToggle.onSelect = function () { setTrust(!trustInvalidCertificate); };
    setTrust(false);
  }

  UI.append(el, h('div.login-box', {}, [
    h('h1.login-title', { text: 'Telesfera' }),
    h('p.login-subtitle', {
      text: 'Inserisci i dati del tuo abbonamento IPTV (Xtream Codes), oppure incolla nel campo Server ' +
        'il link completo della lista: utente e password vengono compilati da soli.'
    }),
    input('server', 'Server', 'url', 'http://esempio.com:8080'),
    input('username', 'Utente', 'text', 'username'),
    input('password', 'Password', 'password', 'password'),
    trustToggle,
    trustToggle ? h('p.toggle-hint', {
      text: 'Solo se il server ha un certificato non valido. L\'eccezione vale solo per questo server, ma su reti ' +
        'non fidate (es. Wi-Fi pubblici) i dati dell\'abbonamento sono meno protetti.'
    }) : null,
    errorEl,
    button,
    h('p.hint', { text: 'Usa le frecce per spostarti e OK per scrivere nel campo selezionato.' })
  ]));

  // Il campo esiste solo dopo la costruzione del form qui sopra.
  fields.server.addEventListener('input', function () {
    if (fillFromAccountUrl()) showError('');
  });

  App.register('login', {
    el: el,
    enter: function (params) {
      var account = params.account || {};
      fields.server.value = account.server || '';
      fields.username.value = account.username || '';
      fields.password.value = account.password || '';
      setTrust(account.insecureTls);
      showError(params.error || '');
      Nav.focus(account.server ? button : fields.server);
    }
  });
})(this);
