# Plan: Terminal como adición a cleanyourtv

Encaje del kit (servidor en la TV, ajustes desde el teléfono, temas, nombre y trato, pad en vivo) en
[Gathin23/cleanyourtv](https://github.com/Gathin23/cleanyourtv), siguiendo sus reglas (`AGENTS.md`,
`addons/README.md`, `docs/modules.md`, `docs/specs/card.md`, `themes/README.md`, `SHOWCASE.md`).
Revisado sobre `main` @ `718f98c` (29 oct 2026). Todavía no hay código Android escrito.

## 1. Lo que dice el repo y cómo condiciona el diseño

| Regla del repo | Consecuencia para Terminal |
|---|---|
| Add-on = app Android TV propia en `addons/<nombre>/`, con su Gradle, README con sección **Permissions**, `screenshot.jpg` 16:9 de una **TV real**, una fila en `addons/README.md`. `tests/test_addons.py` y `test_addon_permissions_index.py` lo verifican | El núcleo multiplataforma es un add-on **Android TV**: `addons/terminal/` |
| Un add-on habla con el launcher **solo** por la module card (`DOCK_CARD` + `res/xml/module_card.xml`). Nunca toca `launcher/` | Terminal es una tarjeta del launcher que abre su propia pantalla. **No** reemplaza el Home (en Android el Home es el launcher de cleanyourtv) |
| El launcher no tiene red, ni servicios, ni lee nada de las apps salvo la tarjeta (y el proveedor `game_day`) | El servidor HTTP, el clima y el pad viven en el add-on, nunca en el launcher |
| "Un port a otra plataforma → tu propio repositorio + una fila en `SHOWCASE.md`". Ya hay 4 ports webOS listados en **Other platforms: Fire TV and LG webOS** | El port **webOS** (lo que ya existe en `retro-tv-kit/`) va en un repo propio de Mariana y se enlaza en `SHOWCASE.md`, no dentro de `addons/` |
| Los temas del launcher son `themes/<nombre>/config.json` que se empujan por ADB con `tools/theme.sh`, sin recompilar. Ya existe `greeting_name` ("GOOD MORNING, NAME") y un tema `retro/` | El saludo y el tema **del launcher** se ponen desde el PC con un tema; el teléfono no los puede cambiar (el launcher no lee la red). El add-on tiene sus propios 4 temas para su pantalla |
| Sin APKs en el repo, sin telemetría, nada de IPs, nombres de Wi-Fi ni nombres de personas en commits o capturas | El nombre y la ciudad solo viven en la TV; la captura se toma con un nombre genérico o borroso |
| Toda novedad apagada por defecto; las TVs tienen 1 GB de RAM | El servidor corre solo mientras la pantalla de Terminal está abierta; dejarlo siempre encendido es una opción explícita |

## 2. Arquitectura propuesta

Un **contrato común** (la API HTTP que ya existe en `service/service.js`) y dos implementaciones:

```
                    teléfono (navegador)
           /control: Control · Apps · Pad · Ajustes
                          │  HTTP en la red de la casa
         ┌────────────────┴────────────────┐
  Android TV / Google TV              LG webOS
  addons/terminal/  (cleanyourtv)     repo propio "terminal-webos" (fila en SHOWCASE.md)
  Java: servidor HTTP mínimo          Node 12: service/service.js (ya hecho)
  pantalla nativa (Canvas)            app web ES5 (ya hecha)
```

La API, igual en las dos plataformas:

| Ruta | Qué hace |
|---|---|
| `GET /control`, `/`, `/icon.png`, `/manifest.webmanifest` | Las páginas del teléfono y del computador (mismos `telefono.html` y `computador.html`) |
| `GET/POST /api/config` | Ajustes de la TV: `name`, `plural`, `greeting`, `olaKeAse`, `city`, `theme`, `hidden`, `blocks` (validados en el servidor, como hoy) |
| `POST /api/live`, `GET /api/live/stream` (SSE) | Pad en vivo (`start`/`pts`/`undo`/`clear`/`aspect`, colores `"1".."4"` del tema) y el aviso `{t:"config"}` |
| `GET/POST /api/notes`, `/notas/*.png` | Dibujos guardados |
| `GET /api/tv/apps`, `POST /api/remote` | Apps y control. Lo que cada plataforma puede hacer cambia (sección 4); el teléfono pregunta `GET /api/health` → `{"can": [...]}` y esconde lo que no hay |

