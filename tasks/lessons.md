# Lezioni apprese

## 2026-10-11 — Pagina web vuota sui browser mobili
- **Errore**: la scala del layout fisso 1920x1080 usava `innerWidth/innerHeight`. Sui browser mobili
  `innerWidth` viene gonfiato dal contenuto largo e l'app finiva fuori schermo (si vedeva solo lo sfondo).
- **Regola**: per adattare un layout a dimensione fissa usare `document.documentElement.clientWidth/Height`
  e un contenitore `position: fixed` che non allarghi la pagina.
- **Regola**: ogni pagina pubblicata sul web va testata anche con emulazione mobile (`isMobile: true`,
  orizzontale e verticale), non solo con un viewport desktop.
- **Regola**: un errore JavaScript imprevisto deve comparire a schermo, mai una pagina vuota.

## 2026-10-11 — Build Android fallita: "Value is null" in build.gradle
- **Errore**: `versionCode (expr).toInteger()` in Groovy diventa `versionCode(expr).toInteger()`: il
  metodo restituisce null e la build fallisce. Stesso rischio con `versionName "a" + b`.
- **Regola**: nei file Gradle Groovy usare sempre l'assegnazione esplicita (`versionCode = ...`)
  quando il valore è un'espressione.
- **Regola**: senza SDK Android in locale, la prima compilazione vera è in CI: controllare il log
  appena finisce e correggere subito.

## 2026-10-11 — "Impossibile contattare il server" nell'app Android
- **Causa probabile**: server inserito come `https://` su una porta che parla solo HTTP (la 2052 è una porta
  HTTP standard di Cloudflare). Il suggerimento "CORS" nel browser era fuorviante: copriva ogni errore di rete.
- **Regola**: per gli errori di rete mostrare sempre l'indirizzo provato e non dare per certa una sola causa.
- **Regola**: al login, se il server non risponde, riprovare con l'altro protocollo (https <-> http)
  e salvare quello che funziona.
