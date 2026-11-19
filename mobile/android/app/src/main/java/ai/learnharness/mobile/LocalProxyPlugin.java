package ai.learnharness.mobile;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Loopback HTTP proxy for model-provider calls.
 *
 * The WebView cannot reach provider APIs directly: most of them omit CORS
 * headers, so the browser blocks the request before a byte streams. This
 * plugin binds an HTTP/1.1 server to 127.0.0.1 on a random port, authorises
 * every request with a per-launch token, forwards it upstream with
 * HttpURLConnection, and streams the response back chunk-by-chunk. The JS
 * layer rewrites provider fetches to this server, so pi-ai's own streaming
 * parsers stay untouched.
 */
@CapacitorPlugin(name = "LocalProxy")
public class LocalProxyPlugin extends Plugin {
    private static final String TAG = "LH-LocalProxy";
    private static final int MAX_HEADER_BYTES = 64 * 1024;
    private static final int MAX_BODY_BYTES = 32 * 1024 * 1024;

    private ServerSocket serverSocket;
    private int port;
    private String token;
    private ExecutorService workers;

    @PluginMethod
    public void start(PluginCall call) {
        try {
            synchronized (this) {
                if (serverSocket == null || serverSocket.isClosed()) {
                    token = randomToken();
                    serverSocket = new ServerSocket();
                    serverSocket.setReuseAddress(true);
                    serverSocket.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0));
                    port = serverSocket.getLocalPort();
                    workers = Executors.newCachedThreadPool();
                    final ServerSocket listening = serverSocket;
                    final ExecutorService pool = workers;
                    Thread accept = new Thread(() -> acceptLoop(listening, pool), "lh-local-proxy-accept");
                    accept.setDaemon(true);
                    accept.start();
                    Log.i(TAG, "listening on 127.0.0.1:" + port);
                }
                JSObject result = new JSObject();
                result.put("port", port);
                result.put("token", token);
                call.resolve(result);
            }
        } catch (Exception error) {
            call.reject("Unable to start the local proxy: " + error.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        shutdown();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        shutdown();
        super.handleOnDestroy();
    }

    private synchronized void shutdown() {
        if (serverSocket != null) {
            try {
                serverSocket.close();
            } catch (IOException ignored) {
                // Closing an already-closed listener is not an error.
            }
            serverSocket = null;
        }
        if (workers != null) {
            workers.shutdownNow();
            workers = null;
        }
    }

    private static String randomToken() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) out.append(String.format(Locale.US, "%02x", value));
        return out.toString();
    }

    private void acceptLoop(ServerSocket listening, ExecutorService pool) {
        while (!listening.isClosed()) {
            try {
                Socket client = listening.accept();
                pool.execute(() -> handleClient(client));
            } catch (IOException error) {
                if (!listening.isClosed()) Log.w(TAG, "accept failed", error);
            }
        }
    }

    private void handleClient(Socket client) {
        try (Socket socket = client) {
            socket.setSoTimeout(30_000);
            InputStream in = socket.getInputStream();
            OutputStream out = new BufferedOutputStream(socket.getOutputStream());

            String requestLine = readLine(in);
            if (requestLine == null || requestLine.isEmpty()) return;
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) {
                writeText(out, 400, "Bad request");
                return;
            }
            String method = parts[0].toUpperCase(Locale.US);
            String path = parts[1];
            Log.d(TAG, method + " " + path);

            Map<String, String> headers = new LinkedHashMap<>();
            while (true) {
                String line = readLine(in);
                if (line == null) return;
                if (line.isEmpty()) break;
                int colon = line.indexOf(':');
                if (colon <= 0) continue;
                headers.put(line.substring(0, colon).trim().toLowerCase(Locale.US), line.substring(colon + 1).trim());
            }

            if ("OPTIONS".equals(method)) {
                writePreflight(out, headers.get("access-control-request-headers"));
                return;
            }

            String presented = headers.get("x-lh-proxy-token");
            if (presented == null || !presented.equals(token)) {
                writeText(out, 401, "Unauthorized");
                return;
            }

            if (path.startsWith("/health")) {
                writeJson(out, 200, "{\"ok\":true}");
                return;
            }

            String target = targetFrom(path);
            if (target == null) {
                writeText(out, 400, "Missing url parameter");
                return;
            }
            URL targetUrl;
            try {
                targetUrl = new URL(target);
            } catch (Exception error) {
                writeText(out, 400, "Invalid url parameter");
                return;
            }
            String scheme = targetUrl.getProtocol();
            if (!"https".equals(scheme) && !"http".equals(scheme)) {
                writeText(out, 400, "Unsupported url scheme");
                return;
            }

            byte[] body = readBody(in, headers);
            Log.d(TAG, "body bytes=" + body.length);
            forward(method, targetUrl, headers, body, out);
        } catch (IOException error) {
            Log.d(TAG, "client closed: " + error.getMessage());
        } catch (Exception error) {
            Log.w(TAG, "proxy failure", error);
        }
    }

    private static String targetFrom(String path) {
        int question = path.indexOf('?');
        if (question < 0) return null;
        String query = path.substring(question + 1);
        for (String pair : query.split("&")) {
            int equals = pair.indexOf('=');
            if (equals <= 0) continue;
            if (!"url".equals(pair.substring(0, equals))) continue;
            try {
                return URLDecoder.decode(pair.substring(equals + 1), "UTF-8");
            } catch (Exception ignored) {
                return null;
            }
        }
        return null;
    }

    private static byte[] readBody(InputStream in, Map<String, String> headers) throws IOException {
        String transferEncoding = headers.get("transfer-encoding");
        if (transferEncoding != null && transferEncoding.toLowerCase(Locale.US).contains("chunked")) {
            return readChunkedBody(in);
        }
        String length = headers.get("content-length");
        if (length == null) return new byte[0];
        int size;
        try {
            size = Integer.parseInt(length);
        } catch (NumberFormatException error) {
            return new byte[0];
        }
        if (size <= 0 || size > MAX_BODY_BYTES) return new byte[0];
        return readExactly(in, size);
    }

    /** Chrome's fetch streams unknown-length bodies as chunked; the upstream
     *  side gets a fixed-length copy, which also lets us bound the size. */
    private static byte[] readChunkedBody(InputStream in) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        while (true) {
            String line = readLine(in);
            if (line == null) break;
            int semicolon = line.indexOf(';');
            String hex = (semicolon >= 0 ? line.substring(0, semicolon) : line).trim();
            int size;
            try {
                size = Integer.parseInt(hex, 16);
            } catch (NumberFormatException error) {
                break;
            }
            if (size == 0) {
                // Consume trailers (usually none) so the connection stays sane.
                while (true) {
                    String trailer = readLine(in);
                    if (trailer == null || trailer.isEmpty()) break;
                }
                break;
            }
            if (size < 0 || buffer.size() + size > MAX_BODY_BYTES) break;
            byte[] chunk = readExactly(in, size);
            buffer.write(chunk, 0, chunk.length);
            readLine(in);
        }
        return buffer.toByteArray();
    }

    private static byte[] readExactly(InputStream in, int size) throws IOException {
        byte[] body = new byte[size];
        int read = 0;
        while (read < size) {
            int count = in.read(body, read, size - read);
            if (count < 0) break;
            read += count;
        }
        if (read == size) return body;
        byte[] shorter = new byte[read];
        System.arraycopy(body, 0, shorter, 0, read);
        return shorter;
    }

    private void forward(String method, URL targetUrl, Map<String, String> headers, byte[] body, OutputStream out) throws IOException {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) targetUrl.openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(30_000);
            connection.setReadTimeout(0);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);

            for (Map.Entry<String, String> header : headers.entrySet()) {
                String name = header.getKey();
                if (skipHeader(name)) continue;
                connection.setRequestProperty(name, header.getValue());
            }
            connection.setRequestProperty("Accept-Encoding", "identity");
            Log.d(TAG, "forwarding headers=" + headers.keySet());

            if (body.length > 0) {
                connection.setDoOutput(true);
                connection.setFixedLengthStreamingMode(body.length);
                try (OutputStream upstream = connection.getOutputStream()) {
                    upstream.write(body);
                }
                Log.d(TAG, "wrote request body");
            }

            Log.d(TAG, "awaiting upstream headers");
            int status = connection.getResponseCode();
            Log.d(TAG, "upstream " + targetUrl.getHost() + " -> " + status);
            String contentType = connection.getContentType();
            String contentEncoding = connection.getContentEncoding();

            StringBuilder head = new StringBuilder();
            head.append("HTTP/1.1 ").append(status).append(' ').append(reason(status)).append("\r\n");
            if (contentType != null) head.append("Content-Type: ").append(contentType).append("\r\n");
            if (contentEncoding != null) head.append("Content-Encoding: ").append(contentEncoding).append("\r\n");
            head.append("Access-Control-Allow-Origin: *\r\n");
            head.append("Access-Control-Expose-Headers: *\r\n");
            head.append("Cache-Control: no-cache\r\n");
            head.append("Connection: close\r\n");
            boolean hasBody = !"HEAD".equals(method) && status != 204 && status != 304;
            if (hasBody) {
                head.append("Transfer-Encoding: chunked\r\n");
            } else {
                head.append("Content-Length: 0\r\n");
            }
            head.append("\r\n");
            out.write(head.toString().getBytes(StandardCharsets.ISO_8859_1));
            out.flush();

            if (!hasBody) return;

            InputStream upstream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (upstream == null) {
                out.write("0\r\n\r\n".getBytes(StandardCharsets.ISO_8859_1));
                out.flush();
                return;
            }
            try (InputStream stream = upstream) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = stream.read(buffer)) >= 0) {
                    if (count == 0) continue;
                    out.write((Integer.toHexString(count) + "\r\n").getBytes(StandardCharsets.ISO_8859_1));
                    out.write(buffer, 0, count);
                    out.write("\r\n".getBytes(StandardCharsets.ISO_8859_1));
                    out.flush();
                }
            }
            out.write("0\r\n\r\n".getBytes(StandardCharsets.ISO_8859_1));
            out.flush();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static boolean skipHeader(String name) {
        switch (name) {
            case "host":
            case "connection":
            case "content-length":
            case "transfer-encoding":
            case "accept-encoding":
            case "origin":
            case "referer":
            case "x-lh-proxy-token":
            case "sec-fetch-mode":
            case "sec-fetch-site":
            case "sec-fetch-dest":
                return true;
            default:
                return name.startsWith("sec-ch-") || name.startsWith("proxy-");
        }
    }

    private static void writePreflight(OutputStream out, String requestedHeaders) throws IOException {
        StringBuilder head = new StringBuilder();
        head.append("HTTP/1.1 204 No Content\r\n");
        head.append("Access-Control-Allow-Origin: *\r\n");
        head.append("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS\r\n");
        head.append("Access-Control-Allow-Headers: ").append(requestedHeaders == null ? "*" : requestedHeaders).append("\r\n");
        head.append("Access-Control-Max-Age: 86400\r\n");
        head.append("Access-Control-Allow-Private-Network: true\r\n");
        head.append("Content-Length: 0\r\n");
        head.append("Connection: close\r\n\r\n");
        out.write(head.toString().getBytes(StandardCharsets.ISO_8859_1));
        out.flush();
    }

    private static void writeText(OutputStream out, int status, String message) throws IOException {
        writeJson(out, status, "{\"error\":\"" + message.replace("\"", "'") + "\"}");
    }

    private static void writeJson(OutputStream out, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        String head = "HTTP/1.1 " + status + " " + reason(status) + "\r\n"
                + "Content-Type: application/json\r\n"
                + "Access-Control-Allow-Origin: *\r\n"
                + "Content-Length: " + bytes.length + "\r\n"
                + "Connection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.ISO_8859_1));
        out.write(bytes);
        out.flush();
    }

    private static String reason(int status) {
        switch (status) {
            case 200: return "OK";
            case 201: return "Created";
            case 204: return "No Content";
            case 400: return "Bad Request";
            case 401: return "Unauthorized";
            case 403: return "Forbidden";
            case 404: return "Not Found";
            case 429: return "Too Many Requests";
            case 500: return "Internal Server Error";
            case 502: return "Bad Gateway";
            default: return "Response";
        }
    }

    /** Reads one ISO-8859-1 line without buffering past the line ending. */
    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        int value;
        int total = 0;
        while ((value = in.read()) >= 0) {
            if (++total > MAX_HEADER_BYTES) throw new IOException("header too large");
            if (value == '\n') break;
            if (value != '\r') line.write(value);
        }
        if (value < 0 && total == 0) return null;
        return line.toString("ISO-8859-1");
    }
}
