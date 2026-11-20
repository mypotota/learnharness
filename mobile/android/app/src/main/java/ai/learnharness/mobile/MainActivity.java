package ai.learnharness.mobile;

import android.app.Dialog;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

import androidx.activity.OnBackPressedCallback;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

/**
 * The window onto the loopback desktop server. Capacitor navigates to
 * `server.url` from the start — before node listens — so the WebView itself
 * stays invisible behind the launch splash until the first real document has
 * painted: the browser's error page never reaches the screen, the splash
 * simply hands over to the app. External links, file choosing and
 * getUserMedia prompts are Capacitor built-ins driven by the
 * server.allowNavigation config.
 */
public class MainActivity extends BridgeActivity {
    private FrameLayout splash;
    private TextView splashError;
    /** True once ServerRuntime saw the server answer HTTP; before that the
     *  WebView's own navigation (Capacitor's `server.url`) is expected to
     *  fail and must stay invisible. */
    private boolean serverReady = false;
    /** True once the real document has painted and the splash is gone. */
    private boolean pageRevealed = false;
    /** Set by a failed main-frame load and cleared by the next page start, so
     *  the browser's error page is never mistaken for a finished page. */
    private boolean mainFrameFailed = false;
    private int revealRetries = 0;
    private static final int MAX_REVEAL_RETRIES = 5;
    private static final long REVEAL_RETRY_MS = 500;
    private final Handler ui = new Handler(Looper.getMainLooper());
    /** The app's own theme, pushed by the web layer (LhChrome.setTheme): the
     *  exit card must match the app, not the system. */
    private volatile boolean appDark = true;
    private volatile int appBackground = Color.parseColor("#141414");
    /** App UI language, pushed by the i18n provider (LhChrome.setLocale).
     *  Until that push arrives (the splash stage), the system language is the
     *  closest guess — otherwise the exit card could greet a Chinese user in
     *  English. */
    private volatile String appLocale = Locale.getDefault().toLanguageTag();
    private Dialog exitDialog;
    /** System-bar / cutout insets in CSS pixels: top, right, bottom, left. */
    private int[] safeArea = new int[]{0, 0, 0, 0};
    /** AI-state notification ids (see notifyAIState) — fixed so each state
     *  replaces its predecessor instead of stacking. */
    private static final int NOTICE_QUESTION = 51;
    private static final int NOTICE_DONE = 52;
    private static final int NOTICE_ERROR = 53;
    private static final String CHANNEL_AI_QUESTION = "lh-ai-question";
    private static final String CHANNEL_AI_INFO = "lh-ai-info";
    private static final String TAG_NOTICE = "LH-NOTICE";
    /** A state that began this close to the departure is still "news": the
     *  learner had no time to register it before the app went away. */
    private static final long NEWS_TOLERANCE_MS = 3000L;
    /** The learner is looking at the app: no state notice is needed. */
    private volatile boolean resumed = false;
    /** When the learner left (epoch ms, same clock as the server's `since`):
     *  only states that BEGAN after this are news. */
    private volatile long pausedAt = 0L;
    /** The session whose turn the page is currently attached to, and whether
     *  that turn is still running (setTurnContext). The background watcher
     *  polls the server's notice projection for exactly this session. */
    private volatile String turnChatId = null;
    private volatile boolean turnActive = false;
    private Thread turnWatcher = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalProxyPlugin.class);
        registerPlugin(SecureStorePlugin.class);
        super.onCreate(savedInstanceState);
        setTheme(R.style.AppTheme_NoActionBar);
        // Before the web layer pushes the real theme, the splash palette is
        // what is on screen — the exit card should match it, not a guess.
        boolean night = (getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        appDark = night;
        appBackground = ContextCompat.getColor(this, R.color.splash_background);

        installSplash();
        polishWebViewSettings();
        holdWebViewUntilFirstPaint();
        RenderService.start(this);
        ServerRuntime.start(
                getApplicationContext(),
                () -> runOnUiThread(this::onServerReady),
                () -> runOnUiThread(this::onServerFailed));

        // The turn keep-alive's notification (Android 13+): without the
        // grant the foreground service still runs — only its "generating"
        // notification is hidden. Ask once at startup so the user sees why
        // the phone stays awake during a turn.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                        != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 41);
        }

        // Predictive back (the manifest opts in): androidx's dispatcher owns
        // the gesture, and its fallback bypasses this Activity's
        // onBackPressed override — a raw OnBackInvokedCallback registered
        // beside it never ran (verified on Android 15). Register through the
        // dispatcher instead; the async web/exit decision then lives in
        // handleBack().
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleBack();
            }
        });
    }

    @Override
    public void onBackPressed() {
        handleBack();
    }

    @Override
    public void onDestroy() {
        if (exitDialog != null) {
            exitDialog.dismiss();
            exitDialog = null;
        }
        ui.removeCallbacksAndMessages(null);
        stopTurnWatcher();
        RenderService.stop();
        super.onDestroy();
    }

    /** The WebView's own visibilitychange is unreliable here: on this
     *  Chromium the background transition either never fires or reports a
     *  stale "visible", so the web layer never learns it was hidden and a
     *  frozen stream stays dead (owner bug 2026-11-20). The Activity
     *  lifecycle is authoritative: push both transitions into the page.
     *  Queued JS preserves the hidden→visible order even when the pause
     *  callback only executes after the process unfreezes. */
    @Override
    public void onPause() {
        super.onPause();
        resumed = false;
        pausedAt = System.currentTimeMillis();
        pushNativeVisibility("hidden");
        if (turnActive) startTurnWatcher();
    }

    @Override
    public void onResume() {
        super.onResume();
        resumed = true;
        stopTurnWatcher();
        // The learner is back: the state notice has done its job.
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.cancel(NOTICE_QUESTION);
            manager.cancel(NOTICE_DONE);
            manager.cancel(NOTICE_ERROR);
        }
        pushNativeVisibility("visible");
    }

    private void pushNativeVisibility(String state) {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        webView.evaluateJavascript(
                "window.lhNativeVisibility&&window.lhNativeVisibility('" + state + "')",
                null);
    }

    /** Posts one AI-state notice. The background watcher only runs while the
     *  learner is away, and the resumed guard covers a notice racing the
     *  return to foreground. */
    private void postAiNotice(String kind, String title, String text) {
        if (resumed || isFinishing() || isDestroyed()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                        != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null) return;
        boolean urgent = "question".equals(kind);
        String channelId = urgent ? CHANNEL_AI_QUESTION : CHANNEL_AI_INFO;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    channelId,
                    getString(urgent ? R.string.ai_question_channel : R.string.ai_status_channel),
                    urgent ? NotificationManager.IMPORTANCE_HIGH : NotificationManager.IMPORTANCE_DEFAULT);
            channel.setShowBadge(urgent);
            manager.createNotificationChannel(channel);
        }
        int id = urgent ? NOTICE_QUESTION
                : "error".equals(kind) ? NOTICE_ERROR : NOTICE_DONE;
        String body = text == null ? "" : text;
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(this, id, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, channelId)
                : new Notification.Builder(this);
        builder.setContentTitle(title == null || title.isEmpty() ? getString(R.string.app_name) : title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setSmallIcon(android.R.drawable.stat_notify_chat)
                .setAutoCancel(true)
                .setContentIntent(contentIntent);
        if (urgent) {
            builder.setCategory(Notification.CATEGORY_MESSAGE).setPriority(Notification.PRIORITY_HIGH);
        }
        manager.notify(id, builder.build());
        android.util.Log.i(TAG_NOTICE, "posted " + kind + " id=" + id);
    }

    /** The background watcher (owner request 2026-11-20): while the app is
     *  hidden and a turn is attached, poll the server's notice projection and
     *  turn the first learner-facing state into a notice. It lives HERE, in
     *  native code, because instrumentation showed the WebView's JS and even
     *  its injected bridge can die while backgrounded — the shell polling the
     *  loopback server is the only reliable observer. Ends on: a state, the
     *  learner returning, the turn ending, a session switch, or the 15-minute
     *  cap (a turn that long has its own problems). */
    private synchronized void startTurnWatcher() {
        final String chatId = turnChatId;
        if (chatId == null || turnWatcher != null) return;
        final long leftAt = pausedAt;
        android.util.Log.i(TAG_NOTICE, "watch start " + chatId + " leftAt=" + leftAt);
        Thread watcher = new Thread(() -> {
            long deadline = System.currentTimeMillis() + 15 * 60 * 1000L;
            // A terminal state that is NOT news may simply mean the server
            // has not seen the just-sent reply yet; let the turn claim the
            // chat before giving up.
            int quietPolls = 0;
            try {
                while (!Thread.currentThread().isInterrupted()
                        && !resumed
                        && chatId.equals(turnChatId)
                        && System.currentTimeMillis() < deadline) {
                    JSONObject notice = fetchTurnNotice(chatId);
                    String state = notice == null ? "" : notice.optString("state", "");
                    long since = notice == null ? 0L : notice.optLong("since", 0L);
                    android.util.Log.i(TAG_NOTICE, "poll " + state + " since=" + since);
                    if ("question".equals(state) || "done".equals(state) || "error".equals(state)) {
                        // A terminal state means no turn is generating: the
                        // "正在生成回答" keep-alive must not outlive it.
                        TurnKeepAliveService.stop(MainActivity.this);
                        // Only a state that BEGAN after the learner left is
                        // news; an older one they already saw. The tolerance
                        // covers "it arrived as I was leaving".
                        if (since > leftAt - NEWS_TOLERANCE_MS) {
                            postAiNotice(state, notice.optString("title", ""), notice.optString("body", ""));
                            return;
                        }
                        if (!turnActive || ++quietPolls >= 3) return;
                    }
                    try {
                        Thread.sleep(2000);
                    } catch (InterruptedException interrupted) {
                        return;
                    }
                }
            } finally {
                synchronized (MainActivity.this) {
                    if (turnWatcher == Thread.currentThread()) turnWatcher = null;
                }
                android.util.Log.i(TAG_NOTICE, "watch end " + chatId);
            }
        }, "lh-turn-watcher");
        turnWatcher = watcher;
        watcher.start();
    }

    private synchronized void stopTurnWatcher() {
        if (turnWatcher == null) return;
        turnWatcher.interrupt();
        turnWatcher = null;
    }

    /** GET /api/chats/{id}/notice — {"state":"busy|question|done|error",...}. */
    private JSONObject fetchTurnNotice(String chatId) {
        HttpURLConnection connection = null;
        try {
            URL url = new URL("http://127.0.0.1:41100/api/chats/"
                    + URLEncoder.encode(chatId, "UTF-8") + "/notice");
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(1500);
            connection.setReadTimeout(1500);
            connection.setUseCaches(false);
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) return null;
            StringBuilder body = new StringBuilder();
            try (InputStream in = connection.getInputStream();
                 BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
            }
            return new JSONObject(body.toString());
        } catch (Exception error) {
            // The loopback server may still be busy/settling; the next poll
            // retries.
            android.util.Log.w(TAG_NOTICE, "notice fetch failed: " + error);
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    /** Web overlays first (drawer, settings), then in-app history; only the
     *  root exits, like a native app. The JS check is async, so the native
     *  history/exiting decision happens in its callback. */
    private void handleBack() {
        if (isFinishing() || isDestroyed()) return;
        // The exit card owns the press while it is up: dismissing it here too
        // means a predictive-back edge case can never fall through to the
        // history/exit rungs below.
        if (exitDialog != null && exitDialog.isShowing()) {
            exitDialog.dismiss();
            return;
        }
        final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            finish();
            return;
        }
        webView.evaluateJavascript(
                "(function(){try{return window.lhHandleNativeBack&&window.lhHandleNativeBack()?'1':'0';}catch(e){return '0';}})()",
                value -> {
                    if ("\"1\"".equals(value)) return;
                    if (webView.canGoBack()) {
                        webView.goBack();
                    } else {
                        confirmExit();
                    }
                });
    }

    /** Leaving the app is a two-step decision (owner round 2026-11-20): the
     *  card is drawn by us, not the platform, and takes its colours, radius and
     *  type from the app's current theme so it does not look foreign. */
    private void confirmExit() {
        if (isFinishing() || isDestroyed()) return;
        if (exitDialog != null && exitDialog.isShowing()) return;
        Context localized = localizedContext();
        Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        dialog.setContentView(R.layout.dialog_exit);
        dialog.setCanceledOnTouchOutside(true);

        int foreground = appDark ? Color.parseColor("#e6e6e6") : Color.parseColor("#4c4f69");
        int muted = appDark ? Color.parseColor("#8d8d8d") : Color.parseColor("#6c6f85");
        int border = appDark ? Color.parseColor("#2e2e2e") : Color.parseColor("#d8dae3");
        GradientDrawable card = new GradientDrawable();
        card.setColor(appBackground);
        card.setCornerRadius(dp(20));
        card.setStroke(Math.max(1, dp(1)), border);
        dialog.findViewById(R.id.exit_card).setBackground(card);

        TextView title = dialog.findViewById(R.id.exit_title);
        TextView cancel = dialog.findViewById(R.id.exit_cancel);
        TextView confirm = dialog.findViewById(R.id.exit_confirm);
        title.setText(localized.getString(R.string.exit_title));
        cancel.setText(localized.getString(R.string.exit_cancel));
        confirm.setText(localized.getString(R.string.exit_confirm));
        title.setTextColor(foreground);
        cancel.setTextColor(muted);
        confirm.setTextColor(foreground);
        cancel.setOnClickListener(view -> dialog.dismiss());
        confirm.setOnClickListener(view -> {
            dialog.dismiss();
            finish();
        });

        exitDialog = dialog;
        dialog.show();
        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            window.setDimAmount(0.5f);
            int screenWidth = getResources().getDisplayMetrics().widthPixels;
            window.setLayout(Math.min(screenWidth - dp(56), dp(340)),
                    WindowManager.LayoutParams.WRAP_CONTENT);
        }
    }

    private Context localizedContext() {
        Configuration configuration = new Configuration(getResources().getConfiguration());
        // "zh-CN"/"zh_CN" all resolve to the same resource set.
        configuration.setLocale(new Locale(appLocale.split("[-_]")[0]));
        return createConfigurationContext(configuration);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    /** The in-app launch surface (layout/splash_overlay.xml): the app mark, the
     *  wordmark and one thin progress line, painted in the same colours as the
     *  system splash so the hand-over is invisible. */
    private void installSplash() {
        splash = (FrameLayout) getLayoutInflater().inflate(R.layout.splash_overlay, null);
        splashError = splash.findViewById(R.id.splash_error);
        addContentView(splash, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    /** The served desktop UI owns its layout: no pinch/double-tap zoom. The
     *  WebView also carries the system-bar insets (the page draws the app
     *  background behind them) and the theme bridge for bar icon contrast. */
    private void polishWebViewSettings() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        // Transparent until the web layer reports its background colour; the
        // launch window background (splash colour) fills the inset strips.
        webView.setBackgroundColor(Color.TRANSPARENT);
        webView.addJavascriptInterface(new ChromeBridge(), "LhChrome");
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        // Edge-to-edge (forced from Android 15 on): the page paints behind the
        // status and gesture bars so the app background runs to the screen
        // edge. The bars therefore cover page chrome — the web layer cannot
        // guess their size on Android — so the insets are handed over in CSS
        // pixels and the page insets its own chrome with --lh-safe-*.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {
            Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            float density = getResources().getDisplayMetrics().density;
            publishSafeArea(
                    Math.round(bars.top / density),
                    Math.round(bars.right / density),
                    Math.round(bars.bottom / density),
                    Math.round(bars.left / density));
            return insets;
        });
        ViewCompat.requestApplyInsets(content);
    }

    /** Hands the system-bar insets to the page (CSS px). The page pulls them
     *  once on mount through getSafeArea() and this pushes later changes. */
    private void publishSafeArea(int top, int right, int bottom, int left) {
        if (top == safeArea[0] && right == safeArea[1] && bottom == safeArea[2] && left == safeArea[3]) return;
        safeArea = new int[]{top, right, bottom, left};
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        webView.evaluateJavascript(
                "window.LhApplySafeArea&&window.LhApplySafeArea('" + top + "," + right + "," + bottom + "," + left + "')",
                null);
    }

    /** Called from the web appearance provider: paints the inset strips and
     *  keeps the status/navigation icons readable against that colour. */
    private final class ChromeBridge {
        /** "top,right,bottom,left" in CSS pixels — pulled by the page on mount. */
        @JavascriptInterface
        public String getSafeArea() {
            return safeArea[0] + "," + safeArea[1] + "," + safeArea[2] + "," + safeArea[3];
        }

        /** The turn context, pushed by the chat page whenever the attached
         *  session or its busy span changes: keeps the app out of the cached
         *  state while generating (foreground service), and tells the
         *  background watcher which session to poll for notices. */
        @JavascriptInterface
        public void setTurnContext(String chatId, boolean active) {
            turnChatId = chatId == null || chatId.isEmpty() ? null : chatId;
            turnActive = active;
            android.util.Log.i(TAG_NOTICE, "context " + turnChatId + " active=" + active + " resumed=" + resumed);
            if (active) {
                TurnKeepAliveService.start(MainActivity.this);
                if (!resumed) {
                    // Hidden: (re)attach the watcher to this session.
                    stopTurnWatcher();
                    startTurnWatcher();
                }
            } else {
                TurnKeepAliveService.stop(MainActivity.this);
                // While hidden the sheet stops the keep-alive but the watcher
                // must outlive the turn: the notice IS the point of it.
                if (resumed) stopTurnWatcher();
            }
        }

        @JavascriptInterface
        public void setTheme(String mode, String background) {
            boolean dark = "dark".equals(mode);
            int parsed = appBackground;
            if (background != null) {
                try {
                    parsed = Color.parseColor(background);
                } catch (IllegalArgumentException ignored) {
                    // Keep the previous colour for an unexpected value.
                }
            }
            final int backgroundForWebView = parsed;
            appDark = dark;
            appBackground = parsed;
            runOnUiThread(() -> {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null && background != null) {
                    webView.setBackgroundColor(backgroundForWebView);
                }
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
                        getWindow(), getWindow().getDecorView());
                controller.setAppearanceLightStatusBars(!dark);
                controller.setAppearanceLightNavigationBars(!dark);
            });
        }

        /** The app's UI language (a user preference, not the system locale):
         *  the exit card is the only native text that follows it. */
        @JavascriptInterface
        public void setLocale(String locale) {
            if (locale != null && !locale.isEmpty()) appLocale = locale;
        }
    }

    /** Capacitor navigates to `server.url` as soon as the bridge exists — long
     *  before node listens — so the browser paints its own error page (owner
     *  report 2026-11-20). None of that may reach the screen: the WebView
     *  starts invisible, failed main-frame loads are retried silently, and
     *  only a finished real document reveals it and dismisses the splash. */
    private void holdWebViewUntilFirstPaint() {
        Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) return;
        final WebView webView = bridge.getWebView();
        webView.setVisibility(View.INVISIBLE);
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                if (isAppUrl(url)) mainFrameFailed = false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (isAppUrl(url) && !mainFrameFailed) revealPage();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (!request.isForMainFrame() || pageRevealed) return;
                mainFrameFailed = true;
                // The pre-server navigation is expected to fail; onServerReady
                // loads the page itself. A failure after that is transient, so
                // it is retried silently instead of surfacing the error page.
                if (!serverReady) return;
                if (revealRetries++ >= MAX_REVEAL_RETRIES) {
                    // Never freeze on the splash: show what the browser has and
                    // let the learner see the real failure state.
                    revealPage();
                    return;
                }
                ui.postDelayed(() -> {
                    if (!pageRevealed && !isFinishing() && !isDestroyed()) webView.loadUrl(appUrl());
                }, REVEAL_RETRY_MS);
            }
        });
    }

    private static String appUrl() {
        return "http://127.0.0.1:" + ServerRuntime.SERVER_PORT + "/";
    }

    private static boolean isAppUrl(String url) {
        return url != null && url.startsWith("http://127.0.0.1:" + ServerRuntime.SERVER_PORT + "/");
    }

    private void revealPage() {
        if (pageRevealed || isFinishing() || isDestroyed()) return;
        pageRevealed = true;
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setVisibility(View.VISIBLE);
        }
        if (splash != null && splash.getParent() != null) {
            ((ViewGroup) splash.getParent()).removeView(splash);
        }
        splash = null;
        splashError = null;
    }

    private void onServerReady() {
        if (isFinishing() || isDestroyed()) return;
        serverReady = true;
        mainFrameFailed = false;
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().loadUrl(appUrl());
        }
    }

    private void onServerFailed() {
        if (isFinishing() || isDestroyed() || splashError == null) return;
        // The mark and the progress line would imply work is still happening.
        if (splash != null) {
            View brand = splash.findViewById(R.id.splash_brand);
            View progress = splash.findViewById(R.id.splash_progress);
            if (brand != null) brand.setVisibility(View.GONE);
            if (progress != null) progress.setVisibility(View.GONE);
        }
        splashError.setVisibility(TextView.VISIBLE);
    }
}
