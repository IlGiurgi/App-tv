<p align="center">
  <img src="app/hometivu.png" width="110" alt="Logo HomeTivu">
</p>

<h1 align="center">HomeTivu</h1>

<p align="center">
  <b>La tua IPTV Xtream Codes su TV Samsung, telefono Android e browser.</b><br>
  Live TV con guida, film, serie e preferiti, con un telecomando o un dito.
</p>

<p align="center">
  <a href="https://github.com/IlGiurgi/App-tv/actions/workflows/ci-pages.yml"><img src="https://github.com/IlGiurgi/App-tv/actions/workflows/ci-pages.yml/badge.svg" alt="Build"></a>
  <img src="https://img.shields.io/badge/Samsung%20Tizen-3.0%2B-1428A0?logo=samsung&logoColor=white" alt="Tizen 3.0+">
  <img src="https://img.shields.io/badge/Android-APK-3DDC84?logo=android&logoColor=white" alt="Android">
  <a href="https://github.com/IlGiurgi/App-tv/releases"><img src="https://img.shields.io/github/v/release/IlGiurgi/App-tv?include_prereleases&label=release" alt="Release"></a>
</p>

---

## Perché HomeTivu
Un solo codice, tre versioni: la stessa app gira sulla **TV Samsung** (player nativo AVPlay), sul **telefono Android**
(ExoPlayer) e nel **browser del PC**. Inserisci server, utente e password del tuo abbonamento **Xtream Codes**
e hai tutto. **Niente cloud, niente account, niente pubblicità**: i dati restano sul tuo dispositivo.

## Funzionalità

| | |
|---|---|
| 📺 **Live TV** | Categorie, canali con logo, EPG "ora / dopo", zapping con ▲/▼ o CH+/CH−, numero diretto da telecomando. |
| 🗓️ **Guida TV** | Griglia delle prossime 3 ore per tutti i canali di una categoria. OK su un programma apre il canale. |
| 🎬 **Film e serie** | Locandine, trama e voto, **ripresa da dove eri rimasto**, passaggio automatico all'episodio successivo. |
| ⭐ **Preferiti e ricerca** | Tasto ROSSO per i preferiti, ricerca su canali, film e serie. |
| ⚽ **Le tue partite** | Scrivi squadre, piloti o tornei: l'app li cerca nella guida e ti avvisa 10 minuti prima. |
| 🛟 **Canali che non si bloccano** | Se lo stream si ferma viene riaperto da solo, passando ai feed alternativi dello stesso canale (tasto BLU per cambiarli a mano). |
| 🏠 **Home Assistant** | Sulla TV: tab Casa con scene, luci, telecamere e il canale in un riquadro, più un sensore `sensor.hometivu_<modello>` per le automazioni. |
| 🖼️ **Home a riquadri** | Schermata iniziale grande con Live TV in anteprima, preferiti, guida, film, serie, casa e ricerca. |
| 🔒 **Privata** | Le credenziali restano nella memoria locale del dispositivo. |

## Come iniziare

| Piattaforma | Cosa ti serve | Guida |
|---|---|---|
| **TV Samsung** (Tizen 3.0+, dal 2017) | PC con Tizen Studio e TV in modalità sviluppatore | [docs/tv.md](docs/tv.md) |
| **Android** | scaricare l'APK dalla [release `android-latest`](https://github.com/IlGiurgi/App-tv/releases/tag/android-latest) | [docs/android.md](docs/android.md) |
| **Browser** | niente da installare: <https://ilgiurgi.github.io/App-tv/> | [docs/web.md](docs/web.md) |

Dopo aver preparato TV e certificato una sola volta, ogni aggiornamento sulla TV è un comando:

```powershell
scripts\install-tv.ps1 -Tv 192.168.86.54 -Profile TiptOld     # Windows
scripts/install-tv.sh 192.168.86.54 TiptOld                    # macOS / Linux
```

Al primo avvio inserisci **server** (es. `http://nomeserver.com:8080`, oppure incolla il link completo della lista M3U),
**utente** e **password**. L'account viene ricordato.

### Consigli
- Se un canale non parte: *Impostazioni → Formato canali live* e prova HLS (m3u8) invece di MPEG-TS, o viceversa.
- "Impossibile contattare il server": controlla l'indirizzo con `http://` e la porta, e che il dispositivo sia online.
- Liste vecchie: *Impostazioni → Ricarica liste dal server*.
- TV e telefono insieme contano come due connessioni sull'abbonamento.
- Errore di installazione 118 sulla TV: vedi [docs/tv.md](docs/tv.md#se-linstallazione-fallisce).

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
| GIALLO | — | ricarica lo stream |
| BLU | — | Live: passa a un altro feed dello stesso canale |

## Come funziona
È HTML, CSS e JavaScript puro (ES2015, compatibile con Chromium 47 delle TV del 2017), senza build.
Il client Xtream parla con `player_api.php`; sulla TV il video passa da **AVPlay**, sull'Android da
**ExoPlayer** tramite [Capacitor](https://capacitorjs.com), nel browser da
[mpegts.js](https://github.com/xqq/mpegts.js) e [hls.js](https://github.com/video-dev/hls.js).
GitHub Actions esegue lint e test a ogni push e, dal branch `main`, pubblica l'APK, lo zip dei sorgenti TV
e il sito.

## Sviluppo
```bash
npm install     # solo per lint e test
npm run dev     # server di sviluppo con un finto server Xtream su http://localhost:8080 (demo / demo)
npm run lint && npm test && npm run test:e2e
```
Dettagli, struttura delle cartelle e build Android in [docs/sviluppo.md](docs/sviluppo.md).
Seconda app, separata: [SitoTV](sitotv/README.md), un sito web a schermo intero sulla TV.

## Contribuire
Segnalazioni e idee sono benvenute in [Issues](https://github.com/IlGiurgi/App-tv/issues): indica modello di TV
o telefono e cosa è successo.

## Note
- L'app è un semplice lettore: usala con abbonamenti IPTV legittimi.
- La chiave dell'APK (`android/app/xtreamtv.keystore`) è pubblica nella repo: va bene per un'app personale installata
  a mano, non per il Play Store.
- Progetto indipendente, non affiliato a Samsung, Google, Home Assistant o a qualsiasi fornitore IPTV.
