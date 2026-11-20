package ai.learnharness.mobile;

import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * The window onto the loopback desktop server. The Capacitor WebView exists
 * from the start but stays behind a splash overlay until ServerRuntime
 * reports the Node server answering on 127.0.0.1:41100 — no error-page flash,
 * the launch splash simply hands over to the app. External links, file
 * choosing and getUserMedia prompts are Capacitor built-ins driven by the
 * server.allowNavigation config.
 */
public class MainActivity extends BridgeActivity {
    private FrameLayout splash;
    private TextView splashError;
    /** System-bar / cutout insets in CSS pixels: top, right, bottom, left. */
    private int[] safeArea = new int[]{0, 0, 0, 0};

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalProxyPlugin.class);
        registerPlugin(SecureStorePlugin.class);
        super.onCreate(savedInstanceState);
        setTheme(R.style.AppTheme_NoActionBar);

        installSplash();
        polishWebViewSettings();
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
        pushNativeVisibility("hidden");
    }

    @Override
    public void onResume() {
        super.onResume();
        pushNativeVisibility("visible");
    }

    private void pushNativeVisibility(String state) {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        webView.evaluateJavascript(
                "window.lhNativeVisibility&&window.lhNativeVisibility('" + state + "')",
                null);
    }

    /** Web overlays first (drawer, settings), then in-app history; only the
     *  root exits, like a native app. The JS check is async, so the native
     *  history/exiting decision happens in its callback. */
    private void handleBack() {
        if (isFinishing() || isDestroyed()) return;
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
                        finish();
                    }
                });
    }

    /** Full-screen overlay matching the launch theme's window background. */
    private void installSplash() {
        splash = new FrameLayout(this);
        splash.setBackgroundResource(R.drawable.splash);
        splashError = new TextView(this);
        splashError.setText(R.string.startup_failure);
        splashError.setTextColor(Color.WHITE);
        splashError.setGravity(Gravity.CENTER);
        splashError.setVisibility(TextView.GONE);
        FrameLayout.LayoutParams errorLayout = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        errorLayout.gravity = Gravity.CENTER;
        splash.addView(splashError, errorLayout);
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

        /** The turn keep-alive toggle: the web layer calls this whenever the
         *  busy span starts or ends, holding the app out of the cached state
         *  so the embedded server's upstream LLM socket survives a
         *  background stretch (owner bug 2026-11-20). */
        @JavascriptInterface
        public void setTurnActive(boolean active) {
            if (active) {
                TurnKeepAliveService.start(MainActivity.this);
            } else {
                TurnKeepAliveService.stop(MainActivity.this);
            }
        }

        @JavascriptInterface
        public void setTheme(String mode, String background) {
            runOnUiThread(() -> {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null && background != null) {
                    try {
                        webView.setBackgroundColor(Color.parseColor(background));
                    } catch (IllegalArgumentException ignored) {
                        // Keep the previous colour for an unexpected value.
                    }
                }
                boolean dark = "dark".equals(mode);
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
                        getWindow(), getWindow().getDecorView());
                controller.setAppearanceLightStatusBars(!dark);
                controller.setAppearanceLightNavigationBars(!dark);
            });
        }
    }

    private void onServerReady() {
        if (isFinishing() || isDestroyed()) return;
        if (splash != null && splash.getParent() != null) {
            ViewGroup root = (ViewGroup) splash.getParent();
            root.removeView(splash);
            splash = null;
            splashError = null;
        }
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().loadUrl("http://127.0.0.1:" + ServerRuntime.SERVER_PORT + "/");
        }
    }

    private void onServerFailed() {
        if (isFinishing() || isDestroyed() || splashError == null) return;
        splashError.setVisibility(TextView.VISIBLE);
    }
}
