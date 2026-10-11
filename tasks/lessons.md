# Lezioni apprese

## 2026-10-11 — Pagina web vuota sui browser mobili
- **Errore**: la scala del layout fisso 1920x1080 usava `innerWidth/innerHeight`. Sui browser mobili
  `innerWidth` viene gonfiato dal contenuto largo e l'app finiva fuori schermo (si vedeva solo lo sfondo).
- **Regola**: per adattare un layout a dimensione fissa usare `document.documentElement.clientWidth/Height`
  e un contenitore `position: fixed` che non allarghi la pagina.
- **Regola**: ogni pagina pubblicata sul web va testata anche con emulazione mobile (`isMobile: true`,
  orizzontale e verticale), non solo con un viewport desktop.
- **Regola**: un errore JavaScript imprevisto deve comparire a schermo, mai una pagina vuota.
