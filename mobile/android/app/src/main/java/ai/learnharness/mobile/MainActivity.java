package ai.learnharness.mobile;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

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
    /** Created only on API 33+ — an inlined field initializer would touch an
     *  API-33 class on every constructor path and crash below Tiramisu. */
    private OnBackInvokedCallback backCallback;

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

        // Predictive back (API 33+, with the manifest flag) routes through the
        // dispatcher; older versions keep the onBackPressed override below.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            backCallback = () -> handleBack();
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
    }

    @Override
    public void onBackPressed() {
        handleBack();
    }

    @Override
    public void onDestroy() {
        RenderService.stop();
        if (backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        }
        super.onDestroy();
    }

    /** In-app history first; only the root exits, like a native app. */
    private void handleBack() {
        if (isFinishing() || isDestroyed()) return;
        if (getBridge() != null && getBridge().getWebView() != null
                && getBridge().getWebView().canGoBack()) {
            getBridge().getWebView().goBack();
        } else {
            finish();
        }
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

    /** The served desktop UI owns its layout: no pinch/double-tap zoom. */
    private void polishWebViewSettings() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebSettings settings = getBridge().getWebView().getSettings();
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
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
