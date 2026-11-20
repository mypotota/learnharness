package ai.learnharness.mobile;

import android.content.Context;
import android.content.pm.PackageManager;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Boots the embedded desktop server: the curated Next.js standalone tree
 * shipped as `assets/lh-server.zip`, executed by the Termux node binary that
 * Gradle packs as `liblh-node.so` in jniLibs.
 *
 * Why node lives in jniLibs: since API 29 a binary in the writable data
 * directory may not be exec()'d, so Android extracts the "library" into the
 * read-only `nativeLibraryDir`, where exec is allowed. The shared libraries
 * node links against ride inside the ZIP (`runtime/lib/`) and are found via
 * LD_LIBRARY_PATH — dlopen from the data dir stays legal.
 *
 * The WebView points at http://127.0.0.1:41100/ only once {@link #start}'s
 * `onReady` fires, so the port below and MainActivity's URL must change
 * together (see docs/mobile-android-port.md).
 */
public final class ServerRuntime {
    private static final String TAG = "LH-SERVER";
    private static final String ASSET_ZIP = "lh-server.zip";
    private static final String EXTRACT_DIR = "lh-server";
    private static final String MARKER = ".extracted";
    /** Fixed loopback port; keep in sync with MainActivity's WebView URL. */
    static final int SERVER_PORT = 41100;
    /** Port of the hidden-WebView render service (RenderService.java). */
    static final int RENDER_SERVICE_PORT = 41101;
    private static final int MAX_ATTEMPTS = 5;
    /** Per-attempt ceiling for the first answer; cold extraction happens
     *  before this clock starts, node boot itself is seconds. */
    private static final long READY_TIMEOUT_MS = 120_000;
    private static final long POLL_INTERVAL_MS = 300;
    private static final long RESTART_DELAY_MS = 2_000;
    private static final long LOG_ROTATE_BYTES = 5 * 1024 * 1024;

    private static boolean started = false;
    /** Sticky outcomes: an Activity recreated while the process lives (the
     *  back-to-launcher-then-reopen path) must still hear the verdict —
     *  otherwise its fresh splash never clears and the WebView never loads. */
    private static volatile boolean ready = false;
    private static volatile boolean failed = false;

    private ServerRuntime() {}

