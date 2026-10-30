package io.github.marianarojaszuluaga.terminal;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class ServerTest {
    private File dir;
    private Server server;
    private final List<JSONObject> remote = new ArrayList<>();
    private final List<JSONObject> configs = new ArrayList<>();

    private final Server.Host host = new Server.Host() {
        @Override public byte[] asset(String name) {
            return name.equals("telefono.html") ? "<p>control</p>".getBytes(StandardCharsets.UTF_8) : null;
        }
        @Override public JSONObject apps(String base) {
            return Server.obj("apps", new JSONArray().put(Server.obj("id", "a.b", "title", "B", "icon", base + "/appicon/a.b.png")),
                    "inputs", new JSONArray());
        }
        @Override public byte[] appIcon(String pkg) {
            return pkg.equals("a.b") ? new byte[] {1, 2, 3} : null;
        }
        @Override public String remote(JSONObject command) {
            remote.add(command);
            return command.has("power") ? "no" : null;
        }
        @Override public String ip() {
            return "192.168.1.50";
        }
        @Override public void onConfig(JSONObject config) {
            configs.add(config);
        }
        @Override public void onOps(JSONArray ops) {}
    };

    @Before public void start() throws Exception {
        dir = Files.createTempDirectory("terminal").toFile();
        server = new Server(host, dir, new Live());
        server.start(0);
    }

    @After public void stop() {
        server.stop();
    }

    private String url(String path) {
        return "http://127.0.0.1:" + server.port() + path;
    }

    private Object[] call(String method, String path, String body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url(path)).openConnection();
        c.setRequestMethod(method);
        if (body != null) {
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            try (OutputStream o = c.getOutputStream()) {
                o.write(body.getBytes(StandardCharsets.UTF_8));
            }
        }
        int code = c.getResponseCode();
        InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        if (in != null) {
            byte[] buf = new byte[4096];
            for (int k; (k = in.read(buf)) != -1; ) b.write(buf, 0, k);
        }
        return new Object[] {code, b.toString("UTF-8"), c.getHeaderField("Content-Type")};
    }

    @Test public void healthSaysWhatAndroidCanDo() throws Exception {
        JSONObject h = new JSONObject((String) call("GET", "/api/health", null)[1]);
        assertEquals("android", h.getString("platform"));
        String can = h.getJSONArray("can").toString();
        assertTrue(can.contains("\"pad\"") && can.contains("\"volume\""));
        assertFalse(can.contains("dpad") || can.contains("power") || can.contains("inputs"));
    }

    @Test public void servesTheControlPage() throws Exception {
        Object[] r = call("GET", "/control", null);
        assertEquals(200, r[0]);
        assertEquals("<p>control</p>", r[1]);
        assertTrue(((String) r[2]).startsWith("text/html"));
        assertEquals(404, call("GET", "/nada", null)[0]);
        assertEquals(404, call("GET", "/", null)[0]); // computador.html not in this fake host's assets
    }

    @Test public void configIsValidatedSavedAndAnnounced() throws Exception {
        Object[] r = call("POST", "/api/config", "{\"name\":\"Ana\",\"theme\":\"ambar\",\"plural\":true,\"theme2\":1}");
        assertEquals(200, r[0]);
        JSONObject info = new JSONObject((String) r[1]);
        assertEquals("Ana", info.getJSONObject("config").getString("name"));
        assertEquals("http://192.168.1.50:8765/control", info.getString("control"));
        assertEquals(1, configs.size());
        // A new server (the screen opened again) reads it back from the file.
        Server again = new Server(host, dir, new Live());
        assertEquals("ambar", again.config().getString("theme"));
        assertTrue(again.config().getBoolean("plural"));
    }

    @Test public void badJsonIsRefused() throws Exception {
        assertEquals(400, call("POST", "/api/config", "{nope")[0]);
        assertEquals(400, call("POST", "/api/live", "{}")[0]);
        assertEquals(405, call("PUT", "/api/config", "{}")[0]);
    }

    @Test public void remoteGoesToTheHost() throws Exception {
        assertEquals(200, call("POST", "/api/remote", "{\"home\":true}")[0]);
        Object[] r = call("POST", "/api/remote", "{\"power\":\"off\"}");
        assertEquals(400, r[0]);
        assertEquals("no", new JSONObject((String) r[1]).getString("error"));
        assertEquals(2, remote.size());
    }

    @Test public void appsAndIcons() throws Exception {
        JSONObject a = new JSONObject((String) call("GET", "/api/tv/apps", null)[1]);
        assertEquals("http://127.0.0.1:" + server.port() + "/appicon/a.b.png", a.getJSONArray("apps").getJSONObject(0).getString("icon"));
        assertEquals(200, call("GET", "/appicon/a.b.png", null)[0]);
        assertEquals(404, call("GET", "/appicon/x.y.png", null)[0]);
        assertEquals(404, call("GET", "/appicon/../../etc.png", null)[0]);
    }

    @Test public void drawingIsSavedAndServed() throws Exception {
        String png = "data:image/png;base64,iVBORw0KGgo=";
        assertEquals(200, call("POST", "/api/notes", "{\"image\":\"" + png + "\"}")[0]);
        JSONArray notes = new JSONObject((String) call("GET", "/api/notes", null)[1]).getJSONArray("notes");
        assertEquals(1, notes.length());
        String path = notes.getJSONObject(0).getString("image");
        assertTrue(path.matches("/notas/\\d+\\.png"));
        assertEquals(200, call("GET", path, null)[0]);
        assertEquals(400, call("POST", "/api/notes", "{\"image\":\"data:text/html,x\"}")[0]);
        assertEquals(404, call("GET", "/notas/..%2Fconfig.json", null)[0]);
    }

    @Test public void liveStreamSendsStateThenNewStrokes() throws Exception {
        call("POST", "/api/live", "{\"ops\":[{\"t\":\"start\",\"c\":\"3\",\"p\":[[0.1,0.1]]}]}");
        HttpURLConnection c = (HttpURLConnection) new URL(url("/api/live/stream")).openConnection();
        c.setReadTimeout(5000);
        assertEquals("text/event-stream", c.getContentType());
        BufferedReader in = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8));
        JSONObject state = new JSONObject(in.readLine().substring(6));
        assertEquals("state", state.getString("t"));
        assertEquals("3", state.getJSONArray("strokes").getJSONObject(0).getString("c"));
        in.readLine();
        assertEquals("config", new JSONObject(in.readLine().substring(6)).getString("t"));
        in.readLine();
        call("POST", "/api/live", "{\"ops\":[{\"t\":\"clear\"}]}");
        assertEquals("clear", new JSONObject(in.readLine().substring(6)).getString("t"));
        c.disconnect();
    }

    @Test public void onlyTheHomeNetwork() throws Exception {
        assertTrue(Server.isLocal(InetAddress.getByName("192.168.1.20")));
        assertTrue(Server.isLocal(InetAddress.getByName("10.0.0.2")));
        assertTrue(Server.isLocal(InetAddress.getByName("172.20.1.1")));
        assertTrue(Server.isLocal(InetAddress.getByName("127.0.0.1")));
        assertFalse(Server.isLocal(InetAddress.getByName("8.8.8.8")));
        assertFalse(Server.isLocal(InetAddress.getByName("172.32.0.1")));
    }

    @Test public void stampLikeWebOS() throws Exception {
        java.util.Calendar c = java.util.Calendar.getInstance();
        c.set(2026, 9, 30, 16, 5);
        assertEquals("30/10 4:05 p. m.", Server.stamp(c.getTime()));
        c.set(2026, 9, 3, 0, 7);
        assertEquals("03/10 12:07 a. m.", Server.stamp(c.getTime()));
    }

    @Test public void theDrawingSurvivesTheScreenClosing() throws Exception {
        Live live = new Live();
        Server first = new Server(host, dir, live);
        first.start(0);
        HttpURLConnection c = (HttpURLConnection) new URL("http://127.0.0.1:" + first.port() + "/api/live").openConnection();
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        try (OutputStream o = c.getOutputStream()) {
            o.write("{\"ops\":[{\"t\":\"start\",\"p\":[[0.1,0.1]]}]}".getBytes(StandardCharsets.UTF_8));
        }
        assertEquals(200, c.getResponseCode());
        first.stop();
        assertEquals(1, new Server(host, dir, live).liveState().getJSONArray("strokes").length());
    }
}
