# Terminal — kit para cualquier TV webOS

Inicio retro para TVs LG/webOS (probado en Hyundai webOS TV Lite 7.5), instalado por Developer Mode
(`com.mariana.retrotv`, título **Terminal**): saludo, reloj, clima, entradas, apps, pad en vivo
y control remoto en el teléfono. **Un solo paquete para todas las TVs**: lo personal se configura en cada TV.

| Parte | Dónde | Qué hace |
|---|---|---|
| `app/` | TV | Inicio. Temas, textos y bloques salen de los ajustes de la TV y cambian en vivo. QR generado en la TV con su propia IP (`qrcode.js`, MIT) |
| `service/` | TV | Servidor (Node 12, `com.mariana.retrotv.service`, puerto 8765): control del teléfono, pad en vivo, apps e íconos, Home → Terminal, ajustes (`/api/config`) |
| `pc/telefono.html`, `pc/computador.html` | Teléfono / navegador | Páginas que sirve el servicio (se copian a `service/www` al empaquetar) |
| `app/altar.js`, `app/altar.css`, `pc/ofrenda.html` | TV / teléfono de los invitados | **Altar de muertos**: ver abajo |
| `instalar-en-otra-tv.ps1` | Computador (Windows) | Instalador guiado. Ver **[GUIA-OTRA-TV.md](GUIA-OTRA-TV.md)** |
| `docs/` | — | [TV-INSTALADA.md](docs/TV-INSTALADA.md): lo hecho en la primera TV · [CLEANYOURTV.md](docs/CLEANYOURTV.md): referencia del repo cleanyourtv |
| `android/terminal/` | Android TV / Google TV | **Add-on para [cleanyourtv](https://github.com/Gathin23/cleanyourtv)** (va a `addons/terminal/`): la misma API y el mismo `telefono.html` (copiado en `app/src/main/assets/www/`), pantalla nativa. Ver su [README](android/terminal/README.md) |
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
| `blocks` | `weather`, `inputs`, `apps`, `pad`, `qr`, `altar`: `false` lo quita del inicio |

## Lo que sabe hacer cada TV

`GET /api/health` responde `can`: la lista de lo que la plataforma puede hacer (`dpad`, `volume`, `power`, `apps`,
`inputs`, `home`, `lgHome`, `pad`, `notes`, `settings`, `altar`, `homeApps`). El teléfono esconde lo que no esté, así el
mismo `telefono.html` sirve en webOS (todo) y en Android TV (sin flechas, sin apagar, sin entradas, sin altar ni apps en
el inicio; ver [PLAN-CLEANYOURTV.md](PLAN-CLEANYOURTV.md)).
El botón HOME manda `{"home": true}` y cada servidor abre su propia app. Para probar otra lista en el simulador:
`TERMINAL_CAN=volume,apps,home,pad,notes,settings node dev/simular-tv.js`.

## Temas

Variables CSS en `app/style.css` (y las mismas en `pc/telefono.html` y `pc/computador.html`). Todo el texto
cumple contraste AA (≥ 4.5:1) contra el fondo y las tarjetas. Terminal y Ámbar llevan barrido CRT;
Synthwave y Minimal no. Minimal además quita el cursor y el resplandor, y usa Plex en vez de la letra de terminal.
El pad manda colores del tema (`"1"`..`"4"` → `--ink1..4`), así los trazos se ven en cualquier tema.

## Empaquetar e instalar

```bash
cp pc/telefono.html pc/computador.html pc/icon-180.png pc/ofrenda.html pc/heic2any.min.js service/www/
ares-package app service -o dist
# y la misma página para el add-on de Android:
cp pc/telefono.html pc/computador.html pc/icon-180.png android/terminal/app/src/main/assets/www/
```

En otra TV: `instalar-en-otra-tv.ps1` (Windows). Desde bash: `TV_KEY=<llave sin passphrase> sh instalar.sh <ip-tv>`.
`ares-install` no conecta con estas TVs (piden `ssh-rsa`); ambos scripts usan OpenSSH.

## Altar de muertos

Mosaico **Altar** al inicio de las apps (se quita en el teléfono → Ajustes → *Altar de muertos*). Abre a pantalla
completa un altar con papel picado, cempasúchil, velas y pétalos. Los invitados escanean el QR del altar
(`http://<ip-tv>:8765/ofrenda`, tienen que estar en la Wi-Fi de la casa), eligen una foto y opcionalmente un nombre
y unas palabras; la foto sale en grande unos segundos ("Una nueva ofrenda llega al altar") y luego en su marco.

- **El teléfono convierte la foto** (JPEG, PNG, HEIC/HEIF, WebP…) a JPEG de 1100 px antes de subirla
  (`heic2any`, MIT, va en el paquete). Así la TV solo recibe fotos livianas.
- **En vivo**: `POST /api/altar?nombre=&mensaje=` (cuerpo: la imagen) guarda en `/media/internal/retrotv/altar/` y
  lo anuncia por `/api/live/stream` (`{t:"altar"}` / `{t:"altar-quitar"}`). `GET /api/altar` da la lista.
- **Quitar fotos solo con el control**: en el altar, OK → flechas para elegir → OK dos veces. `POST /api/altar/quitar`
  solo acepta peticiones de la propia TV (127.0.0.1), no de los teléfonos.
- Mientras el altar está en pantalla la TV **no pone el protector**. Si llega una foto con el inicio de Terminal
  en pantalla, el altar se abre solo.
- 12 fotos por pantalla; con más, rotan cada 14 s (constantes al inicio de `app/altar.js`).

## Ojo

- **Developer Mode caduca**: en esa TV, app Developer Mode → **EXTEND** antes de que llegue a cero, o LG borra la app.
- La primera vez, la TV pide permiso para la conexión de LG: hay que aceptarlo con el control.
- El servidor solo responde a la red de la casa (IPs privadas). Ajustes, pad y apagar la TV quedan abiertos a quien esté en esa Wi-Fi.
- `lgtv-key.json` (el permiso de LG, en la TV) y la llave de Developer Mode no van nunca en esta carpeta.
