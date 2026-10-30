# Terminal — kit para cualquier TV webOS

Inicio retro para TVs LG/webOS (probado en Hyundai webOS TV Lite 7.5), instalado por Developer Mode
(`com.mariana.retrotv`, título **Terminal**): saludo, reloj, clima, entradas, apps, pad en vivo
y control remoto en el teléfono. **Un solo paquete para todas las TVs**: lo personal se configura en cada TV.

| Parte | Dónde | Qué hace |
|---|---|---|
| `app/` | TV | Inicio. Temas, textos y bloques salen de los ajustes de la TV y cambian en vivo. QR generado en la TV con su propia IP (`qrcode.js`, MIT) |
| `service/` | TV | Servidor (Node 12, `com.mariana.retrotv.service`, puerto 8765): control del teléfono, pad en vivo, apps e íconos, Home → Terminal, ajustes (`/api/config`) |
| `pc/telefono.html`, `pc/computador.html` | Teléfono / navegador | Páginas que sirve el servicio (se copian a `service/www` al empaquetar) |
| `instalar-en-otra-tv.ps1` | Computador (Windows) | Instalador guiado. Ver **[GUIA-OTRA-TV.md](GUIA-OTRA-TV.md)** |
| `dev/simular-tv.js` | Computador | Prueba sin TV: `node dev/simular-tv.js` → app de la TV en :8766, control en :8765/control |

## Ajustes de cada TV

Viven en la TV en `/media/internal/retrotv/config.json` (sobreviven reinicios y reinstalaciones) y se cambian
desde el teléfono → **Ajustes**. El servicio los da en `GET /api/config` y los cambia con `POST /api/config`
(solo los campos enviados); cada cambio llega a la TV por el mismo canal SSE del pad (`/api/live/stream`).

| Campo | Valores |
|---|---|
| `name` | Nombre del saludo (vacío = sin nombre) |
| `plural` | `true` → "¿qué vemos hoy?", "nuestras entradas" · `false` → "¿qué ves hoy?", "tus entradas" |
| `greeting` | `auto` (por la hora), `dias`, `tardes`, `noches`, `ola` |
| `olaKeAse` | En `auto`, una hora de cada cuatro saluda "ola ke ase?" |
| `city` | Ciudad del clima (Open-Meteo, sin clave) |
| `theme` | `terminal`, `ambar`, `synthwave`, `minimal` |
| `hidden` | Apps que no salen en el inicio (por id; también acepta el nombre) |
| `blocks` | `weather`, `inputs`, `apps`, `pad`, `qr`: `false` lo quita del inicio |

## Temas

Variables CSS en `app/style.css` (y las mismas en `pc/telefono.html` y `pc/computador.html`). Todo el texto
cumple contraste AA (≥ 4.5:1) contra el fondo y las tarjetas. Terminal y Ámbar llevan barrido CRT;
Synthwave y Minimal no. Minimal además quita el cursor y el resplandor, y usa Plex en vez de la letra de terminal.
El pad manda colores del tema (`"1"`..`"4"` → `--ink1..4`), así los trazos se ven en cualquier tema.

## Empaquetar e instalar

```bash
cp pc/telefono.html pc/computador.html pc/icon-180.png service/www/
ares-package app service -o dist
```

En otra TV: `instalar-en-otra-tv.ps1` (Windows). Desde bash: `TV_KEY=<llave sin passphrase> sh instalar.sh <ip-tv>`.
`ares-install` no conecta con estas TVs (piden `ssh-rsa`); ambos scripts usan OpenSSH.

## Ojo

- **Developer Mode caduca**: en esa TV, app Developer Mode → **EXTEND** antes de que llegue a cero, o LG borra la app.
- La primera vez, la TV pide permiso para la conexión de LG: hay que aceptarlo con el control.
- El servidor solo responde a la red de la casa (IPs privadas). Ajustes, pad y apagar la TV quedan abiertos a quien esté en esa Wi-Fi.
- `lgtv-key.json` (el permiso de LG, en la TV) y la llave de Developer Mode no van nunca en esta carpeta.
