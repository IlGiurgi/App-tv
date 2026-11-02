#!/usr/bin/env bash
# Pacchettizza HomeTivu da una copia pulita e la installa su una TV Samsung.
# Uso: scripts/install-tv.sh <ip-tv> [profilo-certificato] [app|sitotv]
set -euo pipefail
TV="${1:?uso: install-tv.sh <ip-tv> [profilo] [app|sitotv]}"
PROFILE="${2:-TiptOld}"
WHAT="${3:-app}"
case "$WHAT" in
  app)    ID="XtrmIPTVtv.XtreamTV"; NAME="HomeTivu" ;;
  sitotv) ID="SitoTVview.SitoTV";   NAME="SitoTV" ;;
  *) echo "terzo argomento: app o sitotv"; exit 1 ;;
esac
TIZEN="${TIZEN_HOME:-$HOME/tizen-studio}/tools/ide/bin/tizen"
SDB="${TIZEN_HOME:-$HOME/tizen-studio}/tools/sdb"
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
# Copia pulita dei soli file versionati: evita .buildResult e altri residui (errore 118).
git -C "$ROOT" archive HEAD "$WHAT" | tar -x -C "$WORK"
"$TIZEN" package -t wgt -s "$PROFILE" -o "$WORK" -- "$WORK/$WHAT"
mv "$WORK"/*.wgt "$WORK/$NAME.wgt"
"$SDB" connect "$TV:26101" || true
"$TIZEN" install -n "$NAME.wgt" -s "$TV:26101" -- "$WORK"
"$TIZEN" run -p "$ID" -s "$TV:26101"
