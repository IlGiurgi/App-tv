'use strict';

/*
 * Il codice in app/ gira su Tizen 3.0+ (Chromium 47): niente destructuring, parametri di default,
 * async/await, Promise.finally, Object.values/entries, padStart, NodeList.forEach.
 */
var tvGlobals = {
  window: 'readonly', document: 'readonly', localStorage: 'readonly', XMLHttpRequest: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  atob: 'readonly', Buffer: 'readonly', module: 'readonly', Promise: 'readonly',
  App: 'readonly', Xtream: 'readonly', Storage: 'readonly', Keys: 'readonly', Nav: 'readonly',
  UI: 'readonly', Player: 'readonly', Platform: 'readonly', MiniPlayer: 'readonly',
  Home: 'readonly', HomePopup: 'readonly', WebSocket: 'readonly'
};

var nodeGlobals = {
  require: 'readonly', module: 'writable', process: 'readonly', console: 'readonly', Buffer: 'readonly',
  __dirname: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', URL: 'readonly'
};

module.exports = [
  {
    files: ['app/**/*.js', 'sitotv/**/*.js'],
    languageOptions: { ecmaVersion: 2015, sourceType: 'script', globals: tvGlobals },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-restricted-syntax': ['error',
        { selector: 'ObjectPattern', message: 'Destructuring non supportato da Tizen 3.0' },
        { selector: 'ArrayPattern', message: 'Destructuring non supportato da Tizen 3.0' },
        { selector: 'AssignmentPattern', message: 'Parametri di default non supportati da Tizen 3.0' },
        { selector: 'SpreadElement', message: 'Evita lo spread per compatibilità' }
      ],
      'no-restricted-properties': ['error',
        { property: 'finally', message: 'Promise.finally non supportato da Tizen 3.0' },
        { property: 'padStart', message: 'Non supportato da Tizen 3.0' },
        { property: 'padEnd', message: 'Non supportato da Tizen 3.0' },
        { object: 'Object', property: 'values', message: 'Non supportato da Tizen 3.0' },
        { object: 'Object', property: 'entries', message: 'Non supportato da Tizen 3.0' }
      ]
    }
  },
  {
    files: ['dev/**/*.js', 'tests/**/*.js', 'tools/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: nodeGlobals },
    rules: { 'no-undef': 'error', 'no-unused-vars': 'error' }
  },
  {
    // Le funzioni passate a page.evaluate() girano nel browser, dentro l'app.
    files: ['tests/e2e/**/*.js'],
    languageOptions: {
      globals: { window: 'readonly', document: 'readonly', localStorage: 'readonly', getComputedStyle: 'readonly', Nav: 'readonly', App: 'readonly', Storage: 'readonly', Home: 'readonly', MiniPlayer: 'readonly', fetch: 'readonly' }
    }
  }
];
