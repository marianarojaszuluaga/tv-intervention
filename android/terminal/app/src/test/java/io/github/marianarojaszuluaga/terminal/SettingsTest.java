package io.github.marianarojaszuluaga.terminal;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class SettingsTest {

    @Test public void validFieldsReplaceAndBadOnesAreIgnored() throws Exception {
        JSONObject in = new JSONObject().put("name", "  Ana<script>  ").put("plural", true).put("greeting", "nope")
                .put("theme", "synthwave").put("city", "Medellín").put("blocks", new JSONObject().put("pad", false).put("x", false));
        JSONObject c = Settings.merge(Settings.defaults(), in);
        assertEquals("Anascript", c.getString("name"));
        assertTrue(c.getBoolean("plural"));
        assertEquals("auto", c.getString("greeting"));
        assertEquals("synthwave", c.getString("theme"));
        assertEquals("Medellín", c.getString("city"));
        assertFalse(Settings.block(c, "pad"));
        assertTrue(Settings.block(c, "weather"));
        assertFalse(c.getJSONObject("blocks").has("x"));
    }

    @Test public void unknownThemeKeepsThePreviousOne() throws Exception {
        JSONObject c = Settings.merge(Settings.defaults(), new JSONObject().put("theme", "ambar"));
        c = Settings.merge(c, new JSONObject().put("theme", "neon"));
        assertEquals("ambar", c.getString("theme"));
    }

    @Test public void namesAndHiddenAppsAreCapped() throws Exception {
        JSONArray hidden = new JSONArray();
        for (int i = 0; i < 300; i++) hidden.put("app" + i);
        hidden.put("");
        JSONObject c = Settings.merge(Settings.defaults(),
                new JSONObject().put("name", "x".repeat(50)).put("hidden", hidden));
        assertEquals(24, c.getString("name").length());
        assertEquals(200, c.getJSONArray("hidden").length());
    }

    @Test public void greetingByHourOrFixed() throws Exception {
        JSONObject c = Settings.merge(Settings.defaults(), new JSONObject().put("olaKeAse", false).put("name", "Ana"));
        assertEquals("buenos días, Ana", Settings.greeting(c, 9, 1));
        assertEquals("buenas tardes, Ana", Settings.greeting(c, 15, 1));
        assertEquals("buenas noches, Ana", Settings.greeting(c, 21, 1));
        c = Settings.merge(c, new JSONObject().put("olaKeAse", true));
        assertEquals("ola ke ase, Ana?", Settings.greeting(c, 9, 3)); // (9 + 3) % 4 == 0
        c = Settings.merge(c, new JSONObject().put("greeting", "noches").put("name", ""));
        assertEquals("buenas noches", Settings.greeting(c, 9, 3));
    }

    @Test public void wordingFollowsPlural() throws Exception {
        assertTrue(Settings.padLine(Settings.defaults()).startsWith("Dibuja "));
        assertTrue(Settings.padLine(new JSONObject().put("plural", true)).startsWith("Dibujemos"));
        assertTrue(Settings.qrHint(Settings.defaults()).contains("pestaña Pad"));
        JSONObject noPad = Settings.merge(Settings.defaults(), new JSONObject().put("blocks", new JSONObject().put("pad", false)));
        assertEquals("Escanea el QR para abrir el control.", Settings.qrHint(noPad));
    }
}
