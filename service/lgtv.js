// Conexión oficial de LG (SSAP) desde la propia TV, sin librerías: WebSocket mínimo sobre net/tls.
// Node 12 (el de la TV): sin ?. ni ??.
"use strict";
var net = require("net");
var tls = require("tls");
var crypto = require("crypto");
var fs = require("fs");

var PERMISSIONS = [
  "LAUNCH", "LAUNCH_WEBAPP", "APP_TO_APP", "CLOSE", "CONTROL_AUDIO", "CONTROL_DISPLAY",
  "CONTROL_INPUT_JOYSTICK", "CONTROL_INPUT_MEDIA_PLAYBACK", "CONTROL_INPUT_TV", "CONTROL_POWER",
  "READ_APP_STATUS", "READ_CURRENT_CHANNEL", "READ_INPUT_DEVICE_LIST", "READ_NETWORK_STATE",
  "READ_RUNNING_APPS", "READ_TV_CHANNEL_LIST", "WRITE_NOTIFICATION_TOAST", "READ_POWER_STATE",
  "READ_COUNTRY_INFO", "CONTROL_INPUT_TEXT", "CONTROL_MOUSE_AND_KEYBOARD", "READ_INSTALLED_APPS",
  "READ_SETTINGS"
];

// ---------- WebSocket cliente (texto) ----------
function WS(url, onOpen, onError) {
  var m = /^(wss?):\/\/([^/:]+)(?::(\d+))?(\/.*)?$/.exec(url);
  if (!m) throw new Error("URL inválida: " + url);
  var secure = m[1] === "wss", host = m[2], port = +(m[3] || (secure ? 443 : 80)), path = m[4] || "/";
  var self = this;
  this.onmessage = function () {};
  this.onclose = function () {};
  this.buf = Buffer.alloc(0);
  this.open = false;
  this.parts = [];
  var key = crypto.randomBytes(16).toString("base64");
  var opts = { host: host, port: port, rejectUnauthorized: false }; // la TV usa un certificado propio
  this.sock = secure ? tls.connect(opts) : net.connect(opts);
  this.sock.setTimeout(15000);
  this.sock.on(secure ? "secureConnect" : "connect", function () {
    self.sock.write("GET " + path + " HTTP/1.1\r\nHost: " + host + ":" + port + "\r\nUpgrade: websocket\r\n" +
      "Connection: Upgrade\r\nSec-WebSocket-Key: " + key + "\r\nSec-WebSocket-Version: 13\r\n\r\n");
  });
  this.sock.on("data", function (d) {
    self.buf = Buffer.concat([self.buf, d]);
    if (!self.open) {
      var end = self.buf.indexOf("\r\n\r\n");
      if (end < 0) return;
      var head = self.buf.slice(0, end).toString();
      self.buf = self.buf.slice(end + 4);
      if (head.indexOf(" 101 ") < 0) { self.close(); onError(new Error(head.split("\r\n")[0])); return; }
      self.open = true;
      self.sock.setTimeout(0);
      onOpen();
    }
    self._parse();
  });
  this.sock.on("timeout", function () { self.sock.destroy(new Error("sin respuesta")); });
  this.sock.on("error", function (e) { if (!self.open) onError(e); });
  this.sock.on("close", function () { var was = self.open; self.open = false; if (was) self.onclose(); });
}
WS.prototype._parse = function () {
  for (;;) {
    var b = this.buf;
    if (b.length < 2) return;
    var op = b[0] & 0x0f, fin = b[0] & 0x80, len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = b.readUInt32BE(6); off = 10; }
    var masked = b[1] & 0x80;
    if (masked) off += 4;
    if (b.length < off + len) return;
    var data = b.slice(off, off + len);
    if (masked) { var mk = b.slice(off - 4, off); for (var i = 0; i < data.length; i++) data[i] ^= mk[i % 4]; }
    this.buf = b.slice(off + len);
    if (op === 0x9) { this._frame(0xA, data); continue; }
    if (op === 0x8) { this.close(); return; }
    this.parts.push(data);
    if (fin) { var msg = Buffer.concat(this.parts).toString("utf8"); this.parts = []; this.onmessage(msg); }
  }
};
WS.prototype._frame = function (opcode, data) {
  var n = data.length, head;
  if (n < 126) head = Buffer.from([0x80 | opcode, 0x80 | n]);
  else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 0x80 | 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 0x80 | 127; head.writeUInt32BE(0, 2); head.writeUInt32BE(n, 6); }
  var mask = crypto.randomBytes(4), out = Buffer.alloc(n);
  for (var i = 0; i < n; i++) out[i] = data[i] ^ mask[i % 4];
  this.sock.write(Buffer.concat([head, mask, out]));
};
WS.prototype.send = function (text) { this._frame(0x1, Buffer.from(text, "utf8")); };
WS.prototype.close = function () { this.open = false; try { this.sock.destroy(); } catch (e) {} };

