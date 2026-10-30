// Terminal: inicio retro para webOS. ES5 a propósito: el navegador de la TV es antiguo.
(function () {
  "use strict";

  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461, ESC: 27 };
  var $ = function (id) { return document.getElementById(id); };
  var current = "home";
  var focused = null;
  var lastHomeFocus = null;

  // ---------- Luna (servicios del sistema webOS) ----------
  var bridges = [];
  function luna(uri, params, cb) {
    if (typeof PalmServiceBridge === "undefined") { if (cb) cb(null); return; }
    var b = new PalmServiceBridge();
    bridges.push(b); // mantener la referencia viva hasta la respuesta (o siempre, si es una suscripción)
    b.onservicecallback = function (msg) {
      if (!(params && params.subscribe)) bridges.splice(bridges.indexOf(b), 1);
      var r = null;
      try { r = JSON.parse(msg); } catch (e) {}
      if (cb) cb(r);
    };
    b.call(uri, JSON.stringify(params || {}));
  }

  // ---------- Aviso ----------
  var toastTimer;
  function toast(text, bad) {
    var t = $("toast");
    t.textContent = text;
    t.className = "toast on" + (bad ? " bad" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "toast"; }, 3200);
  }

  // ---------- Navegación con el control ----------
  // Solo lo visible: los bloques quitados en Ajustes no reciben foco.
  function focusables() {
    return Array.prototype.slice.call(document.querySelectorAll("#" + current + " .f")).filter(function (el) { return el.offsetParent !== null; });
  }

  function setFocus(el) {
    if (!el) return;
    if (focused) focused.classList.remove("focus");
    focused = el;
    el.classList.add("focus");
    if (el.parentNode && el.parentNode.id === "dock") scrollGrid(el);
  }

  function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  // Primero la fila (o columna) más cercana en esa dirección; dentro de ella, el más alineado.
  function move(dir) {
    if (!focused) { setFocus(focusables()[0]); return; }
    var from = focused.getBoundingClientRect(), c = center(from);
    var cands = [];
    focusables().forEach(function (el) {
      if (el === focused) return;
      var r = el.getBoundingClientRect(), p = center(r), gap, cross;
      if (dir === KEY.LEFT) { gap = from.left - r.right; cross = Math.abs(p.y - c.y); }
      if (dir === KEY.RIGHT) { gap = r.left - from.right; cross = Math.abs(p.y - c.y); }
      if (dir === KEY.UP) { gap = from.top - r.bottom; cross = Math.abs(p.x - c.x); }
      if (dir === KEY.DOWN) { gap = r.top - from.bottom; cross = Math.abs(p.x - c.x); }
      if (gap < -1) return;
      cands.push({ el: el, gap: gap, cross: cross });
    });
    if (!cands.length) return;
    var vertical = dir === KEY.UP || dir === KEY.DOWN;
    var minGap = Math.min.apply(null, cands.map(function (k) { return k.gap; }));
    var best = null;
    cands.forEach(function (k) {
      if (vertical && k.gap > minGap + 24) return; // solo la fila más cercana
      var score = vertical ? k.cross : k.gap + k.cross * 2;
      if (!best || score < best.score) best = { el: k.el, score: score };
    });
    setFocus(best.el);
  }

  // Si hay más apps de las que caben (3 filas de 8), la cuadrícula sube por filas.
  var gridTop = 0;
  function scrollGrid(el) {
    var boxH = $("grid-box").clientHeight - 8, y = el.offsetTop, h = el.offsetHeight;
    if (y < gridTop) gridTop = y;
    if (y + h > gridTop + boxH) gridTop = y + h - boxH;
    $("dock").style.top = (4 - gridTop) + "px";
  }

  function show(view) {
    if (current === "home") lastHomeFocus = focused;
    document.querySelector("#" + current).classList.remove("on");
    current = view;
    $(view).classList.add("on");
    if (focused) focused.classList.remove("focus");
    focused = null;
    if (view === "home") setFocus(lastHomeFocus || focusables()[0]);
    else setFocus(focusables()[0]);
  }

  function isField(el) { return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA"); }

  document.addEventListener("keydown", function (e) {
    var k = e.keyCode, editing = isField(document.activeElement);

    if (editing) {
      // Mientras se escribe, el teclado de la TV maneja las teclas; solo salimos con Atrás o Abajo.
      if (k === KEY.BACK || k === KEY.ESC) { document.activeElement.blur(); e.preventDefault(); return; }
      if (k === KEY.DOWN && document.activeElement.tagName === "INPUT") { document.activeElement.blur(); move(KEY.DOWN); e.preventDefault(); }
      return;
    }

    if (k === KEY.LEFT || k === KEY.RIGHT || k === KEY.UP || k === KEY.DOWN) { move(k); e.preventDefault(); return; }
    if (k === KEY.OK) { activate(focused); e.preventDefault(); return; }
    if (k === KEY.BACK || k === KEY.ESC) { if (current !== "home") show("home"); e.preventDefault(); return; }
  });

  function activate(el) {
    if (!el) return;
    if (isField(el)) { el.focus(); return; }
    if (el.getAttribute("data-go")) { show(el.getAttribute("data-go")); return; }
    if (el.onactivate) el.onactivate();
  }

  // ---------- Reloj y saludo ----------
  var DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  var MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  function tick() {
    var d = new Date(), h = d.getHours(), m = d.getMinutes();
    $("time").textContent = ((h % 12) || 12) + ":" + (m < 10 ? "0" : "") + m;
    $("ampm").textContent = h < 12 ? "a.m." : "p.m.";
    $("date").textContent = DAYS[d.getDay()] + " " + d.getDate() + " de " + MONTHS[d.getMonth()] + " " + d.getFullYear();
    $("greet").textContent = greeting(d);
  }

  // Saludo según Ajustes: fijo, o por la hora. En automático, si está activado, una hora de cada cuatro
  // (siempre la misma durante esa hora) saluda con "ola ke ase".
  var GREET = { dias: "buenos días", tardes: "buenas tardes", noches: "buenas noches", ola: "ola ke ase" };
  function greeting(d) {
    var h = d.getHours(), g = S.greeting;
    if (!GREET[g]) g = S.olaKeAse && (h + d.getDate()) % 4 === 0 ? "ola" : h < 12 ? "dias" : h < 19 ? "tardes" : "noches";
    return GREET[g] + (S.name ? ", " + S.name : "") + (g === "ola" ? "?" : "");
  }

  // ---------- Ajustes de esta TV (vienen del servidor, se aplican en vivo) ----------
  var S = CONFIG.defaults;
  try { S = JSON.parse(localStorage.getItem("settings") || "null") || S; } catch (e) {}

  // Plural ("¿qué vemos hoy?") o singular ("¿qué ves hoy?").
  function words() {
    var n = S.name ? ", " + S.name : "";
    return S.plural ? {
      inputs: "nuestras entradas", apps: "¿qué vemos hoy" + n + "?",
      pad: "Dibujemos desde el teléfono: aparece aquí en vivo.",
      hint: S.blocks.qr ? "Escaneemos el QR con el teléfono<br>y abramos la pestaña Pad." : "Abramos el control en el teléfono<br>y la pestaña Pad."
    } : {
      inputs: "tus entradas", apps: "¿qué ves hoy" + n + "?",
      pad: "Dibuja desde el teléfono: aparece aquí en vivo.",
      hint: S.blocks.qr ? "Escanea el QR con el teléfono<br>y abre la pestaña Pad." : "Abre el control en el teléfono<br>y la pestaña Pad."
    };
  }

  // Completa con los valores de respaldo lo que falte (p. ej. un ajuste guardado por una versión anterior).
  function withDefaults(c) {
    var d = CONFIG.defaults, out = {}, k;
    for (k in d) out[k] = c && k in c ? c[k] : d[k];
    out.blocks = {};
    for (k in d.blocks) out.blocks[k] = c && c.blocks && k in c.blocks ? c.blocks[k] : d.blocks[k];
    return out;
  }

  function applySettings(c) {
    if (!c) return;
    var prev = S;
    S = c = withDefaults(c);
    try { localStorage.setItem("settings", JSON.stringify(c)); } catch (e) {}
    document.documentElement.setAttribute("data-theme", c.theme || "terminal");
    var b = c.blocks, cls = [];
    ["weather", "inputs", "apps", "pad", "qr"].forEach(function (k) { if (b[k] === false) cls.push("no-" + k); });
    if (b.weather === false && b.inputs === false && b.apps === false) cls.push("no-left");
    document.body.className = cls.join(" ");
    var w = words();
    $("inputs-label").textContent = w.inputs;
    $("apps-label").textContent = w.apps;
    $("pad-desc").textContent = w.pad;
    $("board-hint").innerHTML = w.hint;
    $("pad-title").textContent = b.pad === false ? "> CONTROL_" : "> PAD_";
    tick();
    if (prev.city !== c.city || !weatherStarted) loadWeather();
    if (lastApps && JSON.stringify(prev.hidden) !== JSON.stringify(c.hidden)) showApps(lastApps);
    // Si el foco quedó en un bloque que se quitó, vuelve al primero visible.
    if (focused && focused.offsetParent === null) { focused.classList.remove("focus"); focused = null; setFocus(focusables()[0]); }
    sizeBoard();
    redrawBoard();
    drawQR();
  }

  // Pide los ajustes y la dirección del control hasta que el servidor conteste (tarda unos segundos al abrir).
  var controlUrl = null;
  function loadSettings() {
    getJSON(CONFIG.pc + "/api/config", function (r) {
      if (!r || !r.config) { setTimeout(loadSettings, 4000); return; }
      controlUrl = r.control;
      applySettings(r.config);
    });
  }

  // ---------- QR al control, con la IP real de esta TV ----------
  function drawQR() {
    var cv = $("qr"), cx = cv.getContext("2d"), css = getComputedStyle(document.documentElement);
    var size = cv.clientWidth || 132, px = Math.round(size * (window.devicePixelRatio || 1));
    cv.width = px; cv.height = px;
    cx.fillStyle = css.getPropertyValue("--qr-bg").trim() || "#fff"; cx.fillRect(0, 0, px, px);
    $("qr-label").textContent = controlUrl ? controlUrl.replace(/^http:\/\//, "") : "buscando la dirección…";
    if (!controlUrl || typeof qrcode === "undefined") return;
    var qr = qrcode(0, "M");
    qr.addData(controlUrl);
    qr.make();
    var n = qr.getModuleCount(), quiet = 2, cell = px / (n + quiet * 2);
    cx.fillStyle = css.getPropertyValue("--qr-fg").trim() || "#000";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      if (qr.isDark(r, c)) cx.fillRect(Math.floor((c + quiet) * cell), Math.floor((r + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
    }
  }

  // ---------- Clima (Open-Meteo, sin clave) ----------
  var WMO = {
    0: "Despejado", 1: "Casi despejado", 2: "Parcialmente nublado", 3: "Nublado",
    45: "Niebla", 48: "Niebla con escarcha", 51: "Llovizna ligera", 53: "Llovizna", 55: "Llovizna fuerte",
    61: "Lluvia ligera", 63: "Lluvia", 65: "Lluvia fuerte", 66: "Lluvia helada", 67: "Lluvia helada fuerte",
    71: "Nieve ligera", 73: "Nieve", 75: "Nieve fuerte", 77: "Granizo fino",
    80: "Chubascos", 81: "Chubascos fuertes", 82: "Aguacero", 85: "Chubascos de nieve", 86: "Nevada fuerte",
    95: "Tormenta", 96: "Tormenta con granizo", 99: "Tormenta fuerte con granizo"
  };

  function getJSON(url, cb) {
    var x = new XMLHttpRequest();
    x.open("GET", url);
    x.timeout = 15000;
    x.onload = function () { var r = null; try { r = JSON.parse(x.responseText); } catch (e) {} cb(x.status === 200 ? r : null); };
    x.onerror = x.ontimeout = function () { cb(null); };
    x.send();
  }

  function postJSON(url, body, cb) {
    var x = new XMLHttpRequest();
    x.open("POST", url);
    x.setRequestHeader("Content-Type", "application/json");
    x.timeout = 60000;
    x.onload = function () { var r = null; try { r = JSON.parse(x.responseText); } catch (e) {} cb(x.status === 200 ? r : null, r); };
    x.onerror = x.ontimeout = function () { cb(null, null); };
    x.send(JSON.stringify(body));
  }

  // Cada cambio de ciudad empieza una "vuelta" nueva: las respuestas y reintentos de la anterior se ignoran.
  var weatherRun = 0, weatherTimer = null, weatherStarted = false;
  function loadWeather() {
    var run = ++weatherRun, city = S.city;
    weatherStarted = true;
    clearTimeout(weatherTimer);
    $("w-temp").textContent = "--°"; $("w-feels").textContent = ""; $("w-days").innerHTML = ""; $("w-city").textContent = "clima";
    if (!city) { $("w-cond").textContent = "Elige la ciudad en el control → Ajustes"; return; }
    $("w-cond").textContent = "Buscando el clima…";
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem("place") || "null"); } catch (e) {}
    if (cached && cached.q === city) return fetchForecast(cached, run);
    getJSON("https://geocoding-api.open-meteo.com/v1/search?count=1&language=es&name=" + encodeURIComponent(city), function (r) {
      if (run !== weatherRun) return;
      if (!r || !r.results || !r.results.length) { $("w-cond").textContent = "No encontré " + city; return retryWeather(); }
      var p = { q: city, name: r.results[0].name, lat: r.results[0].latitude, lon: r.results[0].longitude };
      try { localStorage.setItem("place", JSON.stringify(p)); } catch (e) {}
      fetchForecast(p, run);
    });
  }

  function retryWeather() { weatherTimer = setTimeout(loadWeather, 5 * 60 * 1000); }

  function fetchForecast(p, run) {
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + p.lat + "&longitude=" + p.lon +
      "&current=temperature_2m,apparent_temperature,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min" +
      "&timezone=auto&forecast_days=4";
    getJSON(url, function (r) {
      if (run !== weatherRun) return;
      if (!r || !r.current) { $("w-cond").textContent = "Sin conexión al clima"; return retryWeather(); }
      $("w-city").textContent = "clima · " + p.name;
      $("w-temp").textContent = Math.round(r.current.temperature_2m) + "°";
      $("w-cond").textContent = WMO[r.current.weather_code] || "—";
      $("w-feels").textContent = "Sensación " + Math.round(r.current.apparent_temperature) + "°";
      var html = "";
      for (var i = 1; i < 4; i++) {
        var day = new Date(r.daily.time[i] + "T12:00:00");
        html += '<div class="day"><div class="d">' + DAYS[day.getDay()].slice(0, 3) + '</div><div class="t display">' +
          Math.round(r.daily.temperature_2m_max[i]) + "° <span>" + Math.round(r.daily.temperature_2m_min[i]) + "°</span></div></div>";
      }
      $("w-days").innerHTML = html;
      weatherTimer = setTimeout(loadWeather, 30 * 60 * 1000);
    });
  }

  // ---------- Dock de apps ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function buildDock(apps) {
    var dock = $("dock");
    dock.innerHTML = "";
    apps.forEach(function (a) {
      var t = document.createElement("div");
      t.className = "tile f";
      t.innerHTML = (a.icon ? '<img src="' + esc(a.icon) + '" alt="">' : '<div class="mono display">' + esc(a.title.charAt(0)) + "</div>") +
        '<div class="name">' + esc(a.title) + "</div>";
      var img = t.querySelector("img");
      if (img) img.onerror = function () {
        var m = document.createElement("div");
        m.className = "mono display";
        m.textContent = a.title.charAt(0);
        t.replaceChild(m, img);
      };
      t.onactivate = function () { launch(a, t); };
      dock.appendChild(t);
    });
    gridTop = 0;
    dock.style.top = "4px";
    $("app-count").textContent = "· " + apps.length;
  }

  // ---------- Entradas (HDMI, TV, AV) ----------
  function isInput(id) { return /^com\.webos\.app\.(hdmi|livetv|externalinput|tvhotkey|inputcommon|ip|photovideo)/.test(id) && !/browser/.test(id); }

  function buildInputs(list) {
    var box = $("inputs");
    box.innerHTML = "";
    list = list.concat([{ lgHome: true, title: "Inicio LG" }]);
    list.forEach(function (inp) {
      var b = document.createElement("div");
      b.className = "input f" + (inp.connected ? " on" : "");
      b.innerHTML = '<span class="dot"></span>' + esc(inp.title);
      b.onactivate = inp.lgHome ? function () {
        postJSON(CONFIG.pc + "/api/remote", { lgHome: true }, function (r) { if (!r) toast("No pude ir al inicio de LG", true); });
      } : function () { launch(inp); };
      box.appendChild(b);
    });
  }

  function loadInputs() {
    luna("luna://com.webos.service.eim/getAllInputStatus", {}, function (r) {
      var devs = r && (r.devices || r.inputSourceList);
      if (devs && devs.length) {
        var list = [{ id: "com.webos.app.livetv", title: "TV" }];
        devs.forEach(function (d) {
          if (!d.appId) return;
          list.push({ id: d.appId, title: d.label || d.deviceName || d.id, connected: !!d.connected });
        });
        buildInputs(list);
      } else {
        buildInputs(CONFIG.inputs);
      }
    });
  }

  // Manda al computador lo que la TV responde, para poder diagnosticar sin ver la pantalla.
  function report(what, data) {
    try { postJSON(CONFIG.pc + "/api/log", { what: what, data: data }, function () {}); } catch (e) {}
  }
  window.onerror = function (msg, src, line) { report("error", { msg: String(msg), line: line }); };

  function launch(app, tile) {
    luna("luna://com.webos.applicationManager/launch", { id: app.id }, function (r) {
      if (r && r.returnValue === false) {
        toast("No encontré " + app.title + " en esta TV", true);
        if (tile && tile.parentNode) {
          var next = tile.nextSibling || tile.previousSibling;
          tile.parentNode.removeChild(tile);
          setFocus(next);
        }
      }
    });
    if (typeof PalmServiceBridge === "undefined") toast("Abriría " + app.title + " (vista previa)");
  }

  function loadApps() {
    // webOS no deja a esta app leer la lista; el computador la pide por la conexión de LG.
    // La última lista buena se guarda para cuando el computador esté apagado.
    getJSON(CONFIG.pc + "/api/tv/apps", function (r) {
      var list = r && r.apps && r.apps.length ? r.apps : null;
      if (list) { try { localStorage.setItem("apps", JSON.stringify(list)); } catch (e) {} }
      else {
        // El servicio puede tardar unos segundos en arrancar: mientras, la última lista guardada.
        setTimeout(loadApps, 5000);
        try { list = JSON.parse(localStorage.getItem("apps") || "null"); } catch (e) {}
      }
      showApps(list || CONFIG.apps);
    });
  }

  // Las apps ocultas en Ajustes se guardan por id (o por nombre, como antes).
  var lastApps = null;
  function showApps(list) {
    lastApps = list;
    var skip = { "com.mariana.retrotv": 1 }, hidden = S.hidden || [];
    var pref = CONFIG.apps.map(function (a) { return a.id; });
    list = list.filter(function (a) { return !skip[a.id] && a.title && !isInput(a.id) && hidden.indexOf(a.id) < 0 && hidden.indexOf(a.title) < 0; });
    list.sort(function (a, b) {
      var ia = pref.indexOf(a.id), ib = pref.indexOf(b.id);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    var wasInDock = focused && focused.parentNode === $("dock");
    buildDock(list);
    if (wasInDock) { focused = null; setFocus($("dock").firstChild || focusables()[0]); }
  }

  // ---------- Estado del computador ----------
  var pcOnline = false;
  function checkPC() {
    getJSON(CONFIG.pc + "/api/health", function (r) {
      pcOnline = !!(r && r.ok);
      $("pc").textContent = pcOnline ? "servidor ● listo" : "servidor ○ arrancando…";
      $("pc").className = "pc-status" + (pcOnline ? " ok" : "");
    });
  }

  // ---------- Nuestro pad en vivo ----------
  // Lo que dibujamos en el iPhone llega trazo a trazo; si Terminal está en pantalla, se abre solo.
  var board = { aspect: 1.4, strokes: [] }, bc = $("board-canvas"), bx = bc.getContext("2d");

  // El pad del iPhone es vertical: se ajusta al recuadro de la derecha manteniendo su forma.
  function sizeBoard() {
    var area = $("board-area"), maxW = area.clientWidth, maxH = area.clientHeight, w = maxW;
    if (w * board.aspect > maxH) w = maxH / board.aspect;
    $("board").style.width = w + "px";
    $("board").style.height = (w * board.aspect) + "px";
    $("board").style.marginLeft = (-w / 2) + "px";
    bc.width = Math.round(w); bc.height = Math.round(w * board.aspect);
  }
  // Los trazos traen un color del tema ("1".."4" → --ink1..4), así se ven bien en cualquier tema.
  function ink(c) {
    if (/^[1-4]$/.test(c)) return getComputedStyle(document.documentElement).getPropertyValue("--ink" + c).trim();
    return c;
  }
  function redrawBoard() {
    bx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(); bx.fillRect(0, 0, bc.width, bc.height);
    board.strokes.forEach(function (st) { drawSeg(st, 0); });
    $("board-hint").style.display = board.strokes.length ? "none" : "";
  }
  function drawSeg(st, from) {
    var w = bc.width, p = st.p, i = Math.max(0, from - 1);
    if (!p.length) return;
    bx.strokeStyle = ink(st.c); bx.lineWidth = Math.max(3, w * 0.011); bx.lineCap = "round"; bx.lineJoin = "round";
    bx.beginPath(); bx.moveTo(p[i][0] * w, p[i][1] * w);
    for (var k = i + 1; k < p.length; k++) bx.lineTo(p[k][0] * w, p[k][1] * w);
    if (p.length === 1) bx.lineTo(p[0][0] * w + 0.1, p[0][1] * w);
    bx.stroke();
  }
  // Mientras dibujamos, la TV no recibe teclas del control y pondría el protector de pantalla.
  // webOS pregunta antes de ponerlo: si dibujamos hace menos de 5 minutos, le decimos que no.
  var lastDraw = 0, DRAW_AWAKE = 5 * 60 * 1000, ssClient = "retrotv-" + Date.now(); // nombre único: el anterior queda registrado tras reinstalar
  function blockScreensaver() {
    luna("luna://com.webos.service.tvpower/power/registerScreenSaverRequest", { subscribe: true, clientName: ssClient }, function (r) {
      if (!r || !r.timestamp) { report("screensaver", r); return; }
      var busy = Date.now() - lastDraw < DRAW_AWAKE;
      luna("luna://com.webos.service.tvpower/power/responseScreenSaverRequest", { clientName: ssClient, ack: !busy, timestamp: r.timestamp }, function () {});
      report("screensaver", { blocked: busy });
    });
  }

  function onLive(op) {
    if (op.t === "config") { applySettings(op.config); return; }
    if (op.t === "start" || op.t === "pts") lastDraw = Date.now();
    if (op.t === "state") { board = { aspect: op.aspect, strokes: op.strokes }; sizeBoard(); redrawBoard(); return; }
    if (op.t === "aspect") { board.aspect = op.a; sizeBoard(); redrawBoard(); return; }
    if (op.t === "start") {
      var st = { c: op.c, p: op.p.slice() }; board.strokes.push(st); drawSeg(st, 0);
      $("board-hint").style.display = "none";
      return;
    }
    if (op.t === "pts") { var l = board.strokes[board.strokes.length - 1]; if (!l) return; var n = l.p.length; l.p = l.p.concat(op.p); drawSeg(l, n); return; }
    if (op.t === "undo") { board.strokes.pop(); redrawBoard(); return; }
    if (op.t === "clear") { board.strokes = []; redrawBoard(); }
  }
  function connectLive() {
    if (typeof EventSource === "undefined") return;
    var es = new EventSource(CONFIG.pc + "/api/live/stream");
    es.onmessage = function (e) { try { onLive(JSON.parse(e.data)); } catch (err) {} };
  }

  // ---------- Arranque ----------

  // El servidor vive en un servicio de la TV: se despierta al abrir Terminal.
  luna("luna://com.mariana.retrotv.service/start", {}, function (r) { if (!r || r.returnValue === false) report("service", r); });

  applySettings(S);
  setInterval(tick, 10000);
  loadSettings();
  loadInputs();
  loadApps();
  setTimeout(checkPC, 3000);
  setInterval(checkPC, 30000);
  connectLive();
  blockScreensaver();
  setFocus(focusables()[0]);

  // Al volver a la app desde otra (webOS la reabre), recuperar el foco.
  document.addEventListener("webOSRelaunch", function () { if (current !== "home") show("home"); checkPC(); });
})();
