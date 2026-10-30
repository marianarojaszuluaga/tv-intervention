# Instalar Terminal en otra TV

Para TVs LG o con webOS (Hyundai, etc.) que tengan la tienda de LG. Se hace una vez y tarda ~20 minutos.
Necesitas: la TV y tu computador en **la misma Wi-Fi**, y que la dueña o el dueño de la TV esté ahí (hay que aceptar cosas con su control).

## 1. Cuenta de LG Developer (la crea la persona de la TV)

1. En el teléfono o el computador, entra a **https://webostv.developer.lge.com** → *Sign in* → *Create account*.
2. Que la cree **la persona dueña de la TV**, con su correo: la cuenta queda ligada a su TV y es quien deberá renovar el modo desarrollador.
3. No hace falta pagar ni publicar nada.

## 2. Activar Developer Mode en la TV

1. En la TV abre la tienda (**LG Content Store / Apps**), busca **Developer Mode** e instálala.
2. Ábrela e inicia sesión con la cuenta del paso 1.
3. Pon **Dev Mode Status** en **ON**. La TV se reinicia.
4. Vuelve a abrir Developer Mode y pon **Key Server** en **ON**.
5. Anota lo que muestra la pantalla: la **IP** de la TV y la **Passphrase** (6 letras y números; respeta mayúsculas).

## 3. Reservar la IP de la TV en el router (recomendado)

Así el QR y el control del teléfono no se rompen cuando el router cambie la IP.

1. En el navegador del computador abre el router (casi siempre **http://192.168.1.1** o **http://192.168.0.1**; la dirección y la clave suelen estar en una etiqueta debajo del router).
2. Busca **DHCP**, **Reserva de dirección**, **IP estática** o **Dispositivos conectados**.
3. Elige la TV (sale como *LGwebOSTV*, *webOS* o por su MAC; la MAC está en la TV: Configuración → Soporte → Información de la TV) y reserva la IP que tiene ahora.

Si no hay acceso al router, funciona igual: solo que si la IP cambia, hay que volver a escanear el QR de la TV.

## 4. Instalar desde el computador

En la carpeta `retro-tv-kit`, con PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\instalar-en-otra-tv.ps1
```

El script pide la **IP** y la **Passphrase** de la TV, baja la llave de Developer Mode, sube Terminal y lo instala.
La llave y la passphrase solo se usan en una carpeta temporal que se borra al terminar.
Al final pregunta nombre, trato (plural/singular), ciudad y tema; si das Enter, se dejan para después.

**En la TV, la primera vez:** sale un aviso de LG pidiendo permiso para que la app se conecte. **Acéptalo con el control.**
Sin ese permiso no salen la lista de apps, el botón Home ni el control del teléfono.

## 5. El teléfono

1. Con el teléfono en la misma Wi-Fi, escanea el **QR** del inicio de Terminal.
2. En iPhone: Compartir → **Agregar a inicio**, para tenerlo como app.
3. Pestaña **Ajustes**: nombre, trato, saludo, ciudad, tema, qué bloques salen en el inicio y qué apps se ven. Cada cambio se ve en la TV al instante.

## 6. Mantenerlo vivo: EXTEND

Developer Mode dura unas semanas. **Antes de que llegue a cero**, abre la app Developer Mode en la TV y pulsa **EXTEND**
(con la sesión de la cuenta de LG). Si caduca, LG borra Terminal y hay que volver al paso 2 y reinstalar.
Pon un recordatorio en el calendario de la persona de la TV.

## Si algo falla

| Pasa esto | Prueba esto |
|---|---|
| *No pude bajar la llave* | Key Server en ON, la IP es la de la TV, el computador está en la misma Wi-Fi (no en la de invitados). |
| *La passphrase no abre la llave* | Cópiala otra vez de la app Developer Mode; si se apagó y prendió Key Server, cambia. |
| *No pude conectar por SSH* | Dev Mode Status en ON; reinicia la TV y vuelve a correr el script. |
| El teléfono no abre el control | Misma Wi-Fi; abre Terminal en la TV (el servidor arranca con ella); escanea el QR de nuevo. |
| No salen las apps | Acepta el aviso de permiso de LG en la TV (paso 4). |
