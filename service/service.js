// Servidor de Terminal dentro de la TV (servicio de webOS, Node 12).
// Hace lo mismo que pc/server.py: control del iPhone, pad en vivo, lista de apps e íconos,
// y el botón Home → Terminal. Así no depende del computador.
// Lo personal (nombre, trato, ciudad, tema…) no va en el código: vive en config.json dentro de la TV,
// así el mismo paquete sirve para cualquier TV.
"use strict";
var http = require("http");
var https = require("https");
var fs = require("fs");
var os = require("os");
var path = require("path");
var Service = require("webos-service");
var LGTV = require("./lgtv").LGTV;

var SERVICE_ID = "com.mariana.retrotv.service";
var MY_APP = "com.mariana.retrotv";
var HOME_APP = "com.webos.app.home";
var PORT = 8765;
var WWW = path.join(__dirname, "www");
// Lo que esta plataforma sabe hacer. El teléfono lo lee en /api/health y esconde lo demás,
// así el mismo telefono.html sirve en webOS y en Android TV. TERMINAL_CAN lo cambia (solo para el simulador).
var CAN = (process.env.TERMINAL_CAN || "dpad,volume,power,apps,inputs,home,lgHome,pad,notes,settings").split(",");
var service = new Service(SERVICE_ID);

// ---------- Datos: primera carpeta en la que se pueda escribir ----------
var DATA = null;
// /media/internal sobrevive a reinicios y reinstalaciones (la carpeta del servicio se borra al reinstalar
// y /tmp al reiniciar): ahí van el permiso de LG y los dibujos guardados.
var CANDIDATES = ["/media/internal/retrotv", process.env.HOME && path.join(process.env.HOME, "retrotv"), "/tmp/retrotv"].filter(Boolean);
var probe = CANDIDATES.map(function (d) {
  try { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, ".ok"), "1"); return d + ": sí"; } catch (e) { return d + ": " + e.code; }
});
CANDIDATES.some(function (d) {
  try { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, ".ok"), "1"); DATA = d; return true; } catch (e) { return false; }
});
var NOTES_DIR = path.join(DATA, "notas");
var NOTES_FILE = path.join(DATA, "notas.json");
var CONFIG_FILE = path.join(DATA, "config.json");
var ALTAR_DIR = path.join(DATA, "altar");
var ALTAR_FILE = path.join(DATA, "altar.json");
try { fs.mkdirSync(NOTES_DIR, { recursive: true }); } catch (e) {}
try { fs.mkdirSync(ALTAR_DIR, { recursive: true }); } catch (e) {}

// ---------- Ajustes de esta TV ----------
var THEMES = ["terminal", "ambar", "synthwave", "minimal"];
var GREETINGS = ["auto", "dias", "tardes", "noches", "ola"];
var BLOCKS = ["weather", "inputs", "apps", "pad", "qr", "altar"];
var DEFAULTS = {
  name: "", plural: false, greeting: "auto", olaKeAse: true, city: "", theme: "terminal",
  hidden: ["LG Channels", "LG Gaming Portal"],
  blocks: { weather: true, inputs: true, apps: true, pad: true, qr: true, altar: true }
};
function str(v, max) { return String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max); }
// Une lo guardado (o lo que llega del iPhone) con lo anterior, campo a campo y validando cada uno.
function mergeConfig(base, inp) {
  var c = JSON.parse(JSON.stringify(base));
  if (!inp || typeof inp !== "object") return c;
  if ("name" in inp) c.name = str(inp.name, 24);
  if ("plural" in inp) c.plural = !!inp.plural;
  if (GREETINGS.indexOf(inp.greeting) >= 0) c.greeting = inp.greeting;
  if ("olaKeAse" in inp) c.olaKeAse = !!inp.olaKeAse;
  if ("city" in inp) c.city = str(inp.city, 60);
  if (THEMES.indexOf(inp.theme) >= 0) c.theme = inp.theme;
  if (Array.isArray(inp.hidden)) c.hidden = inp.hidden.slice(0, 200).map(function (x) { return str(x, 120); }).filter(Boolean);
  if (inp.blocks && typeof inp.blocks === "object") BLOCKS.forEach(function (b) { if (b in inp.blocks) c.blocks[b] = !!inp.blocks[b]; });
  return c;
}
var config = mergeConfig(DEFAULTS, (function () { try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch (e) { return null; } })());

