package ai.learnharness.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * The phone's replacement for the desktop browser helper: a hidden 1×1
 * WebView (kept visible so the compositor produces frames —
 * requestAnimationFrame-driven demos stall in a detached view) behind a
 * minimal loopback HTTP API.
 *
 * The Node server (via LH_RENDER_SERVICE_URL, see ServerRuntime) POSTs
 * `{html, settleMs?, probe?}` and gets a DemoRunResult back — the same JSON
 * the desktop's puppeteer path produces. Semantics mirror
 * src/agent/subagents/headless.ts:
 *   - console errors        → WebChromeClient.onConsoleMessage (type error)
 *   - uncaught page errors  → an injected collector shim (window.onerror +
 *                             unhandledrejection); WebView has no CDP pageerror
 *   - failed requests       → WebViewClient.onReceivedError
 *   - probe                 → evaluateJavascript after settling; a throwing
 *                             probe becomes a page error, never a console error
 * The document loads with a null base URL, so it runs on an opaque
 * about:blank origin (model output is untrusted — same isolation as the
 * desktop's setContent-on-about:blank); file/content access is off and no
 * JS interface is exposed. Between jobs the page retires to about:blank.
 *
 * Wire contract: fixed port (ServerRuntime.RENDER_SERVICE_PORT), one job at a
 * time, one request per connection, `Connection: close` responses.
 */
public final class RenderService {
    private static final String TAG = "LH-RENDER";
    private static final String RENDER_PATH = "/render";
    private static final long MAX_SETTLE_MS = 30_000;
    private static final long PROBE_TIMEOUT_MS = 30_000;
    /** Wall-clock ceiling for the whole HTTP round trip — the socket thread
     *  must never wait forever on a wedged page. */
    private static final long JOB_AWAIT_TIMEOUT_MS = 90_000;
    private static final int MAX_BODY_BYTES = 8 * 1024 * 1024;

    private static WebView webView;
    private static ServerSocket serverSocket;
    private static Thread serverThread;
    private static JobState current;
    private static final Handler main = new Handler(Looper.getMainLooper());

    private RenderService() {}

    private static final class JobState {
        final String html;
        final long settleMs;
        final String probe;
        final CountDownLatch done = new CountDownLatch(1);
        final List<String> consoleErrors = new ArrayList<>();
        final List<String> pageErrors = new ArrayList<>();
        final List<String> failedRequests = new ArrayList<>();
        /** The parsed probe value (JSONObject/JSONArray/String/Number/Boolean/
         *  JSONObject.NULL) — null when absent or failed. */
        Object probeResult;
        boolean probePresent;
        volatile boolean finished;

        JobState(String html, long settleMs, String probe) {
            this.html = html;
            this.settleMs = settleMs;
            this.probe = probe;
        }
    }

    /** Attach the hidden renderer to the activity's window and start the HTTP
     *  loop. Safe to call from onCreate; everything lands on the right thread. */
    public static synchronized void start(Activity activity) {
        if (serverThread != null) return;
        main.post(() -> {
            if (webView != null) return;
            webView = buildWebView(activity);
            ViewGroup decor = (ViewGroup) activity.getWindow().getDecorView();
            decor.addView(webView, new ViewGroup.LayoutParams(1, 1));
        });
        serverThread = new Thread(RenderService::serveLoop, "lh-render-http");
        serverThread.start();
    }

    /** Called from the activity's onDestroy: drop the view and the socket,
     *  and fail any in-flight job so its socket thread never hangs. */
    public static synchronized void stop() {
        if (serverSocket != null) {
            try {
                serverSocket.close();
            } catch (IOException ignored) {
            }
            serverSocket = null;
        }
        Thread loop = serverThread;
        serverThread = null;
        if (loop != null) loop.interrupt();
        main.post(() -> {
            JobState job = current;
            if (job != null && !job.finished) {
                job.pageErrors.add("render service stopped");
                completeJob(job);
            }
            WebView doomed = webView;
            webView = null;
            if (doomed != null) {
                doomed.loadUrl("about:blank");
                doomed.destroy();
            }
        });
    }

    // ─── the hidden WebView ──────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private static WebView buildWebView(Activity activity) {
        WebView view = new WebView(activity);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        // Desktop-style viewport: served UI and demos control their own layout,
        // so no pinch/double-tap zoom chrome and no font-scale re-flow.
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        // Demo <video autoplay> must start without a user gesture, like the
        // desktop helper's pages.
        settings.setMediaPlaybackRequiresUserGesture(false);
        view.setBackgroundColor(Color.WHITE);
        view.loadUrl("about:blank");

        view.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                JobState job = current;
                if (job != null && !request.isForMainFrame() && !job.finished) {
                    CharSequence description = error.getDescription();
                    job.failedRequests.add(request.getUrl().toString()
                            + " (" + (description != null ? description.toString() : "failed") + ")");
                }
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                JobState job = current;
                if (job != null && !job.finished && message != null
                        && ConsoleMessage.MessageLevel.ERROR.equals(message.messageLevel())) {
                    job.consoleErrors.add(message.message() != null ? message.message() : "");
                }
                return true;
            }
        });
        return view;
    }

    /**
     * Pre-parse injection point: WebView has no CDP pageerror event, so the
     * shim must exist before the document's own scripts run. Full demo
     * documents carry <head>; degraded forms fall back to before <body> /
     * after the doctype. Standards mode is preserved (never inserted before
     * the doctype).
     */
    private static final String ERROR_SHIM =
            "<script>(function(){window.__lhErrors=window.__lhErrors||[];"
                    + "window.onerror=function(m){window.__lhErrors.push(String(m));};"
                    + "window.addEventListener('unhandledrejection',function(e){var r=e&&e.reason;"
                    + "window.__lhErrors.push('Unhandled rejection: '+(r&&r.message?r.message:String(r)));});})();</script>";

    private static String withErrorShim(String html) {
        String lowered = html.toLowerCase();
        int head = lowered.indexOf("<head");
        int insertAt;
        if (head >= 0) {
            int tagEnd = lowered.indexOf('>', head);
            insertAt = tagEnd >= 0 ? tagEnd + 1 : html.length();
        } else {
            int body = lowered.indexOf("<body");
            if (body >= 0) insertAt = body;
            else {
                int doctype = lowered.indexOf("<!doctype");
                insertAt = doctype >= 0 ? lowered.indexOf('>', doctype) + 1 : 0;
            }
        }
        return html.substring(0, insertAt) + ERROR_SHIM + html.substring(insertAt);
    }

    /** The probe runs inside try/catch so a throwing probe surfaces as a page
     *  error ("probe failed: …", desktop shape) instead of an uncaught console
     *  error, and promises resolve like puppeteer's evaluate. */
    private static String probeScript(String probe) {
        return "(async function(){try{var __v=(" + probe + ");"
                + "if(typeof __v==='function')__v=__v();__v=await __v;"
                + "return JSON.stringify({v:__v===undefined?null:__v});}"
                + "catch(__e){return JSON.stringify({e:String((__e&&__e.message)||__e)});}})()";
    }

    // ─── one render job ──────────────────────────────────────────────────────

    private static void runJob(JobState job) {
        current = job;
        main.post(() -> {
            if (webView == null) {
                job.pageErrors.add("render service: web view unavailable");
                completeJob(job);
                return;
            }
            webView.loadDataWithBaseURL(null, withErrorShim(job.html), "text/html", "utf-8", null);
            main.postDelayed(() -> {
                if (job.finished) return;
                if (job.probe == null) {
                    collectErrorsThen(job, () -> completeJob(job));
                    return;
                }
                // Hard stop: evaluateJavascript always calls back on this
                // thread, but the page could keep the renderer wedged.
                Runnable probeTimeout = () -> {
                    if (job.finished) return;
                    job.pageErrors.add("probe failed: timed out after " + PROBE_TIMEOUT_MS + " ms");
                    collectErrorsThen(job, () -> completeJob(job));
                };
                main.postDelayed(probeTimeout, PROBE_TIMEOUT_MS);
                webView.evaluateJavascript(probeScript(job.probe), raw -> {
                    main.removeCallbacks(probeTimeout);
                    if (job.finished) return;
                    applyProbe(job, raw);
                    collectErrorsThen(job, () -> completeJob(job));
                });
            }, job.settleMs);
        });
    }

    /** Pull the shim's collected errors before anything retires the page;
     *  the continuation runs on the UI thread after the result lands. */
    private static void collectErrorsThen(JobState job, Runnable next) {
        if (webView == null) {
            next.run();
            return;
        }
        webView.evaluateJavascript("JSON.stringify(window.__lhErrors||[])", raw -> {
            if (!job.finished && raw != null) mergePageErrors(job, raw);
            next.run();
        });
    }

    private static void mergePageErrors(JobState job, String raw) {
        try {
            Object parsed = new JSONTokener(raw).nextValue();
            if (parsed instanceof JSONArray) {
                JSONArray array = (JSONArray) parsed;
                for (int i = 0; i < array.length(); i++) {
                    job.pageErrors.add(array.optString(i, ""));
                }
            }
        } catch (JSONException malformed) {
            Log.w(TAG, "could not parse collected page errors", malformed);
        }
    }

    /** `raw` is the JSON text Chromium produced for our wrapper's return: a
     *  JSON string quoting an inner {"v":…} or {"e":…} envelope. */
    private static void applyProbe(JobState job, String raw) {
        if (raw == null || "null".equals(raw)) return;
        try {
            Object wrapper = new JSONTokener(raw).nextValue();
            if (!(wrapper instanceof JSONObject)) return;
            JSONObject payload = (JSONObject) wrapper;
            if (payload.has("e")) {
                job.pageErrors.add("probe failed: " + payload.optString("e"));
                return;
            }
            if (!payload.has("v")) return;
            job.probeResult = payload.get("v");
            job.probePresent = true;
        } catch (JSONException malformed) {
            Log.w(TAG, "could not parse probe result", malformed);
        }
    }

    /** Terminal state for one job: stop collecting, retire the document,
     *  release the socket thread. UI thread only. */
    private static void completeJob(JobState job) {
        if (job.finished) return;
        job.finished = true;
        current = null;
        if (webView != null) webView.loadUrl("about:blank");
        job.done.countDown();
    }

    // ─── the loopback HTTP surface ───────────────────────────────────────────

    private static void serveLoop() {
        try {
            ServerSocket socket = new ServerSocket();
            serverSocket = socket;
            // Loopback only — the render API executes arbitrary HTML.
            socket.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"),
                    ServerRuntime.RENDER_SERVICE_PORT));
            Log.i(TAG, "render service on 127.0.0.1:" + ServerRuntime.RENDER_SERVICE_PORT);
            while (!Thread.currentThread().isInterrupted() && serverSocket != null) {
                Socket connection = socket.accept();
                try {
                    handleConnection(connection);
                } catch (Exception error) {
                    Log.w(TAG, "request failed", error);
                } finally {
                    closeQuietly(connection);
                }
            }
        } catch (SocketException closed) {
            Log.i(TAG, "render service stopped");
        } catch (IOException bindFailure) {
            Log.e(TAG, "render service could not bind", bindFailure);
        }
    }

    /** One connection, one request, one job — serialized by construction: the
     *  accept loop blocks until the job's result is on the wire. */
    private static void handleConnection(Socket socket) throws IOException, InterruptedException, JSONException {
        socket.setSoTimeout(15_000);
        InputStream in = socket.getInputStream();

        String requestLine = readLine(in);
        if (requestLine == null || requestLine.isEmpty()) return;
        String[] parts = requestLine.split(" ");
        String method = parts.length > 0 ? parts[0] : "";
        String path = parts.length > 1 ? parts[1] : "";

        int contentLength = -1;
        String header;
        while ((header = readLine(in)) != null && !header.isEmpty()) {
            String lowered = header.toLowerCase();
            if (lowered.startsWith("content-length:")) {
                try {
                    contentLength = Integer.parseInt(header.substring(15).trim());
                } catch (NumberFormatException badLength) {
                    contentLength = -1;
                }
            }
        }

        if (!"POST".equals(method) || !RENDER_PATH.equals(path)) {
            respond(socket, 404, new JSONObject().put("error", "not found"));
            return;
        }
        if (contentLength < 0 || contentLength > MAX_BODY_BYTES) {
            respond(socket, 413, new JSONObject().put("error", "payload too large or unknown length"));
            return;
        }

        byte[] body = new byte[contentLength];
        int read = 0;
        while (read < contentLength) {
            int n = in.read(body, read, contentLength - read);
            if (n < 0) break;
            read += n;
        }

        JobState job;
        try {
            JSONObject request = new JSONObject(new String(body, StandardCharsets.UTF_8));
            job = new JobState(
                    request.getString("html"),
                    clampSettle(request.optLong("settleMs", 2_000)),
                    request.has("probe") ? request.getString("probe") : null);
        } catch (JSONException malformed) {
            respond(socket, 400, new JSONObject().put("error", "invalid request JSON"));
            return;
        }

        if (current != null) {
            respond(socket, 503, new JSONObject().put("error", "renderer busy"));
            return;
        }
        runJob(job);
        if (!job.done.await(JOB_AWAIT_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
            main.post(() -> {
                if (current == job && !job.finished) {
                    job.pageErrors.add("render job timed out");
                    completeJob(job);
                }
            });
            job.done.await();
        }
        respond(socket, 200, jobResult(job));
    }

    /** Byte-wise line reader over the raw socket stream — a BufferedReader
     *  here would read ahead and swallow the request body. */
    private static String readLine(InputStream in) throws IOException {
        StringBuilder line = new StringBuilder();
        int b;
        while ((b = in.read()) >= 0) {
            if (b == '\n') break;
            if (b != '\r') line.append((char) (b & 0xFF));
            if (line.length() > 16 * 1024) return null;
        }
        return line.toString();
    }

    private static long clampSettle(long settleMs) {
        if (settleMs < 0) return 0;
        return Math.min(settleMs, MAX_SETTLE_MS);
    }

    /** DemoRunResult over the wire — the shape headless.ts validates. */
    private static JSONObject jobResult(JobState job) throws JSONException {
        JSONObject result = new JSONObject();
        result.put("consoleErrors", new JSONArray(job.consoleErrors));
        result.put("pageErrors", new JSONArray(job.pageErrors));
        result.put("failedRequests", new JSONArray(job.failedRequests));
        if (job.probePresent) result.put("probeResult", job.probeResult);
        boolean ok = job.consoleErrors.isEmpty() && job.pageErrors.isEmpty() && job.failedRequests.isEmpty();
        result.put("ok", ok);
        return result;
    }

    private static void respond(Socket socket, int status, JSONObject payload) throws IOException {
        byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
        String head = "HTTP/1.1 " + status + " " + reason(status) + "\r\n"
                + "Content-Type: application/json\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Connection: close\r\n\r\n";
        OutputStream out = socket.getOutputStream();
        out.write(head.getBytes(StandardCharsets.US_ASCII));
        out.write(body);
        out.flush();
    }

    private static String reason(int status) {
        switch (status) {
            case 200: return "OK";
            case 400: return "Bad Request";
            case 404: return "Not Found";
            case 413: return "Payload Too Large";
            case 503: return "Service Unavailable";
            default: return "Error";
        }
    }

    private static void closeQuietly(Socket socket) {
        try {
            socket.close();
        } catch (IOException ignored) {
        }
    }
}
