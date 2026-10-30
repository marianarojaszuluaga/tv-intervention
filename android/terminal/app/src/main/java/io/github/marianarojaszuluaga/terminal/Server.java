package io.github.marianarojaszuluaga.terminal;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.text.SimpleDateFormat;
import java.util.Base64;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Timer;
import java.util.TimerTask;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The phone's server, the same HTTP API as the webOS service (service/service.js), so the same telefono.html works on
 * both: the control page, settings, the live pad (Server-Sent Events), saved drawings, the app list and a few remote
 * commands. Answers the home network only (private addresses). Plain Java so it is tested on the JVM; the activity
 * supplies what needs Android through {@link Host}.
 */
final class Server {
    static final int PORT = 8765;
    /** What this platform can do; the phone hides the rest (no arrows, no power off, no inputs on Android TV). */
    static final String[] CAN = {"volume", "apps", "home", "pad", "notes", "settings"};
    private static final int MAX_BODY = 6_000_000;
    private static final Pattern APP_ICON = Pattern.compile("^/appicon/([A-Za-z0-9._]{1,200})\\.png$");
    private static final Pattern NOTE = Pattern.compile("^/notas/(\\d{1,20}\\.png)$");

    interface Host {
        /** A file from assets/www, or null. */
        byte[] asset(String name);
        /** {"apps": [{id, title, icon}], "inputs": []}; {@code base} is "http://host:port" for icon links. */
        JSONObject apps(String base) throws JSONException;
        byte[] appIcon(String pkg);
        /** Runs a remote command; null when done, otherwise the reason it can't be done here. */
        String remote(JSONObject command);
        /** This TV's address on the home network, or null. */
        String ip();
        void onConfig(JSONObject config);
        void onOps(JSONArray ops);
    }

    private final Host host;
    private final File notesDir, notesFile, configFile;
    private final Live live;
    private final List<OutputStream> streams = new CopyOnWriteArrayList<>();
    private JSONObject config;
    private ServerSocket socket;
    private ExecutorService pool;
    private Timer beat;

    /** {@code live} outlives the server: the drawing is still there when the screen opens again. */
    Server(Host host, File dir, Live live) {
        this.host = host;
        this.live = live;
        notesDir = new File(dir, "notas");
        notesFile = new File(dir, "notas.json");
        configFile = new File(dir, "config.json");
        //noinspection ResultOfMethodCallIgnored
        notesDir.mkdirs();
        JSONObject saved = null;
        try {
            saved = new JSONObject(read(configFile));
        } catch (IOException | JSONException ignored) {
            // First start, or an unreadable file: the defaults.
        }
        config = Settings.merge(Settings.defaults(), saved);
    }

    synchronized JSONObject config() {
        return Settings.merge(config, null);
    }

    JSONObject liveState() {
        return live.state();
    }

    long lastDraw() {
        return live.lastDraw();
    }

    void start(int port) throws IOException {
        socket = new ServerSocket();
        socket.setReuseAddress(true);
        socket.bind(new InetSocketAddress(port));
        pool = Executors.newCachedThreadPool();
        pool.execute(this::acceptLoop);
        beat = new Timer("terminal-sse", true);
        beat.schedule(new TimerTask() {
            @Override public void run() {
                write(": latido\n\n");
            }
        }, 15_000, 15_000);
    }

    int port() {
        return socket.getLocalPort();
    }

    void stop() {
        if (beat != null) beat.cancel();
        try {
            if (socket != null) socket.close();
        } catch (IOException ignored) {
            // Closing anyway.
        }
        for (OutputStream s : streams) closeQuietly(s);
        streams.clear();
        if (pool != null) pool.shutdownNow();
    }

    private void acceptLoop() {
        while (!socket.isClosed()) {
            try {
                Socket s = socket.accept();
                pool.execute(() -> handle(s));
            } catch (IOException e) {
                return;
            } catch (java.util.concurrent.RejectedExecutionException e) {
                return;
            }
        }
    }

