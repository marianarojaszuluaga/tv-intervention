// Valores de respaldo, iguales para todas las TVs. Lo personal (nombre, trato, ciudad, tema, apps ocultas,
// bloques del inicio) NO va aquí: vive en la TV (/media/internal/retrotv/config.json) y se cambia
// desde el control del teléfono → Ajustes, sin reinstalar.
var CONFIG = {
  // El servidor vive dentro de la TV (servicio com.mariana.retrotv.service).
  pc: "http://127.0.0.1:8765",

  // Ajustes mientras el servidor arranca (la primera vez; luego se usa el último que llegó).
  defaults: {
    name: "", plural: false, greeting: "auto", olaKeAse: true, city: "", theme: "terminal",
    hidden: ["LG Channels", "LG Gaming Portal"],
    blocks: { weather: true, inputs: true, apps: true, pad: true, qr: true }
  },

  // Apps del dock si la TV no deja leer la lista instalada (y su orden preferido).
  // id = identificador de webOS; las que no existan se ocultan solas al fallar.
  apps: [
    { id: "netflix", title: "Netflix" },
    { id: "youtube.leanback.v4", title: "YouTube" },
    { id: "amazon", title: "Prime Video" },
    { id: "com.disney.disneyplus-prod", title: "Disney+" },
    { id: "spotify-beehive", title: "Spotify" },
    { id: "com.webos.app.browser", title: "Navegador" },
    { id: "com.palm.app.settings", title: "Ajustes" }
  ],

  // Entradas si la TV no deja leer cuáles tiene.
  inputs: [
    { id: "com.webos.app.livetv", title: "TV" },
    { id: "com.webos.app.hdmi1", title: "HDMI 1" },
    { id: "com.webos.app.hdmi2", title: "HDMI 2" },
    { id: "com.webos.app.hdmi3", title: "HDMI 3" },
    { id: "com.webos.app.externalinput.av1", title: "AV" }
  ]
};