// ---------- SSAP ----------
function LGTV(keyFile, log) {
  this.keyFile = keyFile;
  this.log = log || function () {};
  this.ws = null;
  this.pointer = null;
  this.pending = {};
  this.seq = 0;
  this.connecting = null;
}
LGTV.prototype.paired = function () { return fs.existsSync(this.keyFile); };

// Conecta y se registra; la primera vez la TV pregunta si permite la conexión.
LGTV.prototype._connect = function (cb) {
  var self = this;
  if (this.ws && this.ws.open) return cb(null);
  if (this.connecting) { this.connecting.push(cb); return; }
  this.connecting = [cb];
  // Si nadie acepta el aviso en la TV, se abandona a los 60 s y la siguiente petición lo vuelve a mostrar.
  var giveUp = setTimeout(function () { try { ws.close(); } catch (e) {} done(new Error("esperando que aceptemos el aviso de LG en la TV")); }, 60000);
  function done(err) {
    clearTimeout(giveUp);
    var l = self.connecting; if (!l) return;
    self.connecting = null; l.forEach(function (f) { f(err); });
  }
  var ws = new WS("ws://127.0.0.1:3000", function () {
    var key = null;
    try { key = JSON.parse(fs.readFileSync(self.keyFile, "utf8"))["client-key"]; } catch (e) {}
    var payload = { forcePairing: false, pairingType: "PROMPT",
      manifest: { manifestVersion: 1, appVersion: "1.0", permissions: PERMISSIONS } };
    if (key) payload["client-key"] = key;
    ws.onmessage = function (text) {
      var msg; try { msg = JSON.parse(text); } catch (e) { return; }
      if (msg.id === "reg0") {
        if (msg.type === "registered") {
          var nk = msg.payload && msg.payload["client-key"];
          if (nk && nk !== key) fs.writeFileSync(self.keyFile, JSON.stringify({ "client-key": nk }));
          self.ws = ws;
          ws.onmessage = function (t) { self._onMessage(t); };
          done(null);
        } else if (msg.type === "error") {
          ws.close(); done(new Error(msg.error || "La TV rechazó la conexión"));
        }
        return;
      }
    };
    ws.onclose = function () {
      if (self.ws === ws) { self.ws = null; self.pointer = null; }
      Object.keys(self.pending).forEach(function (id) { self.pending[id](new Error("conexión cerrada")); });
      self.pending = {};
    };
    ws.send(JSON.stringify({ type: "register", id: "reg0", payload: payload }));
  }, done);
};
LGTV.prototype._onMessage = function (text) {
  var msg; try { msg = JSON.parse(text); } catch (e) { return; }
  var cb = this.pending[msg.id];
  if (!cb) return;
  delete this.pending[msg.id];
  if (msg.type === "error") cb(new Error(msg.error || "error"));
  else cb(null, msg.payload || {});
};
LGTV.prototype.request = function (uri, payload, cb) {
  var self = this;
  this._connect(function (err) {
    if (err) return cb(err);
    var id = "r" + (++self.seq);
    var timer = setTimeout(function () { if (self.pending[id]) { delete self.pending[id]; cb(new Error("la TV no respondió")); } }, 10000);
    self.pending[id] = function (e, p) { clearTimeout(timer); cb(e, p); };
    self.ws.send(JSON.stringify({ type: "request", id: id, uri: uri, payload: payload || {} }));
  });
};
LGTV.prototype._withPointer = function (cb) {
  var self = this;
  if (this.pointer && this.pointer.open) return cb(null, this.pointer);
  this.request("ssap://com.webos.service.networkinput/getPointerInputSocket", {}, function (err, p) {
    if (err) return cb(err);
    var url = String(p.socketPath || "").replace(/^wss:\/\/[^/]+:3001/, "ws://127.0.0.1:3000");
    var ws = new WS(url, function () { self.pointer = ws; cb(null, ws); }, cb);
    ws.onclose = function () { if (self.pointer === ws) self.pointer = null; };
  });
};
LGTV.prototype.button = function (name, cb) {
  this._withPointer(function (err, ws) {
    if (err) return cb(err);
    ws.send("type:button\nname:" + name + "\n\n");
    cb(null);
  });
};
LGTV.prototype.move = function (dx, dy, cb) {
  this._withPointer(function (err, ws) {
    if (err) return cb(err);
    ws.send("type:move\ndx:" + (dx | 0) + "\ndy:" + (dy | 0) + "\ndown:0\n\n");
    cb(null);
  });
};

module.exports = { LGTV: LGTV };
