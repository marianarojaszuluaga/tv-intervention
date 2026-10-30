# Referencia: Gathin23/cleanyourtv

Resumen del repo de referencia para trabajar sobre él sin releerlo entero.
Revisado en `main` @ `718f98c` (29 oct 2026). Repo: https://github.com/Gathin23/cleanyourtv (MIT).
Lo que dice aquí es de esa fecha; ante la duda manda el repo (`AGENTS.md`, `CONTRIBUTING.md`).

## Qué es

Un kit para limpiar Android TV / Google TV **sin root**: listas de paquetes que se desactivan por ADB
(`pm disable-user`, nunca desinstalar), un launcher propio liviano que reemplaza el Home, temas que se
empujan sin recompilar y add-ons opcionales que se ven como tarjetas en ese launcher.
La gente pega `PROMPT.md` en su agente (Claude Code, Codex, Gemini…) y el agente limpia la TV.

No sirve para webOS, Tizen, Roku, VIDAA ni SmartCast: para esas está https://cleanyour.tv/not-android.

## Mapa del repo

| Ruta | Qué hay |
|---|---|
| `PROMPT.md` | El procedimiento para limpiar una TV. Tiene las reglas de seguridad |
| `AGENTS.md` (`CLAUDE.md`, `GEMINI.md` apuntan aquí) | Reglas para agentes: qué trabajo es, dónde va cada cambio, reglas duras |
| `CONTRIBUTING.md` | Guía para personas; "Where does my idea go?" decide el destino de cada idea |
| `README.md` (+ de, it, ja, nl, vi, zh-CN, zh-TW) | Portada; las tablas de TVs las genera `tools/gen_tables.py` |
| `SHOWCASE.md` | Proyectos en repos propios (151 al revisar). Sección **Other platforms: Fire TV and LG webOS** |
| `examples/<tv>/` | Una carpeta por modelo probado: `debloat.txt`, `tv.json`, a veces `README.md` y `config.json` |
| `launcher/` | Launcher `com.gathin.tvhome`: Java, RecyclerView + DynamicAnimation, `minSdk` 26, **sin `INTERNET`**, APK < 576 KB |
| `themes/<nombre>/` | `config.json` + `screenshot.jpg` obligatorio (+ fondos). Claves en `themes/README.md` |
| `addons/<nombre>/` | Apps opcionales con tarjeta (30 al revisar). Índice en `addons/README.md` |
| `tools/` | `tv.py` (cliente ADB en Python, funciona en Windows), `disable.sh/.ps1`, `restore.sh/.ps1`, `theme.sh/.ps1`, `check.py`, `manage.py`, `adb-closed.py`, `bench.py`, `trace.py`… Uso en sus primeras líneas; las grandes tienen `tools/*.md` |
| `docs/` | `modules.md` (contrato de tarjeta, versión corta), `specs/card.md` (contrato completo), `workflows/*.md`, `TROUBLESHOOTING.md`, `launcher.md`, `restore.md`, `faq.md` |
| `tests/` | `unittest` de Python: listas, tablas, temas, add-ons, Home guard, herramientas contra TVs falsas |
| `.github/maintainer/MAINTAINER.md` | Política que aplican el mantenedor y el bot de PRs |

## Dónde va cada cosa

| Cambio | Destino |
|---|---|
| Lista de una TV, arreglo, traducción, docs, arreglo de una herramienta | PR al repo |
| Interruptor pequeño del launcher, apagado por defecto | PR (`docs/workflows/launcher-switch.md`) |
| Look nuevo con claves que ya existen | `themes/<nombre>/` |
| Widget o pantalla que puede ser su propia app | `addons/<nombre>/` (tarjeta; nunca toca `launcher/`) |
| Launcher nuevo, restyle pesado, **port a otra plataforma**, permisos o red nuevos en el launcher, bajar `minSdk` | **Repo propio + una fila en `SHOWCASE.md`** |
| Reglas de seguridad, Home guard, paquetes protegidos, CI, límite de tamaño | Issue para el mantenedor, no PR |

## Add-ons (`docs/workflows/addon.md`)

1. `addons/<nombre>/` es un proyecto Gradle propio: `settings.gradle`, `build.gradle`, módulo `app`,
   `gradlew` y `gradlew.bat` copiados de otro add-on, y el `.gitignore` de un vecino.
   Paquete propio, normalmente `io.github.<usuario>.<nombre>`. minSdk 26, target/compile 34.
2. Habla con el launcher **solo** por la tarjeta. `launcher/` no cambia ni menciona `addons/`.
3. `README.md` con sección **Permissions**: cada permiso con su nombre del manifest y por qué,
   más red o servicios en segundo plano.
4. `screenshot.jpg`: en una **TV real**, JPEG 16:9 (1280x720 basta), < 300 KB, sin Wi-Fi ni datos personales.
5. Una fila en `addons/README.md`: `| [Nombre](carpeta/) | qué hace | autor | Tested on | Permissions | <img …> |`.
   La columna Permissions usa las palabras de la tabla ("start at boot", "overlay", "foreground service", `INTERNET`).
6. Sin APKs en el repo. CI (`addons.yml`) compila los que cambian con `./gradlew --no-daemon assembleRelease`.
7. Tests que lo vigilan: `test_addons.py`, `test_addon_permissions_index.py`, `test_addon_local_properties_ignored.py`.

