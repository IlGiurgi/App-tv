# App Android (telefono)

L'app per Android funziona ovunque, anche fuori casa: le richieste al server partono dall'app
(niente blocco CORS) e il video usa il lettore nativo **ExoPlayer** (MPEG-TS, HLS, MP4, MKV).

**Installazione**

1. Dal telefono apri **https://github.com/IlGiurgi/App-tv/releases/tag/android-latest**
   e scarica **HomeTivu.apk**.
2. Aprilo dalle notifiche o da *Download*. Android chiederà di consentire l'installazione
   da questa fonte (browser o file manager): consenti e installa.
3. Avvia **HomeTivu** e accedi con server, utente e password.

Gli aggiornamenti si installano sopra la versione precedente, senza perdere preferiti e accesso.

**Server con certificato non valido**: se "Impossibile contattare il server" e, aprendo
`https://server:porta/player_api.php` nel browser del telefono, compare "la connessione non è sicura",
il provider usa un certificato non valido. Al login spunta **"Accetta il certificato non valido di questo
server"**: l'eccezione vale solo per quel server (gli altri siti restano verificati), viene rimossa al
logout o se il login fallisce, ed è indicata in *Impostazioni*. Su reti non fidate (Wi-Fi pubblici) i dati
dell'abbonamento sono meno protetti. Sulla TV Samsung questa eccezione non è possibile.

**Uso**: tocca per aprire, scorri col dito; **tieni premuto** un canale, film o serie per aggiungerlo o
toglierlo dai preferiti; **scorri a destra o sinistra** sulla lista per passare alla categoria successiva o
precedente (le sezioni Live TV, Film, Serie… si scelgono toccando i tab in alto); nel lettore a schermo
intero ci sono i comandi (pausa, avanti/indietro, canale o episodio precedente/successivo) e, se lo attivi
in *Impostazioni*, sui canali live **scorrendo a sinistra o destra sul video** si cambia canale. Il tasto Indietro di Android
risale nell'app; premuto due volte nella schermata principale chiude l'app.

**Come viene creato**: [Capacitor](https://capacitorjs.com) impacchetta la cartella `app/` nel progetto
`android/`; il plugin `NativePlayer` (`android/app/src/main/java/.../PlayerActivity.java`) apre ExoPlayer.
GitHub Actions compila l'APK a ogni push e lo pubblica nella release `android-latest`.
Per compilarlo in locale servono Android Studio (o l'SDK Android) e Java 21:

```bash
npm ci
npx cap sync android
cd android && ./gradlew assembleRelease   # -> app/build/outputs/apk/release/app-release.apk
```

L'APK è firmato con una chiave inclusa nel repository (`android/app/xtreamtv.keystore`), così gli
aggiornamenti si installano sopra la versione precedente. Va bene per un'app personale installata a mano,
non per pubblicarla sul Play Store.

