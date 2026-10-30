# Terminal

A retro home page for the TV with a live pad you draw on from your phone. Full screen it shows a greeting
(with your name, in Spanish), the clock and date, the weather for one city, the pad, and a QR code that opens
the phone's control. For the [Clean Your TV](../../README.md) launcher it declares a
[module card](../../docs/modules.md), so once you answer **Show card** its tile reads "Terminal" with a green
glow; on any other Android TV home it is an ordinary app.

- **The phone's control.** Scan the QR code with a phone on the same Wi-Fi. The page has four tabs: **Control**
  (volume and a button that brings Terminal back), **Apps** (the TV's apps, OK opens one), **Pad** (draw with a
  finger; it appears on the TV as you draw, and **Save** keeps the drawing on the TV) and **Settings**.
- **Settings from the phone, live on the TV:** the name in the greeting, plural or singular wording ("¿qué vemos
  hoy?" or "¿qué ves hoy?"), a fixed greeting or one by the hour, the weather city, the theme (Terminal, Amber CRT,
  Synthwave or a light Minimal), and which blocks the screen shows. They are kept on the TV, in the app's own storage.
- **Four themes**, every text colour at least 4.5:1 against its background to read from across the room.
- **Weather** from [Open-Meteo](https://open-meteo.com/) (no account or key), refreshed every 30 minutes while
  the screen is open.
- The same phone page and HTTP API as the LG webOS version, which lives in its own repository; the server tells
  the page what this TV can do, and the page hides the rest.

## What Android does not allow here

| On the phone | Here |
|---|---|
| Arrows and OK | Hidden. An app cannot send keys to other apps; only an accessibility service can, and only on Android 13 and newer. Use the TV's remote or the phone's Google TV app |
| Power off | Hidden: it needs system permissions |
| HDMI inputs | Hidden |
| Opening an app | Works while Terminal is on screen |

## When it runs

The phone's control works **while Terminal is on screen**: the server on port 8765 starts with the screen and stops
when you leave it. No background service, nothing at boot. While someone draws, the screen is kept on for five
minutes after the last stroke.

## Permissions

| Permission | Why |
|---|---|
| `INTERNET` | The phone's control (a small web server on port 8765, answering only the home network: 10.x, 172.16-31.x, 192.168.x) and the weather from Open-Meteo. |

That is all. What is sent: the city name to Open-Meteo's place search, then that place's latitude and longitude.
No account, no telemetry, no ads. Anyone on the same Wi-Fi can open the control while Terminal is on screen, as
with the webOS version. Settings and saved drawings stay in the app's own storage (backups are off).

The manifest's `<queries>` entry lets it list the TV's apps (those with a TV launcher entry) for the phone's Apps tab.

## Build and install

JDK 17 and Android SDK platform 34 with build-tools 34.0.0, as for the launcher:

```bash
cd addons/terminal && ./gradlew assembleRelease
TV_HOST=<tv ip> ../../tools/venv/bin/python -I ../../tools/tv.py --push app/build/outputs/apk/release/app-release.apk /data/local/tmp/addon.apk
TV_HOST=<tv ip> ../../tools/venv/bin/python -I ../../tools/tv.py 'pm install -r /data/local/tmp/addon.apk; rm -f /data/local/tmp/addon.apk'
```

Press Home: the launcher asks once whether to show the card. Open it, scan the QR code with your phone, and add
the page to the home screen (Share → Add to Home Screen on an iPhone) to keep it as an app.

The release build is signed with the debug key so it installs over ADB like the launcher. Sign your own builds
with your own key if you hand them out; the launcher pins its Show answer to the signing key.

## Credits

`Qr.java` is the QR encoder from this repository's [news-screensaver](../news-screensaver/) add-on, unchanged.
The phone page (`app/src/main/assets/www/`) is shared with the webOS version.