// La IP de la TV en la red de la casa: para el QR y la dirección del control.
function myIP() {
  var found = null, nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (n) {
    (nets[n] || []).forEach(function (a) {
      if (a.family !== "IPv4" && a.family !== 4) return;
      if (a.internal || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) return;
      if (!found || /^(wlan|eth)/.test(n)) found = a.address;
    });
  });
  return found;
}
function info() {
  var ip = myIP();
  return { config: config, ip: ip, port: PORT, control: ip ? "http://" + ip + ":" + PORT + "/control" : null,
    ofrenda: ip ? "http://" + ip + ":" + PORT + "/ofrenda" : null };
}

function log(line) {
  var s = new Date().toISOString().slice(0, 19) + " " + line + "\n";
  try {
    if (fs.existsSync(path.join(DATA, "server.log")) && fs.statSync(path.join(DATA, "server.log")).size > 512 * 1024) {
      fs.renameSync(path.join(DATA, "server.log"), path.join(DATA, "server.old.log"));
    }
    fs.appendFileSync(path.join(DATA, "server.log"), s);
  } catch (e) {}
}

var tv = new LGTV(path.join(DATA, "lgtv-key.json"), log);
var watcherTV = new LGTV(path.join(DATA, "lgtv-key.json"), log);

// ---------- Pad en vivo ----------
var live = { aspect: 1.4, strokes: [] };
var lastDraw = 0;
var streams = [];

function liveApply(ops) {
  var out = [];
  ops.forEach(function (op) {
    if (!op || typeof op !== "object") return;
    var t = op.t;
    if (t === "start") live.strokes.push({ c: String(op.c || "1").slice(0, 9), p: (op.p || []).slice(0, 2000) });
    else if (t === "pts" && live.strokes.length) Array.prototype.push.apply(live.strokes[live.strokes.length - 1].p, (op.p || []).slice(0, 2000));
    else if (t === "undo" && live.strokes.length) live.strokes.pop();
    else if (t === "clear") live.strokes = [];
    else if (t === "aspect") live.aspect = +op.a || 1.4;
    else return;
    if (t === "start" || t === "pts") lastDraw = Date.now();
    out.push(op);
  });
  if (!out.length) return;
  broadcast(out);
}
// Por el mismo canal del pad llegan los cambios de ajustes: la TV los aplica al instante.
function broadcast(ops) {
  var payload = ops.map(function (op) { return "data: " + JSON.stringify(op) + "\n\n"; }).join("");
  streams.forEach(function (res) { try { res.write(payload); } catch (e) {} });
}
setInterval(function () { streams.forEach(function (res) { try { res.write(": latido\n\n"); } catch (e) {} }); }, 15000);

// ---------- Notas guardadas ----------
function loadNotes() { try { return JSON.parse(fs.readFileSync(NOTES_FILE, "utf8")); } catch (e) { return []; } }
function saveNotes(n) { fs.writeFileSync(NOTES_FILE, JSON.stringify(n.slice(-300))); }
function stamp() {
  var d = new Date(), h = d.getHours(), m = d.getMinutes();
  return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + " " + ((h % 12) || 12) + ":" + ("0" + m).slice(-2) + (h < 12 ? " a. m." : " p. m.");
}

