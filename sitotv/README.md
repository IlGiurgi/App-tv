# SitoTV — un sito web a schermo intero


Nella cartella `sitotv/` c'è una seconda app, separata da HomeTivu (id `SitoTVview.SitoTV`), che apre
a schermo intero un sito scelto da te.

- Al primo avvio scrivi l'indirizzo (OK sul campo apre la tastiera, OK di nuovo per aprire il sito).
- Agli avvii successivi il sito si apre da solo dopo 4 secondi; in quel momento OK o ROSSO
  permettono di cambiare indirizzo.
- Il sito occupa tutta la finestra dell'app, quindi frecce, OK e INDIETRO arrivano direttamente alla pagina.
  Come si comportano dipende dal sito. EXIT o HOME chiudono sempre l'app.

Si installa come HomeTivu, partendo dalla cartella `sitotv`:

```bash
cd sitotv
tizen package -t wgt -s TiptOld
tizen install -n SitoTV.wgt -t <nome-dispositivo>
tizen run -p SitoTVview.SitoTV -t <nome-dispositivo>
```
