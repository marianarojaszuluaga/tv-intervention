package io.github.marianarojaszuluaga.terminal;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The live pad, as in the webOS service: strokes drawn on the phone, each a theme colour ("1" to "4") and points
 * scaled to the pad's width. Ops: start, pts, undo, clear, aspect. Thread-safe; the server calls it per request.
 */
final class Live {
    private static final int MAX_POINTS = 2000;

    private double aspect = 1.4;
    private final JSONArray strokes = new JSONArray();
    private long lastDraw;

    /** Applies the ops it knows and returns them, to be broadcast; unknown ops are dropped. */
    synchronized JSONArray apply(JSONArray ops) {
        JSONArray out = new JSONArray();
        try {
            for (int i = 0; i < Math.min(ops.length(), 500); i++) {
                JSONObject op = ops.optJSONObject(i);
                if (op == null) continue;
                String t = op.optString("t");
                switch (t) {
                    case "start": {
                        String c = op.optString("c", "1");
                        JSONArray p = points(op.optJSONArray("p"));
                        strokes.put(new JSONObject().put("c", c.length() > 9 ? c.substring(0, 9) : c).put("p", p));
                        // The broadcast op gets its own copy: the stored stroke keeps growing with "pts".
                        op = new JSONObject().put("t", "start").put("c", c).put("p", points(p));
                        break;
                    }
                    case "pts": {
                        if (strokes.length() == 0) continue;
                        JSONArray p = points(op.optJSONArray("p"));
                        JSONArray last = strokes.getJSONObject(strokes.length() - 1).getJSONArray("p");
                        for (int k = 0; k < p.length(); k++) last.put(p.get(k));
                        op = new JSONObject().put("t", "pts").put("p", p);
                        break;
                    }
                    case "undo":
                        if (strokes.length() == 0) continue;
                        strokes.remove(strokes.length() - 1);
                        break;
                    case "clear":
                        while (strokes.length() > 0) strokes.remove(strokes.length() - 1);
                        break;
                    case "aspect":
                        double a = op.optDouble("a", 1.4);
                        aspect = a > 0.2 && a < 5 ? a : 1.4;
                        op = new JSONObject().put("t", "aspect").put("a", aspect);
                        break;
                    default:
                        continue;
                }
                if (t.equals("start") || t.equals("pts")) lastDraw = System.currentTimeMillis();
                out.put(op);
            }
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
        return out;
    }

    /** The whole pad as a "state" op, a copy safe to hand to another thread. */
    synchronized JSONObject state() {
        try {
            return new JSONObject().put("t", "state").put("aspect", aspect).put("strokes", new JSONArray(strokes.toString()));
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    synchronized long lastDraw() {
        return lastDraw;
    }

    /** At most 2000 [x, y] pairs of finite numbers, copied. */
    private static JSONArray points(JSONArray in) throws JSONException {
        JSONArray out = new JSONArray();
        if (in == null) return out;
        for (int i = 0; i < in.length() && out.length() < MAX_POINTS; i++) {
            JSONArray xy = in.optJSONArray(i);
            if (xy == null || xy.length() < 2) continue;
            double x = xy.optDouble(0), y = xy.optDouble(1);
            if (Double.isNaN(x) || Double.isNaN(y) || Double.isInfinite(x) || Double.isInfinite(y)) continue;
            out.put(new JSONArray().put(x).put(y));
        }
        return out;
    }
}