Así `telefono.html` es **un solo archivo** para las dos plataformas: se copia a `addons/terminal/app/src/main/assets/www/`
y al repo webOS. El único cambio frente a hoy es leer `can` y esconder botones que la plataforma no tiene.

### El add-on Android: `addons/terminal/`

| Pieza | Cómo |
|---|---|
| Paquete | `io.github.<usuario-github>.terminal` (como los demás add-ons: el del autor), minSdk 26, compileSdk/targetSdk 34, Java sin dependencias (como `weather` y `ad-blocking`) |
| Tarjeta | `<card spec="1" label="Terminal" caption="pad y control" accent="#3CF2A0" />` en la actividad con `LEANBACK_LAUNCHER`. "Terminal" choca con la regla de nombres solo si en esa TV hay otra app llamada así (p. ej. un emulador de terminal); alternativa: "Pad" |
| Pantalla de la TV | Actividad nativa: saludo con nombre y trato, reloj, clima (Open-Meteo, como el add-on `weather`), el pad (una `View` con `Canvas`) y el QR. Los 4 temas como paletas en Java con los mismos colores y contraste AA que `app/style.css`. **Sin WebView**: en TVs de 1 GB pesa, y algunas listas de limpieza lo desactivan |
| Servidor | `ServerSocket` en el puerto 8765, hilo propio, solo IPs privadas (como `isLocal` de hoy), SSE a mano. Unas 400 líneas; el repo prefiere esto a meter NanoHTTPD |
| Cuándo corre | **Por defecto**, solo con la pantalla de Terminal abierta (sin servicio en segundo plano, que es lo que pide `docs/modules.md`). **Opción "Pad siempre listo"**: un foreground service `specialUse` con notificación y arranque al encender (lo mismo que ya declaran `brightness`, `quiet-hours` y `tv-static`) |
| Ajustes | `SharedPreferences` en la TV, cambiados desde el teléfono → Ajustes; la pantalla los aplica en vivo |
| QR | Generador QR propio en Java o el de Kazuhiko Arase (MIT) copiado como un archivo, con la IP de `NetworkInterface` |
| Instalación | `install.sh` + `install.ps1` como los demás (compila con `gradlew`, instala con `tools/tv.py`, que ya funciona en Windows); entra solo en `tools/manage.py install terminal` |

### El port webOS: repo propio

`retro-tv-kit/` tal como está hoy, más dos cosas: `/api/health` responde `can` y el `telefono.html` compartido.
README que enlaza a cleanyourtv y diga "no root, Developer Mode", y **una fila** en `SHOWCASE.md` → "Other platforms"
(PR aparte, título `SHOWCASE: add Terminal for LG webOS`). Allí no aplica el reemplazo del Home de LG, igual que en los otros ports.

### Temas

- **La pantalla de Terminal** (las dos plataformas): Terminal, Ámbar CRT, Synthwave, Minimal claro, elegidos desde el teléfono.
- **El launcher de cleanyourtv**: no se puede cambiar desde el teléfono. Para que el inicio combine, un tema
  `themes/terminal/` con claves existentes (`background_color: #120A18`, `greeting_name`, borde como `retro/`, sin brillo de color)
  sería un **PR separado** y exige su propia captura en una TV real (`docs/workflows/theme.md`). Opcional, después.

## 3. Equivalencias por función

| Función | webOS (hecho) | Android TV / Google TV (add-on) |
|---|---|---|
| Servidor en la TV | Servicio Node de webOS, revivido por el activity manager | `ServerSocket` en el add-on; con la pantalla abierta, u opción de foreground service |
| Ajustes desde el teléfono | Sí | Sí, igual |
| Temas | 4, en vivo | 4, en vivo (solo en la pantalla del add-on) |
| Nombre y trato | En la pantalla de Terminal | En la pantalla de Terminal. En el launcher, con `greeting_name` de un tema (PC + ADB) |
| Pad en vivo | Sí | Sí, en la pantalla de Terminal |
| QR con la IP propia | Sí | Sí |
| Clima | Sí | Sí (permiso `INTERNET`) |
| Reemplazar el Home | Sí (vigila la pantalla y abre Terminal) | **No**: el Home es el launcher de cleanyourtv. Terminal es una tarjeta |
| Apps ocultas | En la pantalla de Terminal | En la pantalla de Terminal; las del launcher siguen en `hidden_apps` |

