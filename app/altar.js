// Altar de muertos: los invitados suben fotos desde el teléfono (QR → /ofrenda) y aparecen aquí en marcos.
// ES5 a propósito, como app.js. Las fotos y la lista viven en el servicio de la TV; las novedades llegan por
// el mismo canal en vivo del pad (ops "altar" y "altar-quitar"), que app.js le pasa a Altar.live().
var Altar = (function () {
  "use strict";

  var PER_PAGE = 12;           // fotos por pantalla antes de rotar (la TV tiene poca memoria)
  var PAGE_MS = 14000;         // tiempo por página
  var SPOTLIGHT_MS = 9000;     // tiempo que se destaca una foto nueva
  var AREA = { left: 290, top: 236, width: 1340, height: 664 }; // donde van los marcos
  var GAP = 24, RATIO = 4 / 5.2;
  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461, ESC: 27 };

  var pc = "", root = null, ofrendas = [], ofrendaUrl = null;
  var page = 0, cols = 1, visibles = [];
  var open = false, spotlight = false, queue = [];
  var pick = null; // modo quitar: { i: índice en la página, confirm: bool }
  var $ = function (id) { return document.getElementById(id); };

  // ---------- Red ----------
  function request(method, url, body, cb) {
    var x = new XMLHttpRequest();
    x.open(method, url);
    x.timeout = 15000;
    if (body) x.setRequestHeader("Content-Type", "application/json");
    x.onload = function () { var r = null; try { r = JSON.parse(x.responseText); } catch (e) {} cb(x.status === 200 ? r : null); };
    x.onerror = x.ontimeout = function () { cb(null); };
    x.send(body ? JSON.stringify(body) : null);
  }

  function load() {
    request("GET", pc + "/api/altar", null, function (r) {
      if (!r || !r.ofrendas) { setTimeout(load, 4000); return; }
      ofrendas = r.ofrendas;
      if (r.ofrenda !== ofrendaUrl) { ofrendaUrl = r.ofrenda; drawQRs(); }
      if (open && !spotlight) render();
    });
  }

  // ---------- Decoración ----------
  var COLORES = ["#F28C1B", "#6A2C91", "#D6336C", "#2F8F4E", "#F2C12E", "#1F8FB8"];
  function picado() {
    var holes = '<circle cx="50" cy="38" r="17"/><rect x="38" y="48" width="24" height="12" rx="3"/>' +
      '<circle cx="20" cy="18" r="4"/><circle cx="80" cy="18" r="4"/><circle cx="20" cy="70" r="4"/><circle cx="80" cy="70" r="4"/>' +
      '<path d="M10 88 L18 80 L26 88 L34 80 L42 88 L50 80 L58 88 L66 80 L74 88 L82 80 L90 88 L90 92 L10 92Z"/>' +
      '<path d="M15 40 q5 -8 10 0 q-5 8 -10 0Z"/><path d="M75 40 q5 -8 10 0 q-5 8 -10 0Z"/>' +
      '<path d="M0 100 L10 110 L20 100 L30 110 L40 100 L50 110 L60 100 L70 110 L80 100 L90 110 L100 100 L100 110 L0 110Z"/>';
    var face = '<circle cx="43" cy="37" r="4.5"/><circle cx="57" cy="37" r="4.5"/><path d="M47 46 l3 -4 l3 4z"/>' +
      '<path d="M42 53 h16 M46 50 v6 M50 50 v6 M54 50 v6" stroke="#fff" stroke-width="1.6"/>';
    var html = "";
    for (var i = 0; i < 9; i++) {
      html += '<svg viewBox="0 0 100 110" preserveAspectRatio="none" style="left:' + (i * 209) + 'px;animation-delay:-' + (i % 3) * 2 + 's">' +
        '<defs><mask id="alt-m' + i + '"><rect width="100" height="110" fill="#fff"/><g fill="#000">' + holes + '</g><g fill="#fff">' + face + '</g></mask></defs>' +
        '<rect width="100" height="110" fill="' + COLORES[i % COLORES.length] + '" mask="url(#alt-m' + i + ')"/></svg>';
    }
    return '<div class="alt-picado">' + html + "</div>";
  }

  function flores() {
    var items = [[20, 380, 130], [150, 460, 110], [10, 560, 150], [170, 600, 140], [60, 700, 120], [210, 760, 90],
      [40, 270, 90], [170, 330, 80], [100, 430, 100], [230, 520, 70], [10, 200, 70], [120, 230, 60], [90, 820, 130]];
    var html = "";
    items.forEach(function (f) {
      var rot = "transform:rotate(" + (f[0] * 37 % 360) + "deg)";
      html += '<div class="alt-flor" style="left:' + f[0] + "px;top:" + f[1] + "px;width:" + f[2] + "px;height:" + f[2] + "px;" + rot + '"></div>';
      html += '<div class="alt-flor" style="left:' + (1920 - f[0] - f[2]) + "px;top:" + f[1] + "px;width:" + f[2] + "px;height:" + f[2] + "px;" + rot + '"></div>';
    });
    return html;
  }

  function velas() {
    var alturas = [55, 85, 48, 75, 64, 95, 55, 75], html = "";
    alturas.forEach(function (h, i) {
      var d = "animation-delay:-" + (i * 0.37).toFixed(2) + "s";
      html += '<div class="alt-vela" style="left:' + (i * 177 + 30) + "px;height:" + h + 'px"><div class="alt-halo" style="' + d + '"></div><div class="alt-llama" style="' + d + '"></div></div>';
    });
    return '<div class="alt-velas">' + html + "</div>";
  }

  // ---------- Pétalos (solo mientras el altar está en pantalla) ----------
  var petals = [], pcx = null, running = false;
  function petal(top) {
    return { x: Math.random() * 1920, y: top ? Math.random() * 1080 : -20, r: 5 + Math.random() * 7, vy: 0.4 + Math.random() * 0.8,
      vx: -0.3 + Math.random() * 0.6, a: Math.random() * 6.28, va: -0.02 + Math.random() * 0.04,
      c: ["#F28C1B", "#F7A227", "#E07A10", "#FFB53D"][Math.floor(Math.random() * 4)] };
  }
  function frame(t) {
    if (!open) { running = false; return; }
    pcx.clearRect(0, 0, 1920, 1080);
    pcx.globalAlpha = 0.75;
    for (var i = 0; i < petals.length; i++) {
      var p = petals[i];
      p.y += p.vy; p.x += p.vx + Math.sin(t / 1500 + i) * 0.3; p.a += p.va;
      if (p.y > 1100) petals[i] = petal(false);
      pcx.save(); pcx.translate(p.x, p.y); pcx.rotate(p.a); pcx.fillStyle = p.c;
      pcx.beginPath(); pcx.scale(1, 0.55); pcx.arc(0, 0, p.r, 0, 6.283); pcx.fill(); pcx.restore();
    }
    requestAnimationFrame(frame);
  }

  // ---------- QR a /ofrenda, con la IP real de la TV ----------
  function drawQR(cv) {
    var px = cv.width, cx = cv.getContext("2d");
    cx.fillStyle = "#FBEEDD"; cx.fillRect(0, 0, px, px);
    if (!ofrendaUrl || typeof qrcode === "undefined") return;
    var qr = qrcode(0, "M");
    qr.addData(ofrendaUrl);
    qr.make();
    var n = qr.getModuleCount(), cell = px / n;
    cx.fillStyle = "#2B1A10";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      if (qr.isDark(r, c)) cx.fillRect(Math.floor(c * cell), Math.floor(r * cell), Math.ceil(cell), Math.ceil(cell));
    }
  }
  function drawQRs() {
    if (!root) return;
    drawQR($("alt-qr")); drawQR($("alt-qr-big"));
    $("alt-url").textContent = ofrendaUrl ? ofrendaUrl.replace(/^http:\/\//, "") : "buscando la dirección…";
  }

  // ---------- Fotos ----------
  function esc(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function marco(o, x, y, h) {
    var w = Math.round(h * RATIO), nameSize = Math.max(18, Math.round(h * 0.065)), msgSize = Math.round(nameSize * 0.72);
    var placa = Math.round(nameSize * 1.25 + (o.mensaje ? msgSize * 1.25 : 0) + 10);
    return '<div class="alt-marco" data-id="' + esc(o.id) + '" style="left:' + x + "px;top:" + y + "px;width:" + w + "px;height:" + h + 'px">' +
      '<div class="alt-foto" style="bottom:' + (placa + 6) + 'px"><img src="' + pc + "/altar/fotos/" + esc(o.file) + '" alt=""></div>' +
      '<div class="alt-placa"><div class="alt-nombre" style="font-size:' + nameSize + 'px">' + (esc(o.nombre) || "&nbsp;") + "</div>" +
      (o.mensaje ? '<div class="alt-mensaje" style="font-size:' + msgSize + 'px">' + esc(o.mensaje) + "</div>" : "") + "</div></div>";
  }

  function pages() { return Math.max(1, Math.ceil(ofrendas.length / PER_PAGE)); }

  // El número de columnas que deja los marcos más grandes; la última fila queda centrada.
  function layout(n) {
    var best = { cols: 1, h: 0 };
    for (var c = 1; c <= n; c++) {
      var rows = Math.ceil(n / c);
      var h = Math.min((AREA.height - (rows - 1) * GAP) / rows, ((AREA.width - (c - 1) * GAP) / c) / RATIO);
      if (h > best.h) best = { cols: c, h: Math.floor(h) };
    }
    return best;
  }

  function render() {
    root.className = "view on" + (ofrendas.length ? "" : " alt-vacio");
    if (page >= pages()) page = 0;
    visibles = ofrendas.slice().reverse().slice(page * PER_PAGE, (page + 1) * PER_PAGE);
    var n = visibles.length, html = "";
    if (n) {
      var L = layout(n), h = L.h, w = Math.round(h * RATIO), rows = Math.ceil(n / L.cols);
      var y0 = AREA.top + Math.round((AREA.height - (rows * h + (rows - 1) * GAP)) / 2);
      cols = L.cols;
      for (var r = 0; r < rows; r++) {
        var k = Math.min(cols, n - r * cols), x0 = AREA.left + Math.round((AREA.width - (k * w + (k - 1) * GAP)) / 2);
        for (var c = 0; c < k; c++) html += marco(visibles[r * cols + c], x0 + c * (w + GAP), y0 + r * (h + GAP), h);
      }
    }
    $("alt-fotos").innerHTML = html;
    var dots = "";
    if (pages() > 1) for (var i = 0; i < pages(); i++) dots += '<span style="opacity:' + (i === page ? 1 : 0.35) + '">•</span> ';
    $("alt-pagina").innerHTML = dots;
    if (pick) markPick();
  }

  setInterval(function () {
    if (!open || spotlight || pick || pages() <= 1) return;
    $("alt-fotos").className = "alt-fotos fade";
    setTimeout(function () { page = (page + 1) % pages(); render(); $("alt-fotos").className = "alt-fotos"; }, 800);
  }, PAGE_MS);

  // ---------- Nueva ofrenda: se destaca en grande unos segundos ----------
  function next() {
    var o = queue.shift();
    if (!o || !open) { spotlight = false; queue = []; return; }
    spotlight = true;
    var img = new Image();
    img.onload = img.onerror = function () {
      $("alt-destacado").innerHTML = '<div class="alt-aviso">Una nueva ofrenda llega al altar</div>' + marco(o, Math.round((1920 - 640 * RATIO) / 2), 230, 640);
      $("alt-destacado").className = "alt-destacado on";
      setTimeout(function () {
        $("alt-destacado").className = "alt-destacado";
        page = 0; render();
        setTimeout(next, 1200);
      }, SPOTLIGHT_MS);
    };
    img.src = pc + "/altar/fotos/" + o.file;
  }

  // ---------- Quitar fotos con el control remoto ----------
  var helpTimer;
  function help(text, bad, ms) {
    var el = $("alt-ayuda");
    el.textContent = text;
    el.className = "alt-ayuda on" + (bad ? " bad" : "");
    clearTimeout(helpTimer);
    if (ms) helpTimer = setTimeout(function () { el.className = "alt-ayuda"; }, ms);
  }
  function markPick() {
    var els = $("alt-fotos").children;
    if (pick.i >= els.length) pick.i = els.length - 1;
    for (var i = 0; i < els.length; i++) els[i].className = "alt-marco" + (i === pick.i ? (pick.confirm ? " sel borrar" : " sel") : "");
    var o = visibles[pick.i];
    if (!o) return;
    help(pick.confirm ? "OK otra vez para quitar " + (o.nombre ? "a " + o.nombre : "esta foto") + " · Atrás: cancelar"
      : "Flechas: elegir foto · OK: quitarla · Atrás: terminar", pick.confirm);
  }
  function endPick() { pick = null; render(); $("alt-ayuda").className = "alt-ayuda"; }

  function movePick(k) {
    var i = pick.i, n = visibles.length;
    if (k === KEY.LEFT) i--;
    if (k === KEY.RIGHT) i++;
    if (k === KEY.UP) i -= cols;
    if (k === KEY.DOWN) i += cols;
    if (i >= n && page < pages() - 1) { page++; pick.i = 0; pick.confirm = false; render(); return; }
    if (i < 0 && page > 0) { page--; render(); pick.i = visibles.length - 1; pick.confirm = false; markPick(); return; }
    pick.i = Math.max(0, Math.min(n - 1, i));
    pick.confirm = false;
    markPick();
  }

  function remove(id) {
    ofrendas = ofrendas.filter(function (x) { return x.id !== id; });
    queue = queue.filter(function (x) { return x.id !== id; });
  }

  // ---------- Lo que usa app.js ----------
  return {
    init: function (pcUrl) {
      pc = pcUrl;
      root = $("altar");
      root.innerHTML = picado() + '<div class="alt-titulo">Altar de <em>nuestros</em> seres queridos</div>' + flores() +
        '<div class="alt-fotos" id="alt-fotos"></div><div class="alt-pagina" id="alt-pagina"></div>' +
        '<div class="alt-sin"><canvas id="alt-qr-big" width="324" height="324"></canvas>' +
        '<p>Escanea el código con tu celular y coloca la foto de tu ser querido en el altar</p><small id="alt-url"></small></div>' +
        velas() +
        '<div class="alt-qr"><canvas id="alt-qr" width="182" height="182"></canvas><p>Escanea y coloca<br>tu ofrenda</p></div>' +
        '<canvas class="alt-petalos" id="alt-petalos" width="1920" height="1080"></canvas>' +
        '<div class="alt-destacado" id="alt-destacado"></div><div class="alt-ayuda" id="alt-ayuda"></div>';
      pcx = $("alt-petalos").getContext("2d");
      for (var i = 0; i < 28; i++) petals.push(petal(true));
      drawQRs();
      load();
    },
    isOpen: function () { return open; },
    // Destacar una ofrenda que llegó justo antes de abrir el altar.
    highlight: function (o) { if (!open) return; queue.push(o); if (!spotlight) next(); },
    open: function () {
      open = true; page = 0; pick = null;
      render();
      if (!running) { running = true; requestAnimationFrame(frame); }
      if (ofrendas.length) help("OK: quitar una foto · Atrás: volver al inicio", false, 6000);
    },
    close: function () {
      open = false; spotlight = false; queue = []; pick = null;
      $("alt-destacado").className = "alt-destacado";
      $("alt-ayuda").className = "alt-ayuda";
    },
    // Las teclas del control mientras el altar está en pantalla. false = que app.js haga lo suyo (Atrás → inicio).
    key: function (k) {
      if (!pick) {
        if (k === KEY.OK && ofrendas.length && !spotlight) { pick = { i: 0, confirm: false }; render(); return true; }
        return !(k === KEY.BACK || k === KEY.ESC);
      }
      if (k === KEY.LEFT || k === KEY.RIGHT || k === KEY.UP || k === KEY.DOWN) { movePick(k); return true; }
      if (k === KEY.BACK || k === KEY.ESC) { if (pick.confirm) { pick.confirm = false; markPick(); } else endPick(); return true; }
      if (k === KEY.OK) {
        var o = visibles[pick.i];
        if (!o) return true;
        if (!pick.confirm) { pick.confirm = true; markPick(); return true; }
        request("POST", pc + "/api/altar/quitar", { id: o.id }, function (r) {
          if (!r) { help("No pude quitar la foto", true, 4000); return; }
          remove(o.id);
          if (!ofrendas.length) { endPick(); return; }
          pick.confirm = false; render();
        });
        return true;
      }
      return true;
    },
    // Mensajes del canal en vivo. Devuelve true si llegó una ofrenda nueva.
    live: function (op) {
      if (op.t === "state") { load(); return false; } // (re)conexión: la lista pudo cambiar mientras tanto
      if (op.t === "altar-quitar") { remove(op.id); if (open && !spotlight) render(); return false; }
      if (op.t !== "altar" || !op.ofrenda) return false;
      for (var i = 0; i < ofrendas.length; i++) if (ofrendas[i].id === op.ofrenda.id) return false;
      ofrendas.push(op.ofrenda);
      if (open) {
        if (pick) endPick();
        queue.push(op.ofrenda);
        if (!spotlight) next();
      }
      return true;
    }
  };
})();