    /** Idempotent; extraction and boot run off the main thread. Exactly one
     *  of the callbacks fires, from the boot thread (caller re-posts to the
     *  UI thread as needed). A later caller gets the remembered verdict. */
    public static synchronized void start(Context context, Runnable onReady, Runnable onFailure) {
        if (started) {
            if (ready) onReady.run();
            else if (failed) onFailure.run();
            return;
        }
        started = true;
        Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                extractPayload(app);
            } catch (Exception error) {
                Log.e(TAG, "payload extraction failed", error);
                onFailure.run();
                return;
            }
            for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                Process process = null;
                try {
                    process = spawnServer(app);
                } catch (Exception error) {
                    Log.e(TAG, "attempt " + attempt + ": could not spawn node", error);
                }
                if (process != null && awaitReady(process)) {
                    ready = true;
                    onReady.run();
                    return;
                }
                if (process != null) {
                    Log.w(TAG, "attempt " + attempt + ": node exited with code " + process.exitValue());
                    process.destroy();
                }
                sleep(RESTART_DELAY_MS);
            }
            Log.e(TAG, "server did not come up after " + MAX_ATTEMPTS + " attempts");
            failed = true;
            onFailure.run();
        }, "lh-server-boot").start();
    }

    /** Unzip `lh-server.zip` into filesDir/lh-server whenever the APK changes.
     *  Session data (LH_DATA_DIR, the auth file) live OUTSIDE this tree and
     *  survive updates. */
    private static void extractPayload(Context context) throws IOException {
        long stamp = updateStamp(context);
        File target = new File(context.getFilesDir(), EXTRACT_DIR);
        File marker = new File(target, MARKER);
        if (target.exists() && readStamp(marker) == stamp) return;
        Log.i(TAG, "extracting server payload (update stamp " + stamp + ")");
        deleteTree(target);
        if (!target.mkdirs()) throw new IOException("mkdirs " + target);
        try (InputStream in = context.getAssets().open(ASSET_ZIP);
             ZipInputStream zip = new ZipInputStream(in)) {
            byte[] buffer = new byte[256 * 1024];
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                File out = new File(target, entry.getName());
                if (entry.isDirectory()) {
                    zip.closeEntry();
                    continue;
                }
                File parent = out.getParentFile();
                if (parent != null && !parent.exists() && !parent.mkdirs()) throw new IOException("mkdirs " + parent);
                try (OutputStream fileOut = new FileOutputStream(out)) {
                    int read;
                    while ((read = zip.read(buffer)) > 0) fileOut.write(buffer, 0, read);
                }
                zip.closeEntry();
            }
        }
        writeStamp(marker, stamp);
        Log.i(TAG, "server payload extracted");
    }

    /** `nativeLibraryDir/liblh-node.so server.js` with the browser-only env
     *  the desktop server expects. Deliberately NO LH_DESKTOP_SERVER /
     *  LH_DESKTOP_API_SECRET: the WebView must get the browser-only trust
     *  model (src/server/desktop-access.ts). */
    private static Process spawnServer(Context context) throws IOException {
        File root = new File(context.getFilesDir(), EXTRACT_DIR);
        File nodeBinary = new File(context.getApplicationInfo().nativeLibraryDir, "liblh-node.so");
        File logs = new File(context.getFilesDir(), "logs");
        if (!logs.exists() && !logs.mkdirs()) throw new IOException("mkdirs " + logs);
        File logFile = rotateLog(logs);

        // Manual log pumping (not ProcessBuilder.Redirect, which is API 26+
        // while minSdk is 24): one thread appends stdout+stderr to server.log
        // and mirrors lines into logcat so device debugging sees the server.
        ProcessBuilder builder = new ProcessBuilder(nodeBinary.getAbsolutePath(), "server.js")
                .directory(root)
                .redirectErrorStream(true);
        Map<String, String> env = builder.environment();
        env.put("NODE_ENV", "production");
        env.put("PORT", String.valueOf(SERVER_PORT));
        // Mandatory: the server defaults to 0.0.0.0 — never expose loopback data.
        env.put("HOSTNAME", "127.0.0.1");
        env.put("LH_DATA_DIR", new File(context.getFilesDir(), "data").getAbsolutePath());
        env.put("LH_AUTH_FILE", new File(context.getFilesDir(), "auth.json").getAbsolutePath());
        env.put("LD_LIBRARY_PATH", new File(root, "runtime/lib").getAbsolutePath());
        // Termux node's OpenSSL has no trust store on Android (no /etc/ssl/
        // certs), so every HTTPS provider call failed with
        // SELF_SIGNED_CERT_IN_CHAIN — surfaced in the UI as "Connection
        // error". The Mozilla bundle ships with the payload (see
        // prepare-mobile-runtime.mjs) and this points node at it.
        File caBundle = new File(root, "runtime/etc/tls/cert.pem");
        if (caBundle.isFile()) env.put("NODE_EXTRA_CA_CERTS", caBundle.getAbsolutePath());
        // P3 seam: run_demo verification is served by the hidden-WebView
        // renderer (RenderService.java). Fixed port; changes together with it.
        env.put("LH_RENDER_SERVICE_URL", "http://127.0.0.1:" + RENDER_SERVICE_PORT + "/render");
        env.put("NEXT_TELEMETRY_DISABLED", "1");
        env.put("HOME", context.getFilesDir().getAbsolutePath());
        File cache = context.getCacheDir();
        env.put("TMPDIR", cache.getAbsolutePath());
        env.put("TMP", cache.getAbsolutePath());
        env.put("TEMP", cache.getAbsolutePath());
        env.put("PATH", "/system/bin");
        Process process = builder.start();
        Thread pump = new Thread(() -> pumpOutput(process, logFile), "lh-server-log");
        pump.setDaemon(true);
        pump.start();
        return process;
    }

    private static void pumpOutput(Process process, File logFile) {
        try (InputStream in = process.getInputStream();
             OutputStream out = new FileOutputStream(logFile, true)) {
            byte[] buffer = new byte[8192];
            ByteArrayOutputStream pending = new ByteArrayOutputStream();
            int read;
            while ((read = in.read(buffer)) > 0) {
                out.write(buffer, 0, read);
                for (int i = 0; i < read; i++) {
                    byte b = buffer[i];
                    if (b == '\n') {
                        Log.i(TAG, pending.toString().trim());
                        pending.reset();
                    } else {
                        pending.write(b);
                    }
                }
            }
            out.flush();
        } catch (IOException error) {
            Log.w(TAG, "server log pump failed", error);
        }
    }

    /** Poll the loopback root until the server answers or the attempt budget
     *  runs out; also bails out early when node itself dies. */
    private static boolean awaitReady(Process process) {
        long deadline = System.currentTimeMillis() + READY_TIMEOUT_MS;
        while (System.currentTimeMillis() < deadline) {
            if (process.isAlive()) {
                if (httpAnswers()) return true;
                sleep(POLL_INTERVAL_MS);
            } else {
                return false;
            }
        }
        return false;
    }

    /** A listening port is NOT enough: the WebView then navigates to a socket
     *  that cannot serve the document yet, and the browser paints its error
     *  page (owner report 2026-11-20). Wait for an actual HTTP status line. */
    private static boolean httpAnswers() {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", SERVER_PORT), 500);
            socket.setSoTimeout(2000);
            OutputStream out = socket.getOutputStream();
            out.write(("GET / HTTP/1.1\r\nHost: 127.0.0.1:" + SERVER_PORT
                    + "\r\nConnection: close\r\n\r\n").getBytes("US-ASCII"));
            out.flush();
            byte[] buffer = new byte[32];
            int read = socket.getInputStream().read(buffer);
            return read > 0 && new String(buffer, 0, read, "US-ASCII").startsWith("HTTP/");
        } catch (IOException notYet) {
            return false;
        }
    }

    private static File rotateLog(File logs) {
        File logFile = new File(logs, "server.log");
        if (logFile.length() > LOG_ROTATE_BYTES) {
            File old = new File(logs, "server.1.log");
            //noinspection ResultOfMethodCallIgnored
            old.delete();
            //noinspection ResultOfMethodCallIgnored
            logFile.renameTo(old);
        }
        return logFile;
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private static long updateStamp(Context context) {
        try {
            return context.getPackageManager().getPackageInfo(context.getPackageName(), 0).lastUpdateTime;
        } catch (PackageManager.NameNotFoundException error) {
            return 0;
        }
    }

    private static long readStamp(File marker) {
        try (InputStream in = new FileInputStream(marker)) {
            byte[] buffer = new byte[32];
            int read = in.read(buffer);
            return read > 0 ? Long.parseLong(new String(buffer, 0, read).trim()) : -1;
        } catch (Exception error) {
            return -1;
        }
    }

    private static void writeStamp(File marker, long stamp) {
        try (OutputStream out = new FileOutputStream(marker)) {
            out.write(Long.toString(stamp).getBytes());
        } catch (IOException error) {
            Log.w(TAG, "could not write extraction marker", error);
        }
    }

    private static void deleteTree(File target) {
        File[] children = target.listFiles();
        if (children != null) for (File child : children) deleteTree(child);
        //noinspection ResultOfMethodCallIgnored
        target.delete();
    }
}
