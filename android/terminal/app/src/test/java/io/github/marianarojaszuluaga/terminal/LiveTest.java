package io.github.marianarojaszuluaga.terminal;

import static org.junit.Assert.assertEquals;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class LiveTest {

    private static JSONArray ops(String json) throws Exception {
        return new JSONArray(json);
    }

    @Test public void strokesGrowUndoAndClear() throws Exception {
        Live live = new Live();
        live.apply(ops("[{\"t\":\"start\",\"c\":\"2\",\"p\":[[0.1,0.2]]},{\"t\":\"pts\",\"p\":[[0.3,0.4],[0.5,0.6]]}]"));
        JSONArray strokes = live.state().getJSONArray("strokes");
        assertEquals(1, strokes.length());
        assertEquals("2", strokes.getJSONObject(0).getString("c"));
        assertEquals(3, strokes.getJSONObject(0).getJSONArray("p").length());
        live.apply(ops("[{\"t\":\"start\",\"p\":[]},{\"t\":\"undo\"}]"));
        assertEquals(1, live.state().getJSONArray("strokes").length());
        live.apply(ops("[{\"t\":\"clear\"}]"));
        assertEquals(0, live.state().getJSONArray("strokes").length());
    }

    @Test public void unknownAndBrokenOpsAreDropped() throws Exception {
        Live live = new Live();
        JSONArray out = live.apply(ops("[{\"t\":\"boom\"},7,{\"t\":\"pts\",\"p\":[[1,2]]},{\"t\":\"undo\"},"
                + "{\"t\":\"start\",\"p\":[[\"a\",1],[1],[0.5,0.5]]}]"));
        assertEquals(1, out.length());
        assertEquals(1, live.state().getJSONArray("strokes").getJSONObject(0).getJSONArray("p").length());
    }

    @Test public void aspectIsKeptInRange() throws Exception {
        Live live = new Live();
        live.apply(ops("[{\"t\":\"aspect\",\"a\":1.7}]"));
        assertEquals(1.7, live.state().getDouble("aspect"), 1e-9);
        live.apply(ops("[{\"t\":\"aspect\",\"a\":900}]"));
        assertEquals(1.4, live.state().getDouble("aspect"), 1e-9);
    }

    @Test public void broadcastStartIsACopyOfTheStoredStroke() throws Exception {
        Live live = new Live();
        JSONObject start = live.apply(ops("[{\"t\":\"start\",\"p\":[[0.1,0.1]]}]")).getJSONObject(0);
        live.apply(ops("[{\"t\":\"pts\",\"p\":[[0.2,0.2]]}]"));
        assertEquals(1, start.getJSONArray("p").length());
    }
}