## 4. Lo que Android no deja (o deja con condiciones)

| Lo que se quiere | En Android TV | Propuesta |
|---|---|---|
| Servidor HTTP siempre disponible | Una app sin actividad visible se congela; servir en segundo plano exige **foreground service** con notificación, y en Android 14 un tipo (`specialUse` + `FOREGROUND_SERVICE_SPECIAL_USE`) | Por defecto solo con la pantalla abierta; foreground service como opción |
| Que el pad **se abra solo** cuando alguien dibuja | Desde Android 10, abrir una actividad desde segundo plano está bloqueado salvo con **"mostrar sobre otras apps"** (`SYSTEM_ALERT_WINDOW`, que en TV se concede por ADB) | Opcional, apagado. Sin él, el pad se ve al abrir la tarjeta |
| Control direccional (flechas/OK) desde el teléfono | Una app no puede inyectar teclas. Solo un **servicio de accesibilidad** puede, y las flechas/OK como acción global existen desde **Android 13** (API 33). En 9–12 no hay manera sin root/ADB | Fase 2 y opcional. Mientras tanto, la pestaña Control remite a la app **Google TV** del teléfono, que ya es un control |
| Volumen y silencio | `AudioManager`, sin permiso | Sí |
| Apagar la TV | Requiere permisos de sistema | **No** en Android. El botón se esconde (`can`) |
| Abrir apps y entradas desde el teléfono | La lista sí (`<queries>` con `LEANBACK_LAUNCHER`); abrirlas desde el servidor es "abrir desde segundo plano" | Con la pantalla de Terminal al frente funciona; desde segundo plano, solo con el permiso de superposición |
| Lista de apps con íconos | `PackageManager` da íconos y banners locales | Sí, más simple que en webOS |
| Mantener la pantalla despierta mientras se dibuja | `FLAG_KEEP_SCREEN_ON` mientras la actividad está abierta | Sí, sin permiso |

Permisos de la primera versión: **`INTERNET`** (clima y servidor). Con la opción "Pad siempre listo":
`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE`, `RECEIVE_BOOT_COMPLETED`. Todo listado en el README
y en la columna Permissions de `addons/README.md`, como exige el test.

## 5. Fases

1. **Contrato compartido** (en `retro-tv-kit/`): `/api/health` con `can`, `telefono.html` que esconda lo que no hay. Pequeño, verificable con el simulador.
2. **Add-on mínimo** `addons/terminal/`: tarjeta, pantalla (saludo, trato, reloj, clima, 4 temas, pad, QR) y servidor mientras está abierta. Pruebas unitarias en Java como los demás add-ons (servidor, validación de ajustes, pad).
3. **Prueba en una Android TV real** + `screenshot.jpg` + fila en `addons/README.md` → PR `addons: Terminal, a live pad and phone settings`.
4. **Repo webOS propio** + fila en `SHOWCASE.md` (PR aparte).
5. Opcionales: "Pad siempre listo" (foreground service), abrir el pad solo (superposición), flechas por accesibilidad (Android 13+), `themes/terminal/`.

## 6. Lo que hace falta decidir o conseguir

- **Una Android TV o Google TV real** para probar: el repo no acepta un add-on sin "Tested on" ni captura de una TV real. ¿Hay una disponible?
- **Cuenta de GitHub** desde la que se abre el PR (da el nombre del paquete `io.github.<usuario>.terminal`) y una llave de firma propia que se guarde fuera del repo.
- ¿El repo webOS propio se publica (es lo que pide el repo para un port), o el port webOS se queda privado y solo va el add-on?
- Nombre de la tarjeta: "Terminal" o "Pad".
