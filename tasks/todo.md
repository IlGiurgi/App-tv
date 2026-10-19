# Piano — App IPTV Xtream Codes per Samsung Tizen

## Obiettivo
Web app Tizen (.wgt) per TV Samsung (Tizen 3.0+, modelli 2017+) che gestisce un
account Xtream Codes: Live TV, Film (VOD), Serie TV, Preferiti, Ricerca.

## Scelte tecniche
- Vanilla JS (ES2015 senza async/await, compatibile con Chromium 47 di Tizen 3.0), nessun build step.
- Player: Samsung AVPlay (`webapis.avplay`) su TV, fallback `<video>` HTML5 nel browser per lo sviluppo.
- Navigazione col telecomando: spatial navigation generica con focus "virtuale" (`.focused`) e memoria per zona.
- Dati: un'unica chiamata per tipo (`get_live_streams`, `get_vod_streams`, `get_series`), cache in memoria, filtro per categoria e ricerca locali.
- Persistenza: `localStorage` (account, preferiti, posizione di ripresa film/episodi, impostazioni).
- Layout progettato a 1920x1080, scalato automaticamente nel browser.

## Attività
- [x] Struttura progetto Tizen (`app/config.xml`, `.project`, `.tproject`, icona)
- [x] Client API Xtream (`js/xtream.js`) con normalizzazione URL ed EPG base64
- [x] Storage (account, preferiti, resume, impostazioni)
- [x] Gestione tasti telecomando + spatial navigation
- [x] Schermata login
- [x] Schermata principale: tab, categorie, lista canali / griglia poster, chunked rendering
- [x] Dettaglio film / serie (stagioni + episodi)
- [x] Player (AVPlay + fallback HTML5), overlay info, EPG now/next, zapping CH+/CH-, seek
- [x] Preferiti (tasto ROSSO), ricerca, impostazioni (formato live, info account, logout)
- [x] Mock server Xtream per sviluppo (`dev/mock-server.js`)
- [x] Test unitari (node --test) + smoke test E2E con Playwright
- [x] README in italiano: installazione su TV (Tizen Studio, certificato Samsung, Developer Mode)

## Possibili sviluppi futuri
- Guida EPG completa (griglia XMLTV)
- Catch-up / timeshift (`tv_archive`)
- Più profili/account, PIN parental control
- Sottotitoli e tracce audio multiple (AVPlay `getTotalTrackInfo`)

## Revisione (v1.0.0)
Verifiche eseguite:
- `npm run lint`: ok (regole che vietano sintassi non supportata da Chromium 47)
- `npm test`: 11/11 test unitari (client Xtream, storage preferiti/ripresa)
- `npm run test:e2e`: 12 passi smoke (login, navigazione, chunking, preferiti, player, zapping, film, serie,
  ricerca, impostazioni, sessione persistente) + 3 passi con AVPlay simulato (URL .ts/.mp4/.mkv,
  trasparenza del piano video, salto per numero canale, seek, ripresa, episodio successivo)
- Screenshot a 1920x1080 controllati a mano

Correzioni emerse dai test:
- INDIETRO ora risale lista → categorie → tab (prima da una lista lunga servivano decine di ▲)
- Durante la riproduzione anche `<html>` è trasparente (AVPlay disegna sotto la pagina)
- Dopo aver visto parte di un film il focus torna su "Riprendi"
- Griglia locandine a 6 colonne (mancavano 2px)

Non verificabile qui: riproduzione reale su TV fisica (AVPlay vero), pacchettizzazione firmata.

---

# Piano v1.1 — Versione web su GitHub Pages

Obiettivo: la stessa app apribile da browser (PC) su GitHub Pages, senza credenziali nel codice.

- [x] Player browser: `mpegts.js` per i canali .ts, `hls.js` per .m3u8 (caricati da CDN solo quando servono, mai sulla TV)
- [x] Mouse: clic = focus + OK, rotellina per scorrere (con caricamento a blocchi), pulsante "Indietro" visibile solo con il mouse, doppio clic sul video = schermo intero
- [x] Layout centrato nella finestra del browser
- [x] Messaggi d'errore utili nel browser (CORS / contenuti http bloccati su pagina https)
- [x] GitHub Actions: lint + test unitari + E2E su ogni push; deploy su Pages dal branch predefinito
- [x] Test E2E web: mouse, rotellina, librerie video simulate (URL .ts/.m3u8, distruzione del player)
- [x] README: sezione "Versione web"