Ejemplo simple para copiar estructura: `addons/weather/` (Java sin dependencias, Open-Meteo, solo `INTERNET`).
Con foreground service y arranque: `quiet-hours/`, `brightness/`, `tv-static/`.

### La tarjeta (`docs/modules.md`, `docs/specs/card.md`)

En la actividad que ya tiene `LEANBACK_LAUNCHER`, un segundo filtro y un meta-data:

```xml
<intent-filter>
    <action android:name="android.intent.action.MAIN" />
    <category android:name="com.gathin.tvhome.category.DOCK_CARD" />
</intent-filter>
<meta-data android:name="com.gathin.tvhome.card" android:resource="@xml/module_card" />
```

`res/xml/module_card.xml`: `<card spec="1" label="…" caption="…" accent="#RRGGBB" />`

- `label`: 1–24 caracteres (letras, dígitos, espacio, `. & + ' -`). Se rechaza si coincide con el nombre
  de otra app instalada, con nombres del launcher o entradas (HDMI), o con "verified"/"official".
  Cambiarlo después obliga a la persona a aceptar de nuevo.
- `caption`: opcional, ≤ 32 caracteres; label + caption caben ~26 en la cuadrícula de 4 columnas.
- `accent`: color del brillo con foco. Valores literales, sin `@string`.
- La actividad debe estar exportada y habilitada. Al pulsar Home la primera vez, el launcher pregunta Show/Hide.

## Temas (`docs/workflows/theme.md`, `themes/README.md`)

- `themes/<nombre>/config.json` solo con claves de la tabla; se parte de `themes/default/config.json`.
- Se prueba con `TV_HOST=<ip tv> tools/theme.sh themes/<nombre>` (o `theme.ps1`) y se toma `screenshot.jpg`
  en TV real (1280x720, ≤ 300 KB). Fila en `themes/README.md` y subir el conteo de temas en
  `README.md`, `README.de.md`, `README.nl.md` (`test_readme_theme_count.py`).
- Claves útiles para nosotros: `greeting_name`, `show_greeting`, `greeting`, `accent_color`, `background_color`,
  `hidden_apps`, `dock_apps`, `module_cards`, `reduced_motion`, `animations`, `wallpaper*`, `festival`.
  Temas existentes: aurora, cinematic, default, dussehra, glass, halloween, nature-calm, retro, ruska, scenes, six-columns, sweden.
- Un look que necesite una clave nueva es primero un interruptor del launcher, en su propio PR.

## SHOWCASE (`docs/workflows/showcase.md`)

1. Una fila en la sección que toque (para webOS: **Other platforms**) y el proyecto en "Find a project by TV brand",
   en la línea que ya tiene esa marca (nunca una segunda viñeta; `test_showcase_brand_index.py`).
2. Subir los dos conteos: `N projects so far.` en `SHOWCASE.md` y el número en palabras en `README.md`
   (`test_showcase_project_count.py`).
3. Cada celda en una línea: qué es, en qué TV se probó, autor. Proyecto abierto y que se pueda compilar.
4. Captura en la descripción del PR.

## Reglas duras (las que más afectan)

- **Nada de identificadores** en commits, listas o capturas: IPs, Wi-Fi, correos, seriales, MAC, llaves ADB.
  En docs: `<tv ip>` o `192.168.1.50`. Difuminar nombres de personas y ciudades (incluido `greeting_name`).
- **Sin APKs ni binarios** en el repo.
- **El launcher no tiene red**, ni telemetría, ni servicios en segundo plano. Todo lo de red va en add-ons.
- **Nada nuevo encendido por defecto** para todas las TVs.
- No tocar `.github/workflows/`, el límite de tamaño, `PROMPT.md` ni el Home guard en un PR normal.
- Sin root, sin builds privadas que otros no puedan reproducir.
- Un tema por PR. Probado en TV real; "Tested on" con TV, versión de Android y firmware.

## Estilo de commits y PRs

- Título `área: qué cambió`, en palabras simples: `addons: Terminal, a live pad and phone settings`,
  `SHOWCASE: add Terminal for LG webOS`. Áreas: `examples`, `Launcher`, `docs`, `tools`, `tests`, `themes`,
  `addons`, `SHOWCASE`, `README`, `Press`.
- Cuerpo: una o dos frases y la TV en que se probó, más el checklist de `.github/pull_request_template.md`.
- Las PRs las revisan el mantenedor y un bot con `MAINTAINER.md`; cambios al Home o al arranque esperan prueba en TV real.

## Antes de un PR

```bash
python3 -m venv tools/venv
tools/venv/bin/pip install -r tools/requirements.txt
tools/venv/bin/python -m unittest discover -s tests -v
```

En Windows los tests que corren `tools/*.sh` salen como "skipped"; CI los corre.
Para el launcher: JDK 17, SDK 34, build-tools 34.0.0, `./gradlew --no-daemon testReleaseUnitTest lintRelease assembleRelease`.

## Qué significa para este proyecto

- **Android TV / Google TV** → add-on `addons/terminal/` (plan en [`../PLAN-CLEANYOURTV.md`](../PLAN-CLEANYOURTV.md)).
- **webOS** (este repo) → no cabe en `addons/`; va como repo propio con una fila en `SHOWCASE.md`.
- **Un tema `themes/terminal/`** para que el Home combine → PR aparte, opcional.
- Bloqueos para cualquier PR: una TV Android real (captura + "Tested on") y una llave de firma fuera del repo.