// ---------- Íconos de las apps (el https de la TV no lo aceptan los navegadores) ----------
var iconCache = {};
function iconUrl(icon, host) {
  var m = /\/resources\/([0-9a-f]{40}\/[\w.-]+\.(?:png|jpg))$/.exec(icon || "");
  return m ? "http://" + host + "/tvicon/" + m[1] : null;
}
function fetchIcon(rel, cb) {
  if (iconCache[rel]) return cb(null, iconCache[rel]);
  https.get({ host: "127.0.0.1", port: 3001, path: "/resources/" + rel, rejectUnauthorized: false, timeout: 8000 }, function (r) {
    var parts = [];
    r.on("data", function (d) { parts.push(d); });
    r.on("end", function () { if (r.statusCode !== 200) return cb(new Error("sin ícono")); cb(null, iconCache[rel] = Buffer.concat(parts)); });
  }).on("error", cb);
}

// ---------- Botón Home → Terminal ----------
// Se pregunta cada 0,7 s qué hay en pantalla. Mientras sea el inicio de LG, se abre Terminal (sin repetir
// la orden más de una vez cada 3 s). Al encender, el inicio de LG se reabre solo un par de veces: por eso
// la salida de emergencia pide Home TRES veces en 4 s (deja el inicio de LG 2 minutos).
var home = { last: null, launchedAt: 0, pausedUntil: 0, arrivals: [] };
function launchMine(why) {
  home.launchedAt = Date.now();
  tv.request("ssap://system.launcher/launch", { id: MY_APP }, function (err) { if (err) log("[" + why + "] no pude abrir Terminal: " + err.message); });
}
function onScreen(app, changed) {
  var now = Date.now();
  if (changed) log("[pantalla] " + app);
  if (/screensaver/i.test(app)) { if (changed && now - lastDraw < 5 * 60 * 1000) launchMine("protector"); return; }
  if (app !== HOME_APP) return;
  if (changed) {
    home.arrivals = home.arrivals.filter(function (t) { return now - t < 4000; }).concat(now);
    if (home.arrivals.length >= 3) { home.pausedUntil = now + 120000; home.arrivals = []; log("[inicio] Home tres veces: dejo el inicio de LG 2 minutos"); }
  }
  if (now < home.pausedUntil || now - home.launchedAt < 3000) return;
  launchMine("inicio");
}
function watch() {
  if (!watcherTV.paired()) return setTimeout(watch, 5000);
  watcherTV.request("ssap://com.webos.applicationManager/getForegroundAppInfo", {}, function (err, p) {
    if (err) { home.last = null; return setTimeout(watch, 3000); }
    var app = p.appId || "", changed = app !== home.last;
    home.last = app;
    onScreen(app, changed);
    setTimeout(watch, 700);
  });
}

// ---------- Altar de muertos ----------
// Los invitados suben la foto de su ser querido desde /ofrenda (QR en el altar); la TV la muestra en un marco.
// El teléfono ya la manda convertida a JPEG y reducida. Solo la TV misma (127.0.0.1) puede quitar fotos.
function loadAltar() { try { return JSON.parse(fs.readFileSync(ALTAR_FILE, "utf8")); } catch (e) { return []; } }
function saveAltar(a) { fs.writeFileSync(ALTAR_FILE, JSON.stringify(a)); }
function imageExt(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (buf.slice(0, 4).toString("hex") === "89504e47") return "png";
  return null;
}
function readRaw(req, max, cb) {
  var parts = [], n = 0, over = false;
  req.on("data", function (d) { n += d.length; if (n > max) { over = true; req.destroy(); } else parts.push(d); });
  req.on("end", function () { cb(over ? null : Buffer.concat(parts)); });
}
function query(req) {
  var q = {};
  (req.url.split("?")[1] || "").split("&").forEach(function (kv) {
    var i = kv.indexOf("=");
    if (i > 0) try { q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " ")); } catch (e) {}
  });
  return q;
}
function addOfrenda(req, res) {
  readRaw(req, 15000000, function (buf) {
    if (!buf) return send(res, 413, { error: "La foto es demasiado grande" });
    var ext = imageExt(buf);
    if (!ext) return send(res, 415, { error: "Formato no reconocido" });
    var q = query(req), id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try { fs.writeFileSync(path.join(ALTAR_DIR, id + "." + ext), buf); } catch (e) { return send(res, 500, { error: "No pude guardar: " + e.message }); }
    var o = { id: id, file: id + "." + ext, nombre: str(q.nombre, 60), mensaje: str(q.mensaje, 120), creado: new Date().toISOString() };
    var list = loadAltar(); list.push(o); saveAltar(list);
    log("[altar] nueva ofrenda " + id);
    broadcast([{ t: "altar", ofrenda: o }]);
    send(res, 200, o);
  });
}
function removeOfrenda(id) {
  var list = loadAltar(), o = null;
  list = list.filter(function (x) { if (x.id === id) { o = x; return false; } return true; });
  if (!o) return false;
  saveAltar(list);
  fs.unlink(path.join(ALTAR_DIR, o.file), function () {});
  log("[altar] quitada " + id);
  broadcast([{ t: "altar-quitar", id: id }]);
  return true;
}

