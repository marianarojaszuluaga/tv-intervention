// Prueba el kit en el computador, sin TV: corre service/service.js con webOS y la conexión de LG simulados,
// y sirve la app de la TV en otro puerto.
//   node dev/simular-tv.js            → servicio en :8765, app de la TV en :8766
//   PORT=8775 node dev/simular-tv.js  → servicio en :8775, app en :8776
// Los datos (config.json, dibujos) quedan en dev/datos/, nunca en /media ni /tmp.
"use strict";
var fs = require("fs");
var path = require("path");
var http = require("http");
var Module = require("module");

var ROOT = path.join(__dirname, "..");
var PORT = +(process.env.PORT || 8765);
var DATA_HOME = path.join(__dirname, "datos");
fs.mkdirSync(DATA_HOME, { recursive: true });
process.env.HOME = DATA_HOME;

// En Windows "/media/internal" sería C:\media\internal: se bloquea para que use HOME.
["mkdirSync", "writeFileSync"].forEach(function (fn) {
  var orig = fs[fn];
  fs[fn] = function (p) {
    if (/^[\\/](media|tmp)[\\/]/.test(String(p))) { var e = new Error("simulado"); e.code = "EACCES"; throw e; }
    return orig.apply(fs, arguments);
  };
});

// El servicio escucha en PORT (no en el 8765 fijo) si se pidió otro.
var listen = http.Server.prototype.listen;
http.Server.prototype.listen = function (port) {
  var args = Array.prototype.slice.call(arguments);
  if (port === 8765) args[0] = PORT;
  return listen.apply(this, args);
};

var APPS = [
  ["netflix", "Netflix"], ["youtube.leanback.v4", "YouTube"], ["amazon", "Prime Video"], ["spotify-beehive", "Spotify"],
  ["com.disney.disneyplus-prod", "Disney+"], ["com.webos.app.browser", "Navegador"], ["com.palm.app.settings", "Ajustes"],
  ["lgchannels", "LG Channels"], ["com.webos.app.gamingportal", "LG Gaming Portal"], ["twitch", "Twitch"],
  ["com.mariana.retrotv", "Terminal"], ["com.webos.app.hdmi1", "HDMI 1"]
].map(function (a) { return { id: a[0], title: a[1] }; });

function FakeLGTV() {}
FakeLGTV.prototype.paired = function () { return true; };
FakeLGTV.prototype.button = function (name, cb) { console.log("[tv] botón " + name); cb(null); };
FakeLGTV.prototype.move = function (x, y, cb) { cb(null); };
FakeLGTV.prototype.request = function (uri, params, cb) {
  if (/listLaunchPoints/.test(uri)) return cb(null, { launchPoints: APPS });
  if (/getExternalInputList/.test(uri)) return cb(null, { devices: [{ appId: "com.webos.app.hdmi1", label: "HDMI 1", connected: true }, { appId: "com.webos.app.hdmi2", label: "HDMI 2" }] });
  if (/getForegroundAppInfo/.test(uri)) return cb(null, { appId: "com.mariana.retrotv" });
  console.log("[tv] " + uri + " " + JSON.stringify(params));
  cb(null, {});
};

var handlers = {};
function FakeService() {
  this.activityManager = { create: function () {} };
}
FakeService.prototype.register = function (name, fn) { handlers[name] = fn; };
FakeService.prototype.call = function (uri, params, cb) { if (cb) cb({ payload: { returnValue: true, simulado: true } }); };

var load = Module._load;
Module._load = function (req, parent) {
  if (req === "webos-service") return FakeService;
  if (req === "./lgtv" && parent && /service[\\/]service\.js$/.test(parent.filename)) return { LGTV: FakeLGTV };
  return load.apply(this, arguments);
};

require(path.join(ROOT, "service", "service.js"));
handlers.start({ payload: {}, respond: function (r) { console.log("servicio:", JSON.stringify(r)); } });

// La app de la TV, con config.js apuntando al servicio simulado.
var TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2" };
http.createServer(function (req, res) {
  var rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  var file = path.join(ROOT, "app", path.normalize(rel).replace(/^([\\/]\.\.)+/, ""));
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); return res.end("no existe"); }
    if (/config\.js$/.test(file)) data = Buffer.from(String(data).replace("http://127.0.0.1:8765", "http://127.0.0.1:" + PORT));
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
}).listen(PORT + 1, "127.0.0.1", function () {
  console.log("App de la TV: http://127.0.0.1:" + (PORT + 1) + "/   Control: http://127.0.0.1:" + PORT + "/control");
});
