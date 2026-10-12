package com.ilgiurgi.xtreamtv;

import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Riproduzione a schermo intero con ExoPlayer (Media3): MPEG-TS, HLS, MP4, MKV.
 * Con più elementi mostra i pulsanti precedente/successivo (zapping, episodi) e passa da solo
 * all'elemento successivo a fine riproduzione. Alla chiusura restituisce elemento e posizione.
 */
@OptIn(markerClass = UnstableApi.class)
public class PlayerActivity extends AppCompatActivity {

    static final String EXTRA_ITEMS = "items";
    static final String EXTRA_INDEX = "index";
    static final String EXTRA_START_MS = "startMs";
    static final String EXTRA_LIVE = "live";
    static final String EXTRA_SWIPE = "swipe";
    static final String RESULT_POSITION_MS = "positionMs";
    static final String RESULT_DURATION_MS = "durationMs";
    static final String RESULT_ERROR = "error";

    private static final int MAX_LIVE_RETRIES = 3;
    private static final long RETRY_DELAY_MS = 2000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private ExoPlayer player;
    private PlayerView playerView;
    private TextView titleView;
    private boolean live;
    private int liveRetries;
    private String lastError;
    private GestureDetector swipeDetector;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        Intent intent = getIntent();
        live = intent.getBooleanExtra(EXTRA_LIVE, false);
        List<MediaItem> items = parseItems(intent.getStringExtra(EXTRA_ITEMS));
        int index = Math.max(0, Math.min(items.size() - 1, intent.getIntExtra(EXTRA_INDEX, 0)));
        long startMs = intent.getLongExtra(EXTRA_START_MS, 0);

        buildLayout();
        hideSystemBars();

        // Molti server Xtream reindirizzano da https a http: va permesso esplicitamente.
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(15000)
                .setReadTimeoutMs(15000);
        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(this).setDataSourceFactory(http))
                .build();
        player.addListener(new Player.Listener() {
            @Override
            public void onMediaItemTransition(MediaItem mediaItem, int reason) {
                liveRetries = 0;
                updateTitle();
            }

            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY) liveRetries = 0;
                if (state == Player.STATE_ENDED) finishWithResult();
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                lastError = error.getErrorCodeName();
                if (live && liveRetries < MAX_LIVE_RETRIES) {
                    // Le dirette IPTV cadono spesso per qualche secondo: si riprova da soli.
                    liveRetries++;
                    handler.postDelayed(() -> {
                        if (player == null) return;
                        player.seekToDefaultPosition();
                        player.prepare();
                    }, RETRY_DELAY_MS);
                } else {
                    Toast.makeText(PlayerActivity.this,
                            "Impossibile riprodurre (" + lastError + ")", Toast.LENGTH_LONG).show();
                }
            }
        });

        playerView.setPlayer(player);
        playerView.setShowFastForwardButton(!live);
        playerView.setShowRewindButton(!live);
        playerView.setShowNextButton(items.size() > 1);
        playerView.setShowPreviousButton(items.size() > 1);
        playerView.setControllerVisibilityListener(
                (PlayerView.ControllerVisibilityListener) visibility -> titleView.setVisibility(visibility));

        player.setMediaItems(items, index, live ? C.TIME_UNSET : startMs);
        player.prepare();
        player.setPlayWhenReady(true);
        updateTitle();

        // Dirette: scorrendo col dito a sinistra/destra si passa al canale successivo/precedente
        // (solo se attivato nelle Impostazioni dell'app).
        if (intent.getBooleanExtra(EXTRA_SWIPE, false)) installSwipe();

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                finishWithResult();
            }
        });
    }

    private void installSwipe() {
        final float minDistance = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 80, getResources().getDisplayMetrics());
        swipeDetector = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onFling(MotionEvent start, MotionEvent end, float velocityX, float velocityY) {
                if (!live || start == null || player == null || player.getMediaItemCount() < 2) return false;
                float dx = end.getX() - start.getX();
                float dy = end.getY() - start.getY();
                if (Math.abs(dx) < minDistance || Math.abs(dx) < Math.abs(dy) * 2) return false;
                zap(dx < 0 ? 1 : -1);
                return true;
            }
        });
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        // Il gesto si osserva prima del PlayerView (che riceve comunque il tocco per i suoi controlli).
        if (swipeDetector != null) swipeDetector.onTouchEvent(event);
        return super.dispatchTouchEvent(event);
    }

    /** Canale successivo (+1) o precedente (-1), ricominciando dall'altro capo della lista. */
    private void zap(int delta) {
        int count = player.getMediaItemCount();
        int index = (player.getCurrentMediaItemIndex() + delta + count) % count;
        player.seekToDefaultPosition(index);
        player.prepare();
        player.setPlayWhenReady(true);
        playerView.showController();
    }

    private List<MediaItem> parseItems(String json) {
        List<MediaItem> items = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(json == null ? "[]" : json);
            for (int i = 0; i < array.length(); i++) {
                JSONObject item = array.getJSONObject(i);
                items.add(new MediaItem.Builder()
                        .setUri(item.getString("url"))
                        .setMediaMetadata(new MediaMetadata.Builder().setTitle(item.optString("title", "")).build())
                        .build());
            }
        } catch (JSONException e) {
            lastError = "Playlist non valida";
        }
        return items;
    }

    private void buildLayout() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        playerView = new PlayerView(this);
        root.addView(playerView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        titleView = new TextView(this);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        titleView.setShadowLayer(6, 0, 2, Color.BLACK);
        int padding = Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 20, getResources().getDisplayMetrics()));
        titleView.setPadding(padding, padding, padding, padding);
        root.addView(titleView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP));

        setContentView(root);
    }

    private void hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    private void updateTitle() {
        MediaItem item = player == null ? null : player.getCurrentMediaItem();
        CharSequence title = item == null ? null : item.mediaMetadata.title;
        titleView.setText(title == null ? "" : title);
        titleView.setVisibility(playerView.isControllerFullyVisible() ? View.VISIBLE : View.GONE);
    }

    private void finishWithResult() {
        Intent data = new Intent();
        if (player != null) {
            long duration = player.getDuration();
            data.putExtra(EXTRA_INDEX, player.getCurrentMediaItemIndex());
            data.putExtra(RESULT_POSITION_MS, Math.max(0, player.getCurrentPosition()));
            data.putExtra(RESULT_DURATION_MS, duration == C.TIME_UNSET ? 0 : Math.max(0, duration));
        }
        data.putExtra(RESULT_ERROR, lastError);
        setResult(RESULT_OK, data);
        finish();
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (player != null) player.pause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }
}
