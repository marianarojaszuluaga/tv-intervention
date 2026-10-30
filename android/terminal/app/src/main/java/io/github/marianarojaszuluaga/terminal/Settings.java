package io.github.marianarojaszuluaga.terminal;

import java.util.Arrays;
import java.util.List;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * This TV's settings, the same fields and rules as the webOS service (service/service.js): name, plural or singular
 * wording, greeting, city, theme, hidden apps and which blocks the screen shows. Changed from the phone's Settings tab.
 */
final class Settings {
    static final List<String> THEMES = Arrays.asList("terminal", "ambar", "synthwave", "minimal");
    static final List<String> GREETINGS = Arrays.asList("auto", "dias", "tardes", "noches", "ola");
    static final List<String> BLOCKS = Arrays.asList("weather", "inputs", "apps", "pad", "qr", "altar");

    private Settings() {}

    static JSONObject defaults() {
        try {
            JSONObject blocks = new JSONObject();
            for (String b : BLOCKS) blocks.put(b, true);
            return new JSONObject()
                    .put("name", "").put("plural", false).put("greeting", "auto").put("olaKeAse", true)
                    .put("city", "").put("theme", "terminal").put("hidden", new JSONArray()).put("blocks", blocks);
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Text from the phone: no control characters or angle brackets, trimmed, at most {@code max} characters. */
    static String clean(Object v, int max) {
        String s = v == null || v == JSONObject.NULL ? "" : String.valueOf(v);
        s = s.replaceAll("[\\u0000-\\u001f<>]", "").trim();
        return s.length() > max ? s.substring(0, max) : s;
    }

    /** {@code base} with the valid fields of {@code in} on top; a field that fails its check is left as it was. */
    static JSONObject merge(JSONObject base, JSONObject in) {
        try {
            JSONObject c = new JSONObject(base.toString());
            if (in == null) return c;
            if (in.has("name")) c.put("name", clean(in.opt("name"), 24));
            if (in.has("plural")) c.put("plural", in.optBoolean("plural"));
            if (GREETINGS.contains(in.optString("greeting"))) c.put("greeting", in.optString("greeting"));
            if (in.has("olaKeAse")) c.put("olaKeAse", in.optBoolean("olaKeAse"));
            if (in.has("city")) c.put("city", clean(in.opt("city"), 60));
            if (THEMES.contains(in.optString("theme"))) c.put("theme", in.optString("theme"));
            JSONArray hidden = in.optJSONArray("hidden");
            if (hidden != null) {
                JSONArray h = new JSONArray();
                for (int i = 0; i < Math.min(hidden.length(), 200); i++) {
                    String s = clean(hidden.opt(i), 120);
                    if (!s.isEmpty()) h.put(s);
                }
                c.put("hidden", h);
            }
            JSONObject blocks = in.optJSONObject("blocks");
            if (blocks != null) {
                JSONObject b = c.optJSONObject("blocks");
                if (b == null) c.put("blocks", b = new JSONObject());
                for (String k : BLOCKS) if (blocks.has(k)) b.put(k, blocks.optBoolean(k));
            }
            return c;
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    static boolean block(JSONObject c, String name) {
        JSONObject b = c.optJSONObject("blocks");
        return b == null || b.optBoolean(name, true);
    }

    /** "buenas tardes, Ana", by the hour unless a fixed greeting is chosen; in auto, one hour in four is "ola ke ase?". */
    static String greeting(JSONObject c, int hour, int dayOfMonth) {
        String g = c.optString("greeting", "auto");
        if (!GREETINGS.contains(g) || g.equals("auto")) {
            g = c.optBoolean("olaKeAse", true) && (hour + dayOfMonth) % 4 == 0 ? "ola"
                    : hour < 12 ? "dias" : hour < 19 ? "tardes" : "noches";
        }
        String name = c.optString("name", "");
        String text;
        switch (g) {
            case "dias": text = "buenos días"; break;
            case "tardes": text = "buenas tardes"; break;
            case "noches": text = "buenas noches"; break;
            default: text = "ola ke ase"; break;
        }
        return text + (name.isEmpty() ? "" : ", " + name) + (g.equals("ola") ? "?" : "");
    }

    /** The pad's line under its title, in plural ("Dibujemos") or singular ("Dibuja"). */
    static String padLine(JSONObject c) {
        return c.optBoolean("plural") ? "Dibujemos desde el teléfono: aparece aquí en vivo."
                : "Dibuja desde el teléfono: aparece aquí en vivo.";
    }

    static String qrHint(JSONObject c) {
        return c.optBoolean("plural") ? "Escaneemos el QR con el teléfono y abramos la pestaña Pad."
                : "Escanea el QR con el teléfono y abre la pestaña Pad.";
    }
}