// ---------- HTTP ----------
function isLocal(addr) {
  addr = String(addr || "").replace(/^::ffff:/, "");
  return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(addr) || addr === "::1";
}
function send(res, code, body, type) {
  var data = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  res.writeHead(code, {
    "Content-Type": type || "application/json; charset=utf-8", "Content-Length": data.length,
    "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store"
  });
  res.end(data);
}
function file(res, name, type) {
  fs.readFile(path.join(WWW, name), function (err, data) { if (err) send(res, 404, { error: "no existe" }); else send(res, 200, data, type); });
}
function readBody(req, cb) {
  var parts = [], n = 0;
  req.on("data", function (d) { n += d.length; if (n > 6000000) req.destroy(); else parts.push(d); });
  req.on("end", function () { try { cb(JSON.parse(Buffer.concat(parts).toString("utf8") || "{}")); } catch (e) { cb(null); } });
}
function tvError(res, err) {
  var m = String(err && err.message || err);
  send(res, /rechaz|reject|403/i.test(m) ? 403 : 502, { error: "Sin conexión con la TV: " + m });
}

var server = http.createServer(function (req, res) {
  if (!isLocal(req.socket.remoteAddress)) return send(res, 403, { error: "solo red local" });
  var url = req.url.split("?")[0];
  if (req.method === "OPTIONS") return send(res, 204, "");

  if (req.method === "GET") {
    if (url === "/") return file(res, "computador.html", "text/html; charset=utf-8");
    if (url === "/control") return file(res, "telefono.html", "text/html; charset=utf-8");
    if (url === "/icon.png") return file(res, "icon-180.png", "image/png");
    if (url === "/ofrenda") return file(res, "ofrenda.html", "text/html; charset=utf-8");
    if (url === "/heic2any.min.js") return file(res, "heic2any.min.js", "text/javascript; charset=utf-8");
    if (url === "/api/altar") return send(res, 200, { ofrendas: loadAltar(), ofrenda: info().ofrenda });
    if (url === "/manifest.webmanifest") return send(res, 200, { name: "Control TV", short_name: "Control TV", start_url: "/control",
      display: "standalone", background_color: "#120A18", theme_color: "#120A18", icons: [{ src: "/icon.png", sizes: "180x180", type: "image/png" }] }, "application/manifest+json");
    if (url === "/api/health") return send(res, 200, { ok: true, tv: tv.paired(), where: "tv", platform: "webos", can: CAN });
    if (url === "/api/notes") return send(res, 200, { notes: loadNotes() });
    if (url === "/api/config") return send(res, 200, info());
    if (url === "/api/log") {
      // Diagnóstico: últimas líneas del registro del servidor.
      return fs.readFile(path.join(DATA, "server.log"), "utf8", function (err, txt) {
        send(res, 200, (txt || String(err)).split("\n").slice(-60).join("\n"), "text/plain; charset=utf-8");
      });
    }
    if (url === "/api/live/stream") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
      res.write("data: " + JSON.stringify({ t: "state", aspect: live.aspect, strokes: live.strokes }) + "\n\n");
      res.write("data: " + JSON.stringify({ t: "config", config: config }) + "\n\n");
      streams.push(res);
      req.on("close", function () { streams.splice(streams.indexOf(res), 1); });
      return;
    }
    if (url === "/api/tv/apps") {
      var host = req.headers.host || ("127.0.0.1:" + PORT);
      return tv.request("ssap://com.webos.applicationManager/listLaunchPoints", {}, function (err, a) {
        if (err) return tvError(res, err);
        tv.request("ssap://tv/getExternalInputList", {}, function (err2, i) {
          if (err2) return tvError(res, err2);
          send(res, 200, {
            apps: (a.launchPoints || []).map(function (x) { return { id: x.id, title: x.title || x.id, icon: iconUrl(x.icon, host) }; }),
            inputs: (i.devices || []).map(function (d) { return { id: d.appId || d.id, title: d.label || d.id, connected: !!d.connected }; })
          });
        });
      });
    }
    var im = /^\/tvicon\/([0-9a-f]{40}\/[\w.-]+\.(png|jpg))$/.exec(url);
    if (im) return fetchIcon(im[1], function (err, data) { if (err) send(res, 404, { error: "sin ícono" }); else send(res, 200, data, im[2] === "png" ? "image/png" : "image/jpeg"); });
    var am = /^\/altar\/fotos\/([a-z0-9]+\.(jpg|png))$/.exec(url);
    if (am) return fs.readFile(path.join(ALTAR_DIR, am[1]), function (err, data) { if (err) send(res, 404, { error: "no existe" }); else send(res, 200, data, am[2] === "png" ? "image/png" : "image/jpeg"); });
    var nm = /^\/notas\/([\w-]+\.png)$/.exec(url);
    if (nm) return fs.readFile(path.join(NOTES_DIR, nm[1]), function (err, data) { if (err) send(res, 404, { error: "no existe" }); else send(res, 200, data, "image/png"); });
    return send(res, 404, { error: "no existe" });
  }

  if (req.method === "POST" && url === "/api/altar") return addOfrenda(req, res);

  if (req.method === "POST") {
    return readBody(req, function (data) {
      if (!data || typeof data !== "object") return send(res, 400, { error: "petición inválida" });
      if (url === "/api/live") {
        if (!Array.isArray(data.ops)) return send(res, 400, { error: "petición inválida" });
        liveApply(data.ops.slice(0, 500));
        return send(res, 200, { ok: true });
      }
      if (url === "/api/config") {
        config = mergeConfig(config, data);
        try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); } catch (e) { return send(res, 500, { error: "No pude guardar: " + e.message }); }
        broadcast([{ t: "config", config: config }]);
        return send(res, 200, info());
      }
      if (url === "/api/remote") {
        var done = function (err) { if (err) tvError(res, err); else send(res, 200, { ok: true }); };
        if (data.button) {
          var name = String(data.button).toUpperCase();
          if (!/^[A-Z0-9_]{1,20}$/.test(name)) return send(res, 400, { error: "botón inválido" });
          return tv.button(name, done);
        }
        // HOME del teléfono: abre Terminal sin que el teléfono sepa el id de la app en esta plataforma.
        if (data.home) return tv.request("ssap://system.launcher/launch", { id: MY_APP }, done);
        if (data.launch) return tv.request("ssap://system.launcher/launch", { id: String(data.launch) }, done);
        if (data.move) return tv.move(data.move[0], data.move[1], done);
        if (data.power === "off") return tv.request("ssap://system/turnOff", {}, done);
        if (data.lgHome) {
          // Ir al inicio de LG a propósito: Terminal no lo reemplaza durante 10 minutos.
          home.pausedUntil = Date.now() + 10 * 60 * 1000;
          log("[inicio] al inicio de LG por 10 minutos");
          return tv.request("ssap://system.launcher/launch", { id: HOME_APP }, done);
        }
        return send(res, 400, { error: "orden desconocida" });
      }
      if (url === "/api/notes") {
        var image = String(data.image || ""), text = String(data.text || "").trim().slice(0, 2000);
        if (!text && image.indexOf("data:image/png;base64,") !== 0) return send(res, 400, { error: "nota vacía" });
        var note = { text: text, time: stamp() };
        if (image) {
          var fname = Date.now() + ".png";
          fs.writeFileSync(path.join(NOTES_DIR, fname), Buffer.from(image.split(",")[1], "base64"));
          note.image = "/notas/" + fname;
        }
        var notes = loadNotes(); notes.push(note); saveNotes(notes);
        return send(res, 200, { ok: true });
      }
      if (url === "/api/altar/quitar") {
        // Solo desde la propia TV (el control remoto en el altar), no desde los teléfonos de los invitados.
        if (!/^(::ffff:)?127\./.test(req.socket.remoteAddress || "")) return send(res, 403, { error: "solo desde la TV" });
        return removeOfrenda(String(data.id || "")) ? send(res, 200, { ok: true }) : send(res, 404, { error: "no existe" });
      }
      if (url === "/api/log") { log("[app] " + JSON.stringify(data).slice(0, 2000)); return send(res, 200, { ok: true }); }
      send(res, 404, { error: "no existe" });
    });
  }
  send(res, 405, { error: "método no permitido" });
});

