package com.ilgiurgi.xtreamtv;

import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin "NativePlayer": apre {@link PlayerActivity} (ExoPlayer) con una playlist e restituisce
 * a JavaScript l'elemento e la posizione a cui l'utente si è fermato, per la ripresa.
 *
 * JS: NativePlayer.play({ items: [{url, title}], index, startAt (secondi), live })
 *     -> { index, position (s), duration (s), error }
 */
@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {

    @PluginMethod
    public void play(PluginCall call) {
        JSArray items = call.getArray("items");
        if (items == null || items.length() == 0) {
            call.reject("Nessun contenuto da riprodurre");
            return;
        }
        Intent intent = new Intent(getContext(), PlayerActivity.class);
        intent.putExtra(PlayerActivity.EXTRA_ITEMS, items.toString());
        intent.putExtra(PlayerActivity.EXTRA_INDEX, call.getInt("index", 0));
        intent.putExtra(PlayerActivity.EXTRA_START_MS, (long) (call.getDouble("startAt", 0.0) * 1000));
        intent.putExtra(PlayerActivity.EXTRA_LIVE, call.getBoolean("live", false));
        startActivityForResult(call, intent, "onPlayerClosed");
    }

    @ActivityCallback
    private void onPlayerClosed(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        JSObject ret = new JSObject();
        if (data != null) {
            ret.put("index", data.getIntExtra(PlayerActivity.EXTRA_INDEX, 0));
            ret.put("position", data.getLongExtra(PlayerActivity.RESULT_POSITION_MS, 0) / 1000.0);
            ret.put("duration", data.getLongExtra(PlayerActivity.RESULT_DURATION_MS, 0) / 1000.0);
            ret.put("error", data.getStringExtra(PlayerActivity.RESULT_ERROR));
        } else {
            ret.put("index", call.getInt("index", 0));
            ret.put("position", 0);
            ret.put("duration", 0);
        }
        call.resolve(ret);
    }
}
