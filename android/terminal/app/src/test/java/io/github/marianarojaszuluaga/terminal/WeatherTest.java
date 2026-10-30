package io.github.marianarojaszuluaga.terminal;

import static org.junit.Assert.assertEquals;

import org.json.JSONObject;
import org.junit.Test;

public class WeatherTest {

    @Test public void parsesNowAndTheNextThreeDays() throws Exception {
        JSONObject r = new JSONObject("{\"current\":{\"temperature_2m\":21.6,\"apparent_temperature\":22.4,\"weather_code\":3},"
                + "\"daily\":{\"time\":[\"2026-10-30\",\"2026-10-31\",\"2026-11-01\",\"2026-11-02\"],"
                + "\"temperature_2m_max\":[25,26.4,24.5,23],\"temperature_2m_min\":[15,16,14.6,13.2]}}");
        Weather.Now n = Weather.parse("Medellín", r);
        assertEquals(22, n.temp);
        assertEquals(22, n.feels);
        assertEquals("Nublado", n.condition);
        assertEquals("sáb", n.days[0]); // 31 Oct 2026
        assertEquals("dom", n.days[1]);
        assertEquals(26, n.max[0]);
        assertEquals(15, n.min[1]);
    }

    @Test public void unknownCodeIsADash() {
        assertEquals("—", Weather.condition(1234));
    }

    @Test public void themeInks() {
        Theme t = Theme.of("minimal");
        assertEquals(0xFF0066CC, t.ink("2"));
        assertEquals(0xFF112233, t.ink("#112233"));
        assertEquals(t.ink[0], t.ink("9"));
        assertEquals(Theme.of("terminal").bg, Theme.of("nope").bg);
    }
}