// ---------- Arranque y mantenerse vivo ----------
var started = false;
function start() {
  if (started) return;
  started = true;
  server.on("error", function (e) { log("[http] " + e.message); started = false; });
  server.listen(PORT, "0.0.0.0", function () {
    log("servidor en el puerto " + PORT + ", datos en " + DATA + " · HOME=" + process.env.HOME + " · " + probe.join(" | "));
  });
  watch();
  // webOS cierra los servicios sin actividad: esta actividad lo mantiene encendido.
  service.activityManager.create("keepAlive", function () {});
  // Y esta, guardada en el sistema, lo vuelve a despertar cada 5 minutos y tras reiniciar la TV.
  service.call("luna://com.palm.activitymanager/create", {
    activity: { name: "com.mariana.retrotv.revive", description: "Mantener el servidor de Terminal",
      type: { background: true, persist: true }, schedule: { interval: "5m" },
      callback: { method: "luna://" + SERVICE_ID + "/start", params: {} } },
    start: true, replace: true, subscribe: false
  }, function (r) { log("[revivir] " + JSON.stringify(r.payload).slice(0, 300)); });
  // Una más frecuente (cada 30 s, como el port comunitario) para que al encender Terminal no tarde minutos.
  service.call("luna://com.palm.activitymanager/create", {
    activity: { name: "com.mariana.retrotv.revive.fast", description: "Arranque rápido del servidor de Terminal",
      type: { foreground: true, persist: true }, schedule: { interval: "30s", precise: true },
      callback: { method: "luna://" + SERVICE_ID + "/start", params: {} } },
    start: true, replace: true, subscribe: false
  }, function (r) { log("[revivir rápido] " + JSON.stringify(r.payload).slice(0, 300)); });
}

service.register("start", function (msg) {
  start();
  // Si nos llamó la actividad periódica, la marcamos como terminada para que se repita.
  var act = msg.payload && msg.payload.$activity;
  if (act && act.activityId) service.call("luna://com.palm.activitymanager/complete", { activityId: act.activityId, restart: true }, function () {});
  msg.respond({ returnValue: true, port: PORT, paired: tv.paired(), data: DATA });
});
service.register("status", function (msg) {
  msg.respond({ returnValue: true, running: started, paired: tv.paired(), lastDraw: lastDraw, data: DATA });
});
