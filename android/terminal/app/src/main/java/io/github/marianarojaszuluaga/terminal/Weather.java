package io.github.marianarojaszuluaga.terminal;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import java.util.Locale;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** The weather for the city in Settings, from Open-Meteo (no key), as on the webOS app: now and the next three days. */
final class Weather {
    static final class Now {
        String place, condition;
        int temp, feels;
        final String[] days = new String[3];
        final int[] max = new int[3], min = new int[3];
    }

    private static final String[] DAYS = {"dom", "lun", "mar", "mié", "jue", "vie", "sáb"};

    private Weather() {}

    /** Looks the city up, then its forecast. Network on the calling thread; never call it on the UI thread. */
    static Now load(String city) throws IOException, JSONException {
        JSONObject geo = new JSONObject(get("https://geocoding-api.open-meteo.com/v1/search?count=1&language=es&name="
                + URLEncoder.encode(city, "UTF-8")));
        JSONArray results = geo.optJSONArray("results");
        if (results == null || results.length() == 0) throw new IOException("No encuentro “" + city + "”");
        JSONObject p = results.getJSONObject(0);
        String url = String.format(Locale.ROOT, "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f"
                + "&current=temperature_2m,apparent_temperature,weather_code"
                + "&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4",
                p.getDouble("latitude"), p.getDouble("longitude"));
        return parse(p.optString("name", city), new JSONObject(get(url)));
    }

    static Now parse(String place, JSONObject r) throws JSONException {
        Now n = new Now();
        JSONObject cur = r.getJSONObject("current");
        n.place = place;
        n.temp = (int) Math.round(cur.getDouble("temperature_2m"));
        n.feels = (int) Math.round(cur.getDouble("apparent_temperature"));
        n.condition = condition(cur.optInt("weather_code", -1));
        JSONObject d = r.getJSONObject("daily");
        JSONArray time = d.getJSONArray("time"), hi = d.getJSONArray("temperature_2m_max"), lo = d.getJSONArray("temperature_2m_min");
        for (int i = 0; i < 3 && i + 1 < time.length(); i++) {
            String[] ymd = time.getString(i + 1).split("-");
            Calendar c = Calendar.getInstance();
            c.set(Integer.parseInt(ymd[0]), Integer.parseInt(ymd[1]) - 1, Integer.parseInt(ymd[2]), 12, 0);
            n.days[i] = DAYS[c.get(Calendar.DAY_OF_WEEK) - 1];
            n.max[i] = (int) Math.round(hi.getDouble(i + 1));
            n.min[i] = (int) Math.round(lo.getDouble(i + 1));
        }
        return n;
    }

    static String condition(int code) {
        switch (code) {
            case 0: return "Despejado";
            case 1: return "Casi despejado";
            case 2: return "Parcialmente nublado";
            case 3: return "Nublado";
            case 45: return "Niebla";
            case 48: return "Niebla con escarcha";
            case 51: return "Llovizna ligera";
            case 53: return "Llovizna";
            case 55: return "Llovizna fuerte";
            case 61: return "Lluvia ligera";
            case 63: return "Lluvia";
            case 65: return "Lluvia fuerte";
            case 66: return "Lluvia helada";
            case 67: return "Lluvia helada fuerte";
            case 71: return "Nieve ligera";
            case 73: return "Nieve";
            case 75: return "Nieve fuerte";
            case 77: return "Granizo fino";
            case 80: return "Chubascos";
            case 81: return "Chubascos fuertes";
            case 82: return "Aguacero";
            case 85: return "Chubascos de nieve";
            case 86: return "Nevada fuerte";
            case 95: return "Tormenta";
            case 96: return "Tormenta con granizo";
            case 99: return "Tormenta fuerte con granizo";
            default: return "—";
        }
    }

    private static String get(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10_000);
        c.setReadTimeout(10_000);
        try (InputStream in = c.getInputStream()) {
            if (c.getResponseCode() != 200) throw new IOException("Open-Meteo " + c.getResponseCode());
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int k; (k = in.read(buf)) != -1; ) b.write(buf, 0, k);
            return b.toString(StandardCharsets.UTF_8.name());
        } finally {
            c.disconnect();
        }
    }
}
