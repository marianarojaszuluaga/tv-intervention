package io.github.marianarojaszuluaga.terminal;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.View;

/** The control's QR code, dark modules on a light square with a two-module quiet zone, whatever the theme. */
final class QrView extends View {
    private final Paint paint = new Paint();
    private boolean[][] modules;
    private int dark = 0xFF120A18, light = 0xFFFFFFFF;

    QrView(Context c) {
        super(c);
    }

    void setText(String text) {
        modules = text == null ? null : Qr.encode(text);
        invalidate();
    }

    void setColors(int dark, int light) {
        this.dark = dark;
        this.light = light;
        invalidate();
    }

    @Override protected void onDraw(Canvas c) {
        int side = Math.min(getWidth(), getHeight());
        paint.setColor(light);
        c.drawRect(0, 0, side, side, paint);
        if (modules == null) return;
        int n = modules.length + 4;
        float m = side / (float) n;
        paint.setColor(dark);
        for (int y = 0; y < modules.length; y++) {
            for (int x = 0; x < modules.length; x++) {
                if (modules[y][x]) c.drawRect((x + 2) * m, (y + 2) * m, (x + 3) * m + 0.5f, (y + 3) * m + 0.5f, paint);
            }
        }
    }
}
