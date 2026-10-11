package com.ilgiurgi.xtreamtv;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin "ServerTrust": JS -> ServerTrust.setAllowedHost({ host: "server.esempio.com" | null }).
 * L'eccezione viene salvata e ripristinata a ogni avvio dell'app.
 */
@CapacitorPlugin(name = "ServerTrust")
public class ServerTrustPlugin extends Plugin {

    @PluginMethod
    public void setAllowedHost(PluginCall call) {
        ServerTrust.setAllowedHost(getContext(), call.getString("host"));
        call.resolve();
    }
}
