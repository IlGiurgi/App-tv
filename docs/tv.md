# Installazione sulla TV Samsung

Le app non provenienti dallo store si installano in **modalità sviluppatore**. Serve un PC
(Windows, macOS o Linux) collegato alla **stessa rete** della TV.

### 1. Installa Tizen Studio

1. Scarica e installa [Tizen Studio](https://developer.tizen.org/development/tizen-studio/download)
   (la versione "with IDE" è la più semplice).
2. Apri il **Package Manager** e installa:
   - scheda *Main SDK*: **Tizen SDK tools**
   - scheda *Extension SDK*: **TV Extensions** (l'ultima versione) e **Samsung Certificate Extension**

### 2. Attiva la modalità sviluppatore sulla TV

1. Sulla TV apri **Apps** (App).
2. Digita **1 2 3 4 5** con il telecomando (o dal tastierino virtuale): compare la finestra *Developer mode*.
3. Metti **On** e inserisci l'**indirizzo IP del PC**.
4. Spegni e riaccendi la TV (tenendo premuto il tasto di accensione finché non si riavvia).
5. Annota l'indirizzo IP della TV (*Impostazioni → Generali → Rete → Stato rete → Impostazioni IP*).

### 3. Collega la TV a Tizen Studio

In Tizen Studio: **Tools → Device Manager → Remote Device Manager → +**, inserisci nome e IP della TV
(porta 26101) e attiva il collegamento. Da riga di comando equivale a:

```bash
sdb connect 192.168.1.50   # IP della TV
sdb devices                # deve comparire la TV
```

### 4. Crea il certificato Samsung

**Tools → Certificate Manager → +** → **Samsung** → **TV** → crea un nuovo profilo.
Accedi con un account Samsung; quando chiede il DUID del dispositivo lascia quello della TV collegata
(viene compilato automaticamente). Il certificato funziona solo per le TV indicate.

### 5. Compila e installa

**Da Tizen Studio**: *File → Import → Tizen → Tizen Project*, seleziona la cartella `app/` di questo
repository, poi tasto destro sul progetto → **Run As → Tizen Web Application**.

**Con lo script** (consigliato: parte da una copia pulita del repository, così non resta nulla di vecchio che
fa fallire l'installazione con errore 118, e alla fine riapre l'app sulla TV):

```powershell
scripts\install-tv.ps1 -Tv 192.168.86.54 -Profile NOME_PROFILO      # Windows
scripts/install-tv.sh 192.168.86.54 NOME_PROFILO                     # macOS / Linux
```

Per SitoTV aggiungi `-What sitotv` (Windows) o `sitotv` come terzo argomento (macOS / Linux).

**A mano**: `tizen package -t wgt -s NOME_PROFILO -- app`, poi rinomina il `.wgt` senza spazi,
`tizen install -n HomeTivu.wgt -s IP_TV:26101` e `tizen run -p XtrmIPTVtv.XtreamTV -s IP_TV:26101`.
Cancella prima la cartella `app/.buildResult`, se esiste.

### 6. Primo avvio

Inserisci i dati forniti dal tuo provider IPTV:

- **Server**: es. `http://nomeserver.com:8080`. Puoi anche incollare il link completo della lista M3U (`…/get.php?username=…&password=…`): utente e password vengono compilati da soli
- **Utente** e **Password**

L'account viene ricordato: ai successivi avvii si entra direttamente.


## Se l'installazione fallisce

- **Errore 118 (circa al 22%)**: o il certificato Samsung non è accettato dalla TV (succede con alcuni modelli
  2017: usa un profilo con certificato di sviluppo generico), oppure nel pacchetto è finita una cartella
  `.buildResult` vecchia. Lo script `install-tv.sh` / `install-tv.ps1` evita il secondo caso.
- **`sdb devices` non mostra la TV**: riesegui `sdb connect IP_TV:26101` (l'estensione Tizen di VS Code riavvia sdb).
- **Modalità sviluppatore non applicata**: scollega la TV dalla presa per circa 30 secondi.
