# Xtream TV — app IPTV per TV Samsung (Tizen)

Web app per TV Samsung Smart (Tizen 3.0 e successivi, cioè modelli **dal 2017 in poi**) che riproduce
un abbonamento IPTV **Xtream Codes** (server + utente + password).

## Funzionalità

- **Live TV**: categorie, lista canali con logo, EPG "ora / dopo" con barra di avanzamento,
  zapping con ▲/▼ o CH+/CH−, salto diretto a un canale digitando il numero
- **Film**: griglia locandine, scheda con trama/genere/voto, **ripresa dal punto in cui eri rimasto**
- **Serie TV**: stagioni ed episodi, ripresa per episodio, **passaggio automatico all'episodio successivo**
- **Preferiti** (tasto ROSSO) per canali, film e serie
- **Ricerca** su canali, film e serie
- **Impostazioni**: info account (scadenza, connessioni), formato dei canali live (MPEG-TS / HLS), ricarica liste, logout
- Navigazione completa con il telecomando; le liste molto lunghe (decine di migliaia di elementi) vengono caricate a blocchi
- Riproduzione con il player nativo Samsung **AVPlay** (TS, HLS, MP4, MKV…)
- **App Android** (APK) per il telefono, con lettore video nativo (vedi sotto)
- **Versione web** su GitHub Pages da usare nel browser del PC (vedi sotto)

## Comandi del telecomando

| Tasto | Navigazione | Durante la riproduzione |
|---|---|---|
| Frecce | spostarsi | Live: ▲/▼ cambia canale · Film: ◀ −10s, ▶ +30s |
| OK | apri / seleziona / scrivi nel campo | mostra info · Film: pausa |
| INDIETRO | risale lista → categorie → tab; due volte per uscire | chiude il player |
| CH+ / CH− | — | cambia canale |
| 0–9 | — | vai al canale con quel numero |
| ⏯ ⏩ ⏪ ⏹ | — | pausa, ±60s, stop |
| ROSSO | aggiungi/rimuovi preferito | aggiungi/rimuovi preferito |

## Installazione sulla TV

Le app non provenienti dallo store si installano in **modalità sviluppatore**. Serve un PC
(Windows, macOS o Linux) collegato alla **stessa rete** della TV.

### 1. Installa Tizen Studio

