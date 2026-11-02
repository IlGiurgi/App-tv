# Versione web (browser sul PC)

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

