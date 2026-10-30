package io.github.marianarojaszuluaga.terminal;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.view.View;

import java.util.ArrayList;
import java.util.List;

import org.json.JSONArray;
import org.json.JSONObject;

/** The live pad on the TV: the phone's strokes, kept here op by op like the webOS app's board. */
final class PadView extends View {
    private static final class Stroke {
        final String c;
        float[] p = new float[64];
        int n;

        Stroke(String c) {
            this.c = c;
        }

        void add(JSONArray pts) {
            for (int i = 0; i < pts.length(); i++) {
                JSONArray xy = pts.optJSONArray(i);
                if (xy == null) continue;
                if (n + 2 > p.length) p = java.util.Arrays.copyOf(p, p.length * 2);
                p[n++] = (float) xy.optDouble(0);
                p[n++] = (float) xy.optDouble(1);
            }
        }
    }

    private final List<Stroke> strokes = new ArrayList<>();
    private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG), fill = new Paint(Paint.ANTI_ALIAS_FLAG),
            hint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path path = new Path();
    private final RectF box = new RectF();
    private float aspect = 1.4f;
    private Theme theme = Theme.of("terminal");
    private String hintText = "";

    PadView(Context c) {
        super(c);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeCap(Paint.Cap.ROUND);
        line.setStrokeJoin(Paint.Join.ROUND);
        hint.setTextAlign(Paint.Align.CENTER);
        hint.setTypeface(android.graphics.Typeface.MONOSPACE);
    }

    void setTheme(Theme t) {
        theme = t;
        invalidate();
    }

    void setHint(String text) {
        hintText = text;
        invalidate();
    }

    /** One op from the server: state, start, pts, undo, clear or aspect. */
    void apply(JSONObject op) {
        switch (op.optString("t")) {
            case "state": {
                strokes.clear();
                aspect = (float) op.optDouble("aspect", 1.4);
                JSONArray all = op.optJSONArray("strokes");
                for (int i = 0; all != null && i < all.length(); i++) {
                    JSONObject s = all.optJSONObject(i);
                    if (s == null) continue;
                    Stroke st = new Stroke(s.optString("c", "1"));
                    JSONArray p = s.optJSONArray("p");
                    if (p != null) st.add(p);
                    strokes.add(st);
                }
                requestLayout();
                break;
            }
            case "start": {
                Stroke st = new Stroke(op.optString("c", "1"));
                JSONArray p = op.optJSONArray("p");
                if (p != null) st.add(p);
                strokes.add(st);
                break;
            }
            case "pts": {
                JSONArray p = op.optJSONArray("p");
                if (!strokes.isEmpty() && p != null) strokes.get(strokes.size() - 1).add(p);
                break;
            }
            case "undo":
                if (!strokes.isEmpty()) strokes.remove(strokes.size() - 1);
                break;
            case "clear":
                strokes.clear();
                break;
            case "aspect":
                aspect = (float) op.optDouble("a", 1.4);
                requestLayout();
                break;
            default:
                return;
        }
        invalidate();
    }

    @Override protected void onMeasure(int wSpec, int hSpec) {
        // Width from the layout; height from the phone's pad shape, shrunk to fit if the column is short.
        int w = MeasureSpec.getSize(wSpec), maxH = MeasureSpec.getSize(hSpec);
        int h = Math.round(w * aspect);
        if (MeasureSpec.getMode(hSpec) != MeasureSpec.UNSPECIFIED && h > maxH) {
            h = maxH;
            w = Math.round(h / aspect);
        }
        setMeasuredDimension(w, h);
    }

    @Override protected void onDraw(Canvas c) {
        float w = getWidth(), r = w * 0.03f;
        box.set(0, 0, w, getHeight());
        fill.setColor(theme.bg);
        c.drawRoundRect(box, r, r, fill);
        fill.setColor(theme.line);
        fill.setStyle(Paint.Style.STROKE);
        fill.setStrokeWidth(Math.max(2, w * 0.004f));
        c.drawRoundRect(box, r, r, fill);
        fill.setStyle(Paint.Style.FILL);
        line.setStrokeWidth(Math.max(3, w * 0.011f));
        for (Stroke s : strokes) {
            if (s.n < 2) continue;
            line.setColor(theme.ink(s.c));
            path.reset();
            path.moveTo(s.p[0] * w, s.p[1] * w);
            for (int i = 2; i + 1 < s.n; i += 2) path.lineTo(s.p[i] * w, s.p[i + 1] * w);
            if (s.n == 2) path.lineTo(s.p[0] * w + 0.1f, s.p[1] * w);
            c.drawPath(path, line);
        }
        if (strokes.isEmpty() && !hintText.isEmpty()) {
            hint.setColor(theme.dim);
            hint.setTextSize(w * 0.045f);
            c.drawText(hintText, w / 2, getHeight() / 2f, hint);
        }
    }
}
