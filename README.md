# HomeTivu — app IPTV per TV Samsung e Android

Lettore per abbonamenti IPTV **Xtream Codes** (server + utente + password), in tre versioni dello stesso codice:

| Piattaforma | Cosa ti serve | Guida |
|---|---|---|
| **TV Samsung** (Tizen 3.0+, modelli dal 2017) | PC con Tizen Studio, TV in modalità sviluppatore | [docs/tv.md](docs/tv.md) |
| **Android** (telefono) | scaricare l'APK dalla [release `android-latest`](https://github.com/IlGiurgi/App-tv/releases/tag/android-latest) | [docs/android.md](docs/android.md) |
| **Browser** (PC) | niente da installare: <https://ilgiurgi.github.io/App-tv/> | [docs/web.md](docs/web.md) |

Installazione rapida sulla TV (dopo aver preparato TV e certificato una volta sola, vedi la guida):

```powershell
scripts\install-tv.ps1 -Tv 192.168.86.54 -Profile TiptOld     # Windows
scripts/install-tv.sh 192.168.86.54 TiptOld                    # macOS / Linux
```

Per chi sviluppa: [docs/sviluppo.md](docs/sviluppo.md). Seconda app, separata: [SitoTV](sitotv/README.md).

## Funzionalità

- **Live TV**: categorie, lista canali con logo, EPG "ora / dopo" con barra di avanzamento,
  zapping con ▲/▼ o CH+/CH−, salto diretto a un canale digitando il numero
- **Guida TV**: griglia con i programmi delle prossime 3 ore per tutti i canali di una categoria
  (sul telefono si scorre in orizzontale); OK su un programma apre il canale
- **Film**: griglia locandine, scheda con trama/genere/voto, **ripresa dal punto in cui eri rimasto**
- **Serie TV**: stagioni ed episodi, ripresa per episodio, **passaggio automatico all'episodio successivo**
- **Preferiti** (tasto ROSSO) per canali, film e serie
- **Ricerca** su canali, film e serie
- **Le tue partite**: in Impostazioni scrivi squadre, piloti o tornei ("Inter, Sinner, F1"); l'app li cerca nella guida
  dei canali preferiti e delle categorie sportive (ogni 3 ore, un canale alla volta). Le partite trovate sono in
  Preferiti → Le tue partite e in alto nella Home a riquadri; 10 minuti prima compare un avviso, OK per guardarla
- **Sensore per Home Assistant** (solo TV): `sensor.hometivu_<modello>` con il canale come stato e programma, numero,
  tipo, stato e feed come attributi, da usare nelle automazioni (disattivabile in Impostazioni → Casa)
- **Impostazioni**: info account (scadenza, connessioni), formato dei canali live (MPEG-TS / HLS), ricarica liste, logout
- Navigazione completa con il telecomando; le liste molto lunghe (decine di migliaia di elementi) vengono caricate a blocchi
- Riproduzione con il player nativo Samsung **AVPlay** (TS, HLS, MP4, MKV…)
- **Recupero automatico** dei canali bloccati: se lo stream dà errore, resta in caricamento o l'immagine si ferma,
  viene riaperto da solo (fino a 6 tentativi con pause crescenti); dal secondo tentativo passa ai feed alternativi
  dello stesso canale (stesso nome con altra qualità o "backup", oppure l'altro formato TS/HLS)
  Il banner del canale (OK) elenca i feed di riserva trovati; Impostazioni → Feed di riserva → "Prova canale di riserva"
  mostra cosa ha trovato per l'ultimo canale guardato e permette di aprire ogni feed
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
| GIALLO | — | ricarica lo stream |
| BLU | — | Live: passa a un altro feed dello stesso canale |


## Problemi comuni

- **Un canale non parte** → *Impostazioni → Formato canali live*: prova HLS (m3u8) invece di MPEG-TS, o viceversa.
- **"Impossibile contattare il server"** → controlla l'indirizzo (con `http://` e la porta) e che la TV sia online.
- **Errore di firma/installazione** → il certificato deve includere il DUID della TV in uso; ricrealo se hai cambiato TV.
- **Liste non aggiornate** → *Impostazioni → Ricarica liste dal server*.


## Note

- Le credenziali sono salvate solo nella memoria locale del dispositivo (TV, telefono o browser).
- L'app è un semplice lettore: usala con abbonamenti IPTV legittimi.
- La chiave dell'APK (`android/app/xtreamtv.keystore`) è pubblica nella repo: va bene per un'app personale
  installata a mano, non per il Play Store.
