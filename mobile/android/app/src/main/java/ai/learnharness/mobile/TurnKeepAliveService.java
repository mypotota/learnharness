package ai.learnharness.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/**
 * The turn keep-alive (owner bug 2026-11-20): while the app is backgrounded
 * mid-turn, Android moves it to the cached state and its network/freeze
 * policy kills the embedded server's upstream LLM socket a few seconds in —
 * the turn dies mid-generation ("terminated"), the process itself survives.
 * A foreground service holds the app OUT of the cached state for exactly the
 * span of a running turn, so the server keeps generating with the screen
 * off. Started/stopped from the web layer through ChromeBridge
 * .setTurnActive; the notification is the required trade-off of any
 * foreground service on modern Android.
 */
public final class TurnKeepAliveService extends Service {
    private static final String CHANNEL_ID = "lh-turn-keepalive";
    private static final int NOTIFICATION_ID = 41;
    private static volatile boolean running = false;

    /** Idempotent start (the web layer fires on every status render). */
    static void start(Context context) {
        if (running) return;
        Intent intent = new Intent(context, TurnKeepAliveService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    /** Idempotent stop; a missed stop self-heals (see onStartCommand). */
    static void stop(Context context) {
        if (!running) return;
        context.stopService(new Intent(context, TurnKeepAliveService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForeground(NOTIFICATION_ID, notification);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        running = true;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // STOP is delivered as an intent-less start when the service is
        // restarted by the system — nothing to do; stopService() is the
        // only teardown path and onStopCommand owns no state.
        return Service.START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private Notification buildNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    getString(R.string.turn_keepalive_channel),
                    NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        return builder
                .setContentTitle(getString(R.string.turn_keepalive_title))
                .setContentText(getString(R.string.turn_keepalive_text))
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setOngoing(true)
                .build();
    }
}