1. Scarica e installa [Tizen Studio](https://developer.tizen.org/development/tizen-studio/download)
   (la versione "with IDE" è la più semplice).
2. Apri il **Package Manager** e installa:
   - scheda *Main SDK*: **Tizen SDK tools**
   - scheda *Extension SDK*: **TV Extensions** (l'ultima versione) e **Samsung Certificate Extension**

### 2. Attiva la modalità sviluppatore sulla TV

1. Sulla TV apri **Apps** (App).
2. Digita **1 2 3 4 5** con il telecomando (o dal tastierino virtuale): compare la finestra *Developer mode*.
3. Metti **On** e inserisci l'**indirizzo IP del PC**.
4. Spegni e riaccendi la TV (tenendo premuto il tasto di accensione finché non si riavvia).
5. Annota l'indirizzo IP della TV (*Impostazioni → Generali → Rete → Stato rete → Impostazioni IP*).

### 3. Collega la TV a Tizen Studio

In Tizen Studio: **Tools → Device Manager → Remote Device Manager → +**, inserisci nome e IP della TV
(porta 26101) e attiva il collegamento. Da riga di comando equivale a:

```bash
sdb connect 192.168.1.50   # IP della TV
sdb devices                # deve comparire la TV
```

### 4. Crea il certificato Samsung

**Tools → Certificate Manager → +** → **Samsung** → **TV** → crea un nuovo profilo.
Accedi con un account Samsung; quando chiede il DUID del dispositivo lascia quello della TV collegata
(viene compilato automaticamente). Il certificato funziona solo per le TV indicate.

### 5. Compila e installa

**Da Tizen Studio**: *File → Import → Tizen → Tizen Project*, seleziona la cartella `app/` di questo
repository, poi tasto destro sul progetto → **Run As → Tizen Web Application**.

**Da riga di comando** (gli strumenti sono in `~/tizen-studio/tools/ide/bin`):

```bash
tizen package -t wgt -s NOME_PROFILO_CERTIFICATO -- app
tizen install -n "Xtream TV.wgt" -t NOME_DISPOSITIVO -- app
tizen run -p XtrmIPTVtv.XtreamTV -t NOME_DISPOSITIVO
```

(`NOME_DISPOSITIVO` è quello mostrato da `sdb devices`.) L'app comparirà tra le app della TV come **Xtream TV**.

### 6. Primo avvio

Inserisci i dati forniti dal tuo provider IPTV:

- **Server**: es. `http://nomeserver.com:8080`. Puoi anche incollare il link completo della lista M3U (`…/get.php?username=…&password=…`): utente e password vengono compilati da soli
- **Utente** e **Password**

L'account viene ricordato: ai successivi avvii si entra direttamente.

## App Android (telefono)

L'app per Android funziona ovunque, anche fuori casa: le richieste al server partono dall'app
(niente blocco CORS) e il video usa il lettore nativo **ExoPlayer** (MPEG-TS, HLS, MP4, MKV).

**Installazione**

1. Dal telefono apri **https://github.com/IlGiurgi/App-tv/releases/tag/android-latest**
   e scarica **XtreamTV.apk**.
2. Aprilo dalle notifiche o da *Download*. Android chiederà di consentire l'installazione
   da questa fonte (browser o file manager): consenti e installa.
3. Avvia **Xtream TV** e accedi con server, utente e password.

Gli aggiornamenti si installano sopra la versione precedente, senza perdere preferiti e accesso.

**Server con certificato non valido**: se "Impossibile contattare il server" e, aprendo
`https://server:porta/player_api.php` nel browser del telefono, compare "la connessione non è sicura",
il provider usa un certificato non valido. Al login spunta **"Accetta il certificato non valido di questo
server"**: l'eccezione vale solo per quel server (gli altri siti restano verificati), viene rimossa al
logout o se il login fallisce, ed è indicata in *Impostazioni*. Su reti non fidate (Wi-Fi pubblici) i dati
dell'abbonamento sono meno protetti. Sulla TV Samsung questa eccezione non è possibile.

**Uso**: tocca per aprire, scorri col dito; nel lettore a schermo intero ci sono i comandi
(pausa, avanti/indietro, canale o episodio precedente/successivo). Il tasto Indietro di Android
risale nell'app; premuto due volte nella schermata principale chiude l'app.

**Come viene creato**: [Capacitor](https://capacitorjs.com) impacchetta la cartella `app/` nel progetto
`android/`; il plugin `NativePlayer` (`android/app/src/main/java/.../PlayerActivity.java`) apre ExoPlayer.
GitHub Actions compila l'APK a ogni push e lo pubblica nella release `android-latest`.
Per compilarlo in locale servono Android Studio (o l'SDK Android) e Java 21:

```bash
npm ci
npx cap sync android
cd android && ./gradlew assembleRelease   # -> app/build/outputs/apk/release/app-release.apk
```

L'APK è firmato con una chiave inclusa nel repository (`android/app/xtreamtv.keystore`), così gli
aggiornamenti si installano sopra la versione precedente. Va bene per un'app personale installata a mano,
non per pubblicarla sul Play Store.

## Versione web (browser sul PC)

La stessa app è pubblicata su GitHub Pages: **https://ilgiurgi.github.io/App-tv/**

- Accedi con gli stessi dati della TV. Le credenziali restano **solo nel tuo browser** (localStorage):
  la pagina pubblica non contiene dati personali.
- Si usa con il mouse (clic, rotellina, pulsante "← Indietro"; doppio clic sul video = schermo intero)
  oppure con la tastiera (frecce, Invio, Esc).
- I canali MPEG-TS sono riprodotti con [mpegts.js](https://github.com/xqq/mpegts.js), quelli HLS con
  [hls.js](https://github.com/video-dev/hls.js): vengono scaricati dal CDN jsDelivr solo nel browser, mai sulla TV.

Limiti del browser, che sulla TV non esistono:

- il server IPTV deve permettere richieste da altri siti (**CORS**). Se compare l'errore
  "il server blocca le richieste dal browser", il provider non lo consente: usa l'app sulla TV;
- una pagina https non può caricare contenuti http: se il server o i flussi video sono `http://`, il browser li blocca;
- alcuni film in MKV o con audio AC3/EAC3 non sono riproducibili da Chrome;
- se un canale non parte prova *Impostazioni → Formato canali live → HLS*;
- PC e TV insieme contano come due connessioni sull'abbonamento.

**Pubblicazione**: il workflow `.github/workflows/ci-pages.yml` esegue lint e test a ogni push e, sul branch
predefinito, pubblica la cartella `app/`. La prima volta va attivato GitHub Pages:
*Settings → Pages → Build and deployment → Source: **GitHub Actions***.

## Problemi comuni

- **Un canale non parte** → *Impostazioni → Formato canali live*: prova HLS (m3u8) invece di MPEG-TS, o viceversa.
- **"Impossibile contattare il server"** → controlla l'indirizzo (con `http://` e la porta) e che la TV sia online.
- **Errore di firma/installazione** → il certificato deve includere il DUID della TV in uso; ricrealo se hai cambiato TV.
- **Liste non aggiornate** → *Impostazioni → Ricarica liste dal server*.

## Sviluppo

Non serve alcun build: è HTML/CSS/JavaScript puro, scritto in ES2015 compatibile con Chromium 47 (Tizen 3.0).

```bash
npm install          # solo per lint e test (eslint, playwright)
npm run dev          # server di sviluppo con un finto server Xtream
```

Apri <http://localhost:8080> e accedi con server `http://localhost:8080`, utente `demo`, password `demo`.
Nel browser si naviga con la tastiera: frecce, Invio = OK, Esc/Backspace = INDIETRO, F1 = ROSSO, PagSu/PagGiù = CH+/CH−.
I flussi video finti non sono riproducibili nel browser: la riproduzione vera va provata sulla TV.

```bash
npm run lint         # controlla anche l'uso di sintassi non supportata dalle TV più vecchie
npm test             # test unitari (client Xtream, storage)
npm run test:e2e     # test end-to-end in Chromium: telecomando, AVPlay simulato, mouse, player web, app Android simulata
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

## Note

- Le credenziali sono salvate solo nella memoria locale della TV.
- L'app è un semplice lettore: usala con abbonamenti IPTV legittimi.
