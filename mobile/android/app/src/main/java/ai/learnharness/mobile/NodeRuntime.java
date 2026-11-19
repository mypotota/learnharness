package ai.learnharness.mobile;

import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Boots the embedded Node.js runtime that hosts plugins and background jobs.
 *
 * The JS project (runtime + bundled plugin packages) is copied out of the APK
 * assets whenever the app is updated, then `node::Start` runs it on a
 * dedicated thread. The Node process listens on loopback only; the WebView
 * reaches it through the existing LocalProxy.
 */
public final class NodeRuntime {
    private static final String TAG = "LH-NODE";
    private static final String ASSET_ROOT = "nodejs-project";
    private static final String MARKER = ".extracted";
    private static boolean started = false;

    static {
        System.loadLibrary("lh_node");
    }

    private NodeRuntime() {}

    /** Idempotent; extraction and boot run off the main thread. */
    public static synchronized void start(Context context) {
        if (started) return;
        started = true;
        Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                File project = new File(app.getFilesDir(), ASSET_ROOT);
                long stamp = updateStamp(app);
                File marker = new File(project, MARKER);
                if (!project.exists() || readStamp(marker) != stamp) {
                    deleteTree(project);
                    copyAssets(app.getAssets(), ASSET_ROOT, project);
                    writeStamp(marker, stamp);
                }
                File data = new File(app.getFilesDir(), "lh-node");
                if (!data.exists() && !data.mkdirs()) Log.w(TAG, "could not create " + data);
                File script = new File(project, "main.js");
                startNode(new String[] { script.getAbsolutePath(), data.getAbsolutePath() }, project.getAbsolutePath());
            } catch (Exception error) {
                Log.e(TAG, "node runtime failed to start", error);
            }
        }, "lh-node-boot").start();
    }

    private static long updateStamp(Context context) {
        try {
            return context.getPackageManager().getPackageInfo(context.getPackageName(), 0).lastUpdateTime;
        } catch (PackageManager.NameNotFoundException error) {
            return 0;
        }
    }

    private static long readStamp(File marker) {
        try (InputStream in = new java.io.FileInputStream(marker)) {
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

    private static native void startNode(String[] args, String cwd);

    private static void copyAssets(AssetManager assets, String path, File target) throws IOException {
        String[] children = assets.list(path);
        if (children == null) return;
        if (children.length == 0) {
            copyFile(assets, path, target);
            return;
        }
        if (!target.exists() && !target.mkdirs()) throw new IOException("mkdirs " + target);
        for (String child : children) copyAssets(assets, path + "/" + child, new File(target, child));
    }

    private static void copyFile(AssetManager assets, String path, File target) throws IOException {
        try (InputStream in = assets.open(path); OutputStream out = new FileOutputStream(target)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
        }
    }
}