    // ---------- HTTP ----------

    static final class Request {
        String method, path;
        final Map<String, String> headers = new HashMap<>();
        byte[] body = new byte[0];
        boolean tooBig;
    }

    private void handle(Socket s) {
        try {
            s.setSoTimeout(15_000);
            InputStream in = new BufferedInputStream(s.getInputStream());
            OutputStream out = new BufferedOutputStream(s.getOutputStream());
            Request r = read(in);
            if (r == null) return;
            if (!isLocal(s.getInetAddress())) {
                send(out, 403, error("solo red local"));
                return;
            }
            if (r.tooBig) {
                send(out, 413, error("demasiado grande"));
                return;
            }
            if (r.method.equals("GET") && r.path.equals("/api/live/stream")) {
                stream(s, in, out);
                return;
            }
            route(r, out);
        } catch (IOException | RuntimeException ignored) {
            // A dropped connection or a bad request: nothing to answer.
        } finally {
            if (!s.isClosed()) closeQuietly(s);
        }
    }

    static Request read(InputStream in) throws IOException {
        String line = readLine(in);
        if (line == null || line.isEmpty()) return null;
        String[] p = line.split(" ");
        if (p.length < 2) return null;
        Request r = new Request();
        r.method = p[0];
        r.path = p[1].split("\\?", 2)[0];
        for (String h; (h = readLine(in)) != null && !h.isEmpty(); ) {
            int i = h.indexOf(':');
            if (i > 0) r.headers.put(h.substring(0, i).trim().toLowerCase(Locale.ROOT), h.substring(i + 1).trim());
            if (r.headers.size() > 100) return null;
        }
        int n;
        try {
            n = Integer.parseInt(r.headers.getOrDefault("content-length", "0"));
        } catch (NumberFormatException e) {
            return null;
        }
        if (n < 0) return null;
        if (n > MAX_BODY) {
            r.tooBig = true;
            return r;
        }
        byte[] body = new byte[n];
        for (int off = 0; off < n; ) {
            int k = in.read(body, off, n - off);
            if (k < 0) return null;
            off += k;
        }
        r.body = body;
        return r;
    }

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        for (int c; (c = in.read()) != -1; ) {
            if (c == '\n') break;
            if (b.size() > 8192) return null;
            b.write(c);
        }
        if (b.size() == 0) return "";
        String s = b.toString("ISO-8859-1");
        return s.endsWith("\r") ? s.substring(0, s.length() - 1) : s;
    }

    /** Loopback or a private address (10/8, 172.16/12, 192.168/16): the home network, as on webOS. */
    static boolean isLocal(InetAddress a) {
        return a.isLoopbackAddress() || a.isSiteLocalAddress();
    }

    private void route(Request r, OutputStream out) throws IOException {
        String path = r.path;
        if (r.method.equals("OPTIONS")) {
            send(out, 204, new byte[0], "text/plain");
            return;
        }
        if (r.method.equals("GET")) {
            switch (path) {
                case "/": asset(out, "computador.html", "text/html; charset=utf-8"); return;
                case "/control": asset(out, "telefono.html", "text/html; charset=utf-8"); return;
                case "/icon.png": asset(out, "icon-180.png", "image/png"); return;
                case "/manifest.webmanifest": send(out, 200, manifest().toString().getBytes(StandardCharsets.UTF_8), "application/manifest+json"); return;
                case "/api/health": send(out, 200, health()); return;
                case "/api/notes": send(out, 200, obj("notes", notes())); return;
                case "/api/config": send(out, 200, info()); return;
                case "/api/tv/apps":
                    try {
                        send(out, 200, host.apps("http://" + r.headers.getOrDefault("host", "127.0.0.1:" + PORT)));
                    } catch (JSONException e) {
                        send(out, 500, error("no pude leer las apps"));
                    }
                    return;
                default:
                    break;
            }
            Matcher m = APP_ICON.matcher(path);
            if (m.matches()) {
                byte[] png = host.appIcon(m.group(1));
                if (png == null) send(out, 404, error("sin ícono"));
                else send(out, 200, png, "image/png");
                return;
            }
            m = NOTE.matcher(path);
            if (m.matches()) {
                File f = new File(notesDir, m.group(1));
                if (f.isFile()) send(out, 200, Files.readAllBytes(f.toPath()), "image/png");
                else send(out, 404, error("no existe"));
                return;
            }
            send(out, 404, error("no existe"));
            return;
        }
        if (!r.method.equals("POST")) {
            send(out, 405, error("método no permitido"));
            return;
        }
        JSONObject data;
        try {
            data = new JSONObject(r.body.length == 0 ? "{}" : new String(r.body, StandardCharsets.UTF_8));
        } catch (JSONException e) {
            send(out, 400, error("petición inválida"));
            return;
        }
        switch (path) {
            case "/api/live": {
                JSONArray ops = data.optJSONArray("ops");
                if (ops == null) {
                    send(out, 400, error("petición inválida"));
                    return;
                }
                JSONArray applied = live.apply(ops);
                if (applied.length() > 0) broadcast(applied);
                send(out, 200, ok());
                return;
            }
            case "/api/config": {
                JSONObject c;
                synchronized (this) {
                    config = Settings.merge(config, data);
                    c = config();
                }
                try {
                    write(configFile, c.toString(2).getBytes(StandardCharsets.UTF_8));
                } catch (IOException | JSONException e) {
                    send(out, 500, error("No pude guardar: " + e.getMessage()));
                    return;
                }
                host.onConfig(c);
                broadcast(new JSONArray().put(obj("t", "config", "config", c)));
                send(out, 200, info());
                return;
            }
            case "/api/notes": {
                String image = data.optString("image", "");
                String text = Settings.clean(data.optString("text", ""), 2000);
                String prefix = "data:image/png;base64,";
                if (text.isEmpty() && !image.startsWith(prefix)) {
                    send(out, 400, error("nota vacía"));
                    return;
                }
                JSONObject note = obj("text", text, "time", stamp(new Date()));
                if (image.startsWith(prefix)) {
                    byte[] png;
                    try {
                        png = Base64.getDecoder().decode(image.substring(prefix.length()));
                    } catch (IllegalArgumentException e) {
                        send(out, 400, error("imagen inválida"));
                        return;
                    }
                    String name = System.currentTimeMillis() + ".png";
                    write(new File(notesDir, name), png);
                    put(note, "image", "/notas/" + name);
                }
                synchronized (this) {
                    JSONArray notes = notes();
                    notes.put(note);
                    while (notes.length() > 300) notes.remove(0);
                    write(notesFile, notes.toString().getBytes(StandardCharsets.UTF_8));
                }
                send(out, 200, ok());
                return;
            }
            case "/api/remote": {
                String why = host.remote(data);
                if (why == null) send(out, 200, ok());
                else send(out, 400, error(why));
                return;
            }
            default:
                send(out, 404, error("no existe"));
        }
    }

    // ---------- Live pad over Server-Sent Events ----------

    private void stream(Socket s, InputStream in, OutputStream out) throws IOException {
        String head = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\n"
                + "Access-Control-Allow-Origin: *\r\nConnection: keep-alive\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.ISO_8859_1));
        out.write(event(live.state()));
        out.write(event(obj("t", "config", "config", config())));
        out.flush();
        streams.add(out);
        try {
            s.setSoTimeout(0);
            // Nothing more comes from the browser: read() returns -1 when it goes away.
            while (in.read() != -1) {
                // Ignore.
            }
        } finally {
            streams.remove(out);
        }
    }

    private void broadcast(JSONArray ops) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < ops.length(); i++) b.append("data: ").append(ops.opt(i)).append("\n\n");
        write(b.toString());
        host.onOps(ops);
    }

    private void write(String text) {
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        for (OutputStream s : streams) {
            try {
                synchronized (s) {
                    s.write(bytes);
                    s.flush();
                }
            } catch (IOException e) {
                streams.remove(s);
                closeQuietly(s);
            }
        }
    }

    private static byte[] event(JSONObject o) {
        return ("data: " + o + "\n\n").getBytes(StandardCharsets.UTF_8);
    }

    // ---------- Answers ----------

    JSONObject health() {
        JSONArray can = new JSONArray();
        for (String c : CAN) can.put(c);
        return obj("ok", true, "tv", true, "where", "tv", "platform", "android", "can", can);
    }

    JSONObject info() {
        String ip = host.ip();
        return obj("config", config(), "ip", ip == null ? JSONObject.NULL : ip, "port", PORT,
                "control", ip == null ? JSONObject.NULL : "http://" + ip + ":" + PORT + "/control");
    }

    private JSONObject manifest() {
        try {
            return obj("name", "Control TV", "short_name", "Control TV", "start_url", "/control", "display", "standalone",
                    "background_color", "#120A18", "theme_color", "#120A18",
                    "icons", new JSONArray().put(obj("src", "/icon.png", "sizes", "180x180", "type", "image/png")));
        } catch (RuntimeException e) {
            return new JSONObject();
        }
    }

    private synchronized JSONArray notes() {
        try {
            return new JSONArray(read(notesFile));
        } catch (IOException | JSONException e) {
            return new JSONArray();
        }
    }

    /** "30/10 4:05 p. m.", the webOS service's format. */
    static String stamp(Date d) {
        String s = new SimpleDateFormat("dd/MM h:mm", Locale.ROOT).format(d);
        int hour = Integer.parseInt(new SimpleDateFormat("H", Locale.ROOT).format(d));
        return s + (hour < 12 ? " a. m." : " p. m.");
    }

    private void asset(OutputStream out, String name, String type) throws IOException {
        byte[] b = host.asset(name);
        if (b == null) send(out, 404, error("no existe"));
        else send(out, 200, b, type);
    }

    private static void send(OutputStream out, int code, JSONObject body) throws IOException {
        send(out, code, body.toString().getBytes(StandardCharsets.UTF_8), "application/json; charset=utf-8");
    }

    private static void send(OutputStream out, int code, byte[] body, String type) throws IOException {
        String head = "HTTP/1.1 " + code + " " + reason(code) + "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.length
                + "\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Content-Type\r\nCache-Control: no-store"
                + "\r\nConnection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.ISO_8859_1));
        out.write(body);
        out.flush();
    }

    private static String reason(int code) {
        switch (code) {
            case 200: return "OK";
            case 204: return "No Content";
            case 400: return "Bad Request";
            case 403: return "Forbidden";
            case 404: return "Not Found";
            case 405: return "Method Not Allowed";
            case 413: return "Payload Too Large";
            default: return "Error";
        }
    }

    private static JSONObject ok() {
        return obj("ok", true);
    }

    private static JSONObject error(String m) {
        return obj("error", m);
    }

    /** A JSON object from key, value pairs. */
    static JSONObject obj(Object... kv) {
        JSONObject o = new JSONObject();
        for (int i = 0; i + 1 < kv.length; i += 2) put(o, (String) kv[i], kv[i + 1]);
        return o;
    }

    private static void put(JSONObject o, String k, Object v) {
        try {
            o.put(k, v);
        } catch (JSONException e) {
            throw new IllegalArgumentException(e);
        }
    }

    private static String read(File f) throws IOException {
        return new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
    }

    /** Written beside, then renamed: a power cut never leaves half a file. */
    private static void write(File f, byte[] data) throws IOException {
        File tmp = new File(f.getPath() + ".tmp");
        try (OutputStream o = new FileOutputStream(tmp)) {
            o.write(data);
        }
        Files.move(tmp.toPath(), f.toPath(), StandardCopyOption.REPLACE_EXISTING);
    }

    private static void closeQuietly(AutoCloseable c) {
        try {
            c.close();
        } catch (Exception ignored) {
            // Closing anyway.
        }
    }
}