## Revisione (v1.1)
- `npm run lint`, `npm test` (11/11), `npm run test:e2e` (12 smoke + 3 AVPlay + 7 web): tutto verde
- Verifica con hls.js 1.7.3 e mpegts.js 1.8.2 reali (dai pacchetti npm): API usate correttamente, errori gestiti
  (nel Chromium di test mpegts.js risulta "non supportato" per l'assenza dei codec H.264: atteso, Chrome li ha)
- Screenshot col mouse a 1440x900 controllati (layout centrato, pulsante Indietro, hover)
- Non verificabile da qui: CORS del server reale (rifiuta le connessioni da questo ambiente cloud) e
  jsDelivr (bloccato dalla rete di questo ambiente): si vedrà al primo accesso dalla pagina pubblicata

---

# Piano v1.2 — App Android (APK)

Obiettivo: stessa app su telefono Android, funzionante anche fuori casa e senza blocco CORS.

- [x] Capacitor 8 (`android/`): impacchetta `app/` in un'app Android; `CapacitorHttp` fa le richieste API in nativo (niente CORS)
- [x] Lettore video nativo Media3/ExoPlayer (plugin `NativePlayer`): TS, HLS, MP4, MKV, playlist con canale/episodio prec./succ., ripresa
- [x] Tasto Indietro di Android collegato all'app; uscita con doppio Indietro
- [x] Interfaccia per telefono (`html.mobile`): verticale e orizzontale, elementi grandi da toccare, scorrimento touch
- [x] Icona dell'app
- [x] GitHub Actions: compila l'APK e lo pubblica nella release "Android (ultima versione)"
- [x] Test E2E: layout telefono, plugin nativo simulato (playlist, ripresa, tasto Indietro)
- [x] README: installazione dell'APK

## Revisione (v1.2)
- lint, 11 test unitari, E2E: 12 smoke + 3 AVPlay + 7 web + 6 app Android (Capacitor e NativePlayer simulati): tutto verde
- Screenshot del layout telefono controllati in verticale e orizzontale (login, live, film, dettaglio serie, impostazioni)
- Codice Java (plugin + ExoPlayer) compilato solo in GitHub Actions: qui non ci sono SDK Android né Maven di Google
- Non verificabile qui: riproduzione reale su telefono e connessione al server del provider

---

# Piano v1.9 — Home a riquadri (launcher) sulla TV

Anteprima approvata da Denis il 2026-10-19, con copertine casuali che girano su Film e Serie.

- [x] Nuova schermata `launcher` (solo TV): Live TV grande, Preferiti, Guida, Film, Serie, Casa, Impostazioni, Cerca
- [x] Film e Serie: tre locandine a ventaglio che cambiano a caso ogni pochi secondi
- [x] Live TV: ultimo canale con programma in onda; con un canale nel riquadro il video gira dentro il riquadro Live TV
- [x] Casa: luci accese, clima, anteprima della telecamera; meteo e orologio in alto
- [x] Avvio: "Apri all'avvio" ha l'opzione Home (predefinita); INDIETRO dalle sezioni torna alla Home
- [x] Layout senza grid/gap/variabili CSS (Chromium 47)
- [x] Test E2E per la Home; test esistenti verdi

## Revisione (v1.9)
- lint, test unitari, E2E (smoke, AVPlay, Casa, Home a riquadri, web, Android, SitoTV): tutto verde
- Screenshot della Home a 1920x1080 controllati, a riposo e con il canale nel riquadro Live TV
- Al posto di SitoTV (app separata) il riquadro Cerca; fuori dalla TV la Home non c'è (avvio come prima)
- Non verificabile qui: fluidità su Tizen 3.0 e posizione reale del video nel riquadro Live TV
