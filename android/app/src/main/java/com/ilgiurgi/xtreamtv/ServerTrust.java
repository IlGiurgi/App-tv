package com.ilgiurgi.xtreamtv;

import android.content.Context;
import android.content.SharedPreferences;
import java.net.Socket;
import java.security.KeyStore;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.Locale;
import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLEngine;
import javax.net.ssl.SSLSession;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509ExtendedTrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * Eccezione al controllo dei certificati per UN solo server, scelta dall'utente al login
 * ("Accetta il certificato non valido di questo server").
 *
 * Tutti gli altri siti restano verificati normalmente: il certificato viene prima controllato
 * con le regole di sistema e accettato comunque solo se il nome del server è quello autorizzato.
 * Vale per le richieste API (CapacitorHttp) e per i video (ExoPlayer), che usano HttpsURLConnection.
 */
final class ServerTrust {

    private static final String PREFS = "server_trust";
    private static final String KEY_HOST = "host";

    private static volatile String allowedHost;
    private static boolean installed;

    private ServerTrust() {}

    /** Da chiamare all'avvio dell'app: ripristina l'eccezione salvata. */
    static synchronized void install(Context context) {
        allowedHost = prefs(context).getString(KEY_HOST, null);
        if (installed) return;
        try {
            X509TrustManager system = systemTrustManager();
            SSLContext ssl = SSLContext.getInstance("TLS");
            ssl.init(null, new TrustManager[] { new HostExceptionTrustManager(system) }, null);
            HttpsURLConnection.setDefaultSSLSocketFactory(ssl.getSocketFactory());
            HostnameVerifier systemVerifier = HttpsURLConnection.getDefaultHostnameVerifier();
            HttpsURLConnection.setDefaultHostnameVerifier(
                    (hostname, session) -> isAllowed(hostname) || systemVerifier.verify(hostname, session));
            installed = true;
        } catch (Exception e) {
            // Senza eccezione i certificati restano verificati normalmente.
        }
    }

    /** Imposta (o con null rimuove) il server autorizzato. */
    static synchronized void setAllowedHost(Context context, String host) {
        allowedHost = host == null || host.isEmpty() ? null : host.toLowerCase(Locale.ROOT);
        prefs(context).edit().putString(KEY_HOST, allowedHost).apply();
    }

    static boolean isAllowed(String host) {
        String allowed = allowedHost;
        return allowed != null && host != null && allowed.equals(host.toLowerCase(Locale.ROOT));
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static X509TrustManager systemTrustManager() throws Exception {
        TrustManagerFactory factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        factory.init((KeyStore) null);
        for (TrustManager manager : factory.getTrustManagers()) {
            if (manager instanceof X509TrustManager) return (X509TrustManager) manager;
        }
        throw new IllegalStateException("Nessun TrustManager di sistema");
    }

    /** Verifica di sistema; se fallisce, accetta solo se il server è quello autorizzato. */
    private static final class HostExceptionTrustManager extends X509ExtendedTrustManager {
        private final X509TrustManager system;

        HostExceptionTrustManager(X509TrustManager system) {
            this.system = system;
        }

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType, Socket socket)
                throws CertificateException {
            String host = null;
            if (socket instanceof SSLSocket) {
                SSLSession session = ((SSLSocket) socket).getHandshakeSession();
                if (session != null) host = session.getPeerHost();
            }
            check(chain, authType, host);
        }

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType, SSLEngine engine)
                throws CertificateException {
            check(chain, authType, engine == null ? null : engine.getPeerHost());
        }

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
            system.checkServerTrusted(chain, authType);
        }

        private void check(X509Certificate[] chain, String authType, String host) throws CertificateException {
            try {
                system.checkServerTrusted(chain, authType);
            } catch (CertificateException e) {
                if (!isAllowed(host)) throw e;
            }
        }

        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType, Socket socket)
                throws CertificateException {
            system.checkClientTrusted(chain, authType);
        }

        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType, SSLEngine engine)
                throws CertificateException {
            system.checkClientTrusted(chain, authType);
        }

        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
            system.checkClientTrusted(chain, authType);
        }

        @Override
        public X509Certificate[] getAcceptedIssuers() {
            return system.getAcceptedIssuers();
        }
    }
}
