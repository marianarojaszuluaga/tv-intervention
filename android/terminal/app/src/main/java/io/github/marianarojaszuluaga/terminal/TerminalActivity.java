package io.github.marianarojaszuluaga.terminal;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Terminal's screen: greeting, clock, weather, the live pad and the control's QR code. While it is open it serves the
 * phone's control on port 8765 (see {@link Server}); it stops when the screen closes, so nothing runs in the background.
 */
public final class TerminalActivity extends Activity implements Server.Host {
    private static final long KEEP_AWAKE_MS = 5 * 60 * 1000;
    private static final Locale ES = new Locale("es");

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService work = Executors.newSingleThreadExecutor();
    private final Map<String, byte[]> icons = new ConcurrentHashMap<>();
    private Server server;
    private String serverError;
    private JSONObject config = Settings.defaults();
    private Theme theme = Theme.of("terminal");
    private int weatherRun;
    private String weatherCity;

    private LinearLayout root, weatherCard, padColumn, qrRow;
    private TextView greet, clock, date, wPlace, wTemp, wCond, wFeels, wMessage, padTitle, padLine, qrLabel, qrUrl, qrHint;
    private final TextView[] wDays = new TextView[3];
    private LinearLayout wNow, wDaysRow;
    private PadView pad;
    private QrView qr;

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            showTime();
            ui.postDelayed(this, 1000 - System.currentTimeMillis() % 1000);
        }
    };
    private final Runnable sleepAgain = () -> getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        build();
    }

    @Override protected void onStart() {
        super.onStart();
        server = new Server(this, getFilesDir());
        serverError = null;
        try {
            server.start(Server.PORT);
        } catch (IOException e) {
            serverError = "No pude abrir el puerto " + Server.PORT + ": " + e.getMessage();
        }
        config = server.config();
        pad.apply(server.liveState());
        apply(config);
        ui.post(tick);
    }

    @Override protected void onStop() {
        ui.removeCallbacks(tick);
        if (server != null) server.stop();
        server = null;
        // Stops the weather refresh; the next onStart loads it again.
        weatherRun++;
        weatherCity = null;
        super.onStop();
    }

    @Override protected void onDestroy() {
        work.shutdownNow();
        super.onDestroy();
    }

    // ---------- Screen ----------

    private void build() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(48), dp(36), dp(48), dp(36));

        LinearLayout top = row();
        greet = text(34, true);
        top.addView(greet, new LinearLayout.LayoutParams(0, -2, 1));
        LinearLayout time = column();
        time.setGravity(Gravity.END);
        clock = text(56, true);
        date = text(16, false);
        time.addView(clock);
        time.addView(date);
        top.addView(time);
        root.addView(top);

        LinearLayout body = row();
        body.setPadding(0, dp(24), 0, 0);
        LinearLayout left = column();

        weatherCard = column();
        weatherCard.setPadding(dp(24), dp(20), dp(24), dp(20));
        wPlace = text(14, false);
        weatherCard.addView(wPlace);
        wNow = row();
        wNow.setGravity(Gravity.CENTER_VERTICAL);
        wTemp = text(64, true);
        wNow.addView(wTemp);
        LinearLayout cond = column();
        cond.setPadding(dp(20), 0, 0, 0);
        wCond = text(20, false);
        wFeels = text(15, false);
        cond.addView(wCond);
        cond.addView(wFeels);
        wNow.addView(cond);
        weatherCard.addView(wNow);
        wDaysRow = row();
        wDaysRow.setPadding(0, dp(12), 0, 0);
        for (int i = 0; i < 3; i++) {
            wDays[i] = text(16, false);
            wDaysRow.addView(wDays[i], new LinearLayout.LayoutParams(0, -2, 1));
        }
        weatherCard.addView(wDaysRow);
        wMessage = text(18, false);
        weatherCard.addView(wMessage);
        left.addView(weatherCard, new LinearLayout.LayoutParams(-1, -2));

        View spacer = new View(this);
        left.addView(spacer, new LinearLayout.LayoutParams(-1, 0, 1));

        qrRow = row();
        qrRow.setGravity(Gravity.CENTER_VERTICAL);
        qr = new QrView(this);
        qrRow.addView(qr, new LinearLayout.LayoutParams(dp(132), dp(132)));
        LinearLayout qrText = column();
        qrText.setPadding(dp(20), 0, 0, 0);
        qrLabel = text(14, false);
        qrLabel.setText("control");
        qrUrl = text(18, true);
        qrHint = text(15, false);
        qrText.addView(qrLabel);
        qrText.addView(qrUrl);
        qrText.addView(qrHint);
        qrRow.addView(qrText, new LinearLayout.LayoutParams(0, -2, 1));
        left.addView(qrRow);
        body.addView(left, new LinearLayout.LayoutParams(0, -1, 1));

        padColumn = column();
        padColumn.setPadding(dp(32), 0, 0, 0);
        padTitle = text(14, false);
        padTitle.setText("pad en vivo");
        padLine = text(16, false);
        padLine.setPadding(0, 0, 0, dp(10));
        padColumn.addView(padTitle);
        padColumn.addView(padLine);
        pad = new PadView(this);
        padColumn.addView(pad, new LinearLayout.LayoutParams(-1, 0, 1));
        body.addView(padColumn, new LinearLayout.LayoutParams(dp(420), -1));

        root.addView(body, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
    }

    /** Settings to screen: theme, wording, blocks, and the weather when the city changed. */
    private void apply(JSONObject c) {
        config = c;
        theme = Theme.of(c.optString("theme"));
        root.setBackgroundColor(theme.bg);
        getWindow().setStatusBarColor(theme.bg);
        greet.setTextColor(theme.accent);
        clock.setTextColor(theme.clock);
        date.setTextColor(theme.label);
        weatherCard.setBackground(card());
        wPlace.setTextColor(theme.label);
        wTemp.setTextColor(theme.text);
        wCond.setTextColor(theme.text);
        wFeels.setTextColor(theme.dim);
        wMessage.setTextColor(theme.dim);
        for (TextView d : wDays) d.setTextColor(theme.text);
        padTitle.setTextColor(theme.label);
        padLine.setTextColor(theme.text);
        qrLabel.setTextColor(theme.label);
        qrUrl.setTextColor(theme.accent2);
        qrHint.setTextColor(theme.dim);
        pad.setTheme(theme);
        qr.setColors(theme.light ? 0xFF1D1D1F : 0xFF120A18, 0xFFFFFFFF);

        boolean showPad = Settings.block(c, "pad"), showQr = Settings.block(c, "qr");
        weatherCard.setVisibility(Settings.block(c, "weather") ? View.VISIBLE : View.GONE);
        padColumn.setVisibility(showPad ? View.VISIBLE : View.GONE);
        qrRow.setVisibility(showQr ? View.VISIBLE : View.GONE);
        padLine.setText(Settings.padLine(c));
        pad.setHint(showQr ? "Escanea el QR para dibujar" : "Abre el control en el teléfono");

        String ip = Net.ip();
        String url = ip == null ? null : "http://" + ip + ":" + Server.PORT + "/control";
        qr.setText(url);
        qrUrl.setText(serverError != null ? serverError : url == null ? "Sin red: conecta la TV al Wi-Fi" : url.substring(7));
        qrHint.setText(Settings.qrHint(c));
        showTime();

        String city = c.optString("city");
        if (!city.equals(weatherCity)) {
            weatherCity = city;
            loadWeather();
        }
    }

    private void showTime() {
        Calendar now = Calendar.getInstance();
        clock.setText(new SimpleDateFormat("HH:mm", ES).format(now.getTime()));
        date.setText(new SimpleDateFormat("EEEE d 'de' MMMM", ES).format(now.getTime()));
        greet.setText(">_ " + Settings.greeting(config, now.get(Calendar.HOUR_OF_DAY), now.get(Calendar.DAY_OF_MONTH)));
    }

    private void loadWeather() {
        int run = ++weatherRun;
        String city = weatherCity;
        if (city == null || city.isEmpty()) {
            weatherMessage("Elige la ciudad en el control → Ajustes");
            return;
        }
        weatherMessage("Cargando el clima…");
        work.execute(() -> {
            Weather.Now n = null;
            String err = null;
            try {
                n = Weather.load(city);
            } catch (IOException | JSONException e) {
                err = e.getMessage();
            }
            Weather.Now got = n;
            String why = err;
            ui.post(() -> {
                if (run != weatherRun) return;
                if (got == null) {
                    weatherMessage(why != null && why.startsWith("No encuentro") ? why : "Sin conexión al clima");
                    ui.postDelayed(() -> { if (run == weatherRun) loadWeather(); }, 5 * 60 * 1000);
                    return;
                }
                showWeather(got);
                ui.postDelayed(() -> { if (run == weatherRun) loadWeather(); }, 30 * 60 * 1000);
            });
        });
    }

    private void weatherMessage(String m) {
        wPlace.setText("clima");
        wNow.setVisibility(View.GONE);
        wDaysRow.setVisibility(View.GONE);
        wMessage.setVisibility(View.VISIBLE);
        wMessage.setText(m);
    }

    private void showWeather(Weather.Now n) {
        wPlace.setText("clima · " + n.place);
        wTemp.setText(n.temp + "°");
        wCond.setText(n.condition);
        wFeels.setText("Sensación " + n.feels + "°");
        for (int i = 0; i < 3; i++) wDays[i].setText(n.days[i] == null ? "" : n.days[i] + "  " + n.max[i] + "° / " + n.min[i] + "°");
        wNow.setVisibility(View.VISIBLE);
        wDaysRow.setVisibility(View.VISIBLE);
        wMessage.setVisibility(View.GONE);
    }

    private GradientDrawable card() {
        GradientDrawable g = new GradientDrawable();
        g.setColor(theme.surface);
        g.setStroke(dp(1), theme.line);
        g.setCornerRadius(dp(16));
        return g;
    }

    private LinearLayout row() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.HORIZONTAL);
        return l;
    }

    private LinearLayout column() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    private TextView text(float sp, boolean bold) {
        TextView t = new TextView(this);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTypeface(Typeface.MONOSPACE, bold ? Typeface.BOLD : Typeface.NORMAL);
        t.setIncludeFontPadding(false);
        t.setPadding(0, dp(2), 0, dp(2));
        return t;
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    // ---------- Server.Host: what the server needs from Android ----------

    @Override public byte[] asset(String name) {
        try (InputStream in = getAssets().open("www/" + name)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int k; (k = in.read(buf)) != -1; ) b.write(buf, 0, k);
            return b.toByteArray();
        } catch (IOException e) {
            return null;
        }
    }

    @Override public JSONObject apps(String base) throws JSONException {
        PackageManager pm = getPackageManager();
        Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER);
        List<ResolveInfo> found = pm.queryIntentActivities(main, 0);
        Collections.sort(found, (a, b) -> String.valueOf(a.loadLabel(pm)).compareToIgnoreCase(String.valueOf(b.loadLabel(pm))));
        JSONArray apps = new JSONArray();
        for (ResolveInfo r : found) {
            String pkg = r.activityInfo.packageName;
            if (pkg.equals(getPackageName())) continue;
            apps.put(new JSONObject().put("id", pkg).put("title", String.valueOf(r.loadLabel(pm)))
                    .put("icon", base + "/appicon/" + pkg + ".png"));
        }
        return new JSONObject().put("apps", apps).put("inputs", new JSONArray());
    }

    @Override public byte[] appIcon(String pkg) {
        byte[] cached = icons.get(pkg);
        if (cached != null) return cached;
        try {
            Drawable d = getPackageManager().getApplicationIcon(pkg);
            Bitmap b = Bitmap.createBitmap(144, 144, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(b);
            d.setBounds(0, 0, 144, 144);
            d.draw(c);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.PNG, 100, out);
            b.recycle();
            byte[] png = out.toByteArray();
            icons.put(pkg, png);
            return png;
        } catch (PackageManager.NameNotFoundException e) {
            return null;
        }
    }

    @Override public String remote(JSONObject cmd) {
        String button = cmd.optString("button", "");
        if (!button.isEmpty()) {
            int dir;
            switch (button.toUpperCase(Locale.ROOT)) {
                case "VOLUMEUP": dir = AudioManager.ADJUST_RAISE; break;
                case "VOLUMEDOWN": dir = AudioManager.ADJUST_LOWER; break;
                case "MUTE": dir = AudioManager.ADJUST_TOGGLE_MUTE; break;
                default: return "Esta TV no deja ese botón desde el teléfono: usa su control remoto";
            }
            AudioManager audio = getSystemService(AudioManager.class);
            audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, dir, AudioManager.FLAG_SHOW_UI);
            return null;
        }
        if (cmd.optBoolean("home")) {
            ui.post(() -> startActivity(new Intent(this, TerminalActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)));
            return null;
        }
        String launch = cmd.optString("launch", "");
        if (!launch.isEmpty()) {
            PackageManager pm = getPackageManager();
            Intent i = pm.getLeanbackLaunchIntentForPackage(launch);
            if (i == null) i = pm.getLaunchIntentForPackage(launch);
            if (i == null) return "No encuentro esa app en la TV";
            Intent go = i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ui.post(() -> startActivity(go));
            return null;
        }
        if (cmd.has("power")) return "Esta TV no se puede apagar desde el teléfono";
        return "orden desconocida";
    }

    @Override public String ip() {
        return Net.ip();
    }

    @Override public void onConfig(JSONObject c) {
        ui.post(() -> apply(c));
    }

    @Override public void onOps(JSONArray ops) {
        ui.post(() -> {
            boolean drew = false;
            for (int i = 0; i < ops.length(); i++) {
                JSONObject op = ops.optJSONObject(i);
                if (op == null || op.optString("t").equals("config")) continue;
                pad.apply(op);
                drew |= op.optString("t").equals("start") || op.optString("t").equals("pts");
            }
            if (drew) {
                // The remote sits idle while someone draws: keep the screen on for five minutes after the last stroke.
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                ui.removeCallbacks(sleepAgain);
                ui.postDelayed(sleepAgain, KEEP_AWAKE_MS);
            }
        });
    }
}
