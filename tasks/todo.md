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
