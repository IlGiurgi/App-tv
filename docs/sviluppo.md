# Sviluppo

Non serve alcun build: è HTML/CSS/JavaScript puro, scritto in ES2015 compatibile con Chromium 47 (Tizen 3.0).

```bash
npm install          # solo per lint e test (eslint, playwright)
npm run dev          # server di sviluppo con un finto server Xtream
```

Apri <http://localhost:8080> e accedi con server `http://localhost:8080`, utente `demo`, password `demo`.
Nel browser si naviga con la tastiera: frecce, Invio = OK, Esc/Backspace = INDIETRO, F1 = ROSSO, F3 = GIALLO, F4 = BLU, PagSu/PagGiù = CH+/CH−.
I flussi video finti non sono riproducibili nel browser: la riproduzione vera va provata sulla TV.

```bash
npm run lint         # controlla anche l'uso di sintassi non supportata dalle TV più vecchie
npm test             # test unitari (client Xtream, storage)
npm run test:e2e     # test end-to-end in Chromium: telecomando, AVPlay simulato, mouse, player web, app Android simulata
node dev/icon/render.js  # rigenera icone (TV e Android) e splash da dev/icon/hometivu.svg
```

### Struttura

```
app/                      progetto Tizen (è la cartella da importare/pacchettizzare)
  config.xml              manifest Tizen (id app, permessi, profilo tv-samsung)
  index.html
  css/style.css           layout 1920x1080
  js/xtream.js            client API Xtream Codes (player_api.php)
  js/storage.js           account, preferiti, posizioni di ripresa (localStorage)
  js/keys.js              tasti del telecomando
  js/nav.js               navigazione spaziale con le frecce
  js/player.js            AVPlay sulla TV, <video> nel browser
  js/app.js               pila delle schermate, sessione, cache
  js/platform.js          TV / app Android / browser
  js/pointer.js           supporto mouse e touch
  js/screens/*.js         login, home, dettaglio, player
android/                  progetto Android (Capacitor) con il lettore nativo ExoPlayer
dev/mock-server.js        finto server Xtream + server statico per lo sviluppo
tests/                    test unitari ed end-to-end
```

