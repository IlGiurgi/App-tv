package com.ilgiurgi.xtreamtv;

import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.webkit.SslErrorHandler;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Prima di qualsiasi richiesta: eventuale eccezione al certificato scelta dall'utente.
        ServerTrust.install(this);
        // I plugin locali vanno registrati prima di avviare il bridge.
        registerPlugin(NativePlayerPlugin.class);
        registerPlugin(ServerTrustPlugin.class);
        super.onCreate(savedInstanceState);

        // Le immagini (loghi, locandine) del server autorizzato vengono caricate anche con certificato
        // non valido; per tutti gli altri siti resta il comportamento normale (caricamento annullato).
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                String host = Uri.parse(error.getUrl()).getHost();
                if (ServerTrust.isAllowed(host)) handler.proceed();
                else super.onReceivedSslError(view, handler, error);
            }
        });
    }
}
