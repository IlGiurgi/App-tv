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

## 2026-10-11 — Le liste non scorrevano sul telefono
- **Errore**: nel layout telefono `.content` è un elemento flex in colonna con `min-height: auto`: cresceva
  quanto la lista (3620px) invece di restare nello schermo, quindi non c'era nulla da scorrere.
  Gli screenshot sembravano corretti perché il contenuto in eccesso era solo tagliato.
- **Regola**: ogni elemento flex che deve contenere un'area scorrevole va con `min-height: 0`
  (o `min-width: 0` in riga).
- **Regola**: uno screenshot non prova che un'interfaccia funzioni: sulle viste touch testare lo
  scorrimento con tocchi reali (CDP `Input.dispatchTouchEvent`, non `synthesizeScrollGesture`, che in
  headless non scorre) e verificare `scrollTop`.

## 2026-10-11 — Preferiti dal telefono e gesti touch
- **Errore**: una funzione legata a un tasto fisico (ROSSO = preferiti) non aveva equivalente touch.
  **Regola**: per ogni azione da telecomando prevedere l'equivalente per touch e mouse.
- **Errore**: `#toast`, anche trasparente, intercettava i tocchi in fondo allo schermo.
  **Regola**: gli elementi sovrapposti solo informativi vanno con `pointer-events: none`.
- **Errore**: dopo un tocco Chrome genera eventi mouse emulati (`mousedown`, `click`): azzerare lo stato
  su `mousedown` annullava la soppressione del clic dopo la pressione prolungata.
  **Regola**: distinguere i veri eventi mouse da quelli emulati (es. mousedown entro 1 s da un touchend).
