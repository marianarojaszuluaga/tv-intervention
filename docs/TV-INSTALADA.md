# Lo que ya se hizo en la TV

Bitácora de la primera TV donde vive Terminal. Sin IPs ni nombres: en la TV real esos datos están en sus ajustes.
Estado al 29 oct 2026.

## La TV

| | |
|---|---|
| Equipo | Hyundai con **webOS TV Lite 7.5** (7.5.8). No es Android: cleanyourtv no se le aplica tal cual (ver [CLEANYOURTV.md](CLEANYOURTV.md)) |
| Acceso | **Developer Mode** de LG (cuenta de LG Developer de la dueña), Key Server encendido. SSH en el puerto 9922, usuario `prisoner`, llave `webos_rsa` con passphrase |
| Versión instalada | `com.mariana.retrotv` **1.1.6** (título **Terminal**) + servicio `com.mariana.retrotv.service`. La **2.0.0 de este repo no se ha instalado** en ella |
| Datos en la TV | `/media/internal/retrotv`: permiso de LG (`lgtv-key.json`), dibujos guardados, registro. Sobreviven reinicios y reinstalaciones |

## Cómo se instaló

1. Developer Mode → Dev Mode Status ON → Key Server ON; se bajó la llave de `http://<ip tv>:9991/webos_rsa`.
2. **`ares-install` no conecta**: la TV solo ofrece `ssh-rsa` y el CLI lo rechaza. Se usa OpenSSH con
   `-o PubkeyAcceptedAlgorithms=+ssh-rsa -o HostKeyAlgorithms=+ssh-rsa` y la llave sin passphrase
   (una copia local, nunca en el repo).
3. El IPK se sube con `cat > /media/developer/temp/…ipk` y se instala con
   `luna-send-pub … luna://com.webos.appInstallService/dev/install`. Si Terminal está abierta, tarda ~30 s.
   Eso es lo que hacen `instalar.sh` y `instalar-en-otra-tv.ps1`.
4. La primera vez la TV mostró el aviso de LG para dejar conectar la app (SSAP, `ws://127.0.0.1:3000`); se aceptó con el control.

## Qué hace hoy en esa TV (1.1.6)

- **Inicio propio**: saludo con su nombre, fecha, reloj, clima (Open-Meteo), entradas, apps con íconos y el pad en vivo con QR al control.
- **El servidor vive en la TV**: servicio Node 12 en el puerto 8765, solo para IPs privadas. Sirve el control del teléfono
  (`/control`), el pad en vivo (SSE), los dibujos guardados y la lista de apps.
- **Botón Home → Terminal**: el servicio mira la app al frente cada 0,7 s; si es el inicio de LG (`com.webos.app.home`, el de los anuncios)
  abre Terminal. Para ir al inicio de LG a propósito: botón **Inicio LG** (10 min) o Home tres veces en 4 s (2 min).
- **Arranca solo**: dos actividades de `com.palm.activitymanager` (`com.mariana.retrotv.revive` y `.revive.fast`) reviven el servicio;
  al encender, Terminal reemplaza el inicio de LG en 2–3 s.
- La lista de apps la da SSAP (la app web no puede leerla); el servicio guarda la última.

## Lo que se probó y se quitó

- **Servidor en el computador** (`pc/server.py` + tarea programada "Terminal TV"): fue la primera versión.
  Quedó como respaldo con la tarea **desactivada** y no está en este repo (tenía IPs fijas).
- **Asistente con Claude**: se quitó (requería una API de pago).
- **QR fijo** (`qr-control.png`) con la IP escrita: reemplazado en 2.0.0 por el QR que la TV genera con su propia IP.

## Mantenimiento

- **EXTEND** en la app Developer Mode antes de que llegue a cero; si caduca, LG borra Terminal.
- Para pasarla a 2.0.0: `instalar-en-otra-tv.ps1` con la IP de esa TV. Conserva el mismo id, así que reemplaza la 1.1.6 y guarda sus datos;
  la primera vez arranca con los ajustes por defecto y hay que poner nombre, trato, ciudad y tema desde el teléfono → Ajustes.
- El permiso de LG y la llave de Developer Mode **nunca** van al repo (`.gitignore` los excluye).

## Sin verificar en una TV real (2.0.0)

Instalación con el script de Windows, el aviso de LG en otro modelo, la IP que da `os.networkInterfaces()` en la TV
y la barra de estado del iPhone con el tema claro. Todo lo demás se probó en el simulador (`dev/simular-tv.js`).
