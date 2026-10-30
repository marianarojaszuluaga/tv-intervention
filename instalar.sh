#!/bin/sh
# Empaqueta la app y su servicio (el servidor que vive en la TV) y los instala por SSH (Developer Mode activo).
# Uso: TV_KEY=/ruta/llave-sin-passphrase sh instalar.sh <ip-tv>   (en Windows: instalar-en-otra-tv.ps1)
# ares-install no conecta con esta TV (algoritmo ssh-rsa), por eso se usa OpenSSH.
set -e
cd "$(dirname "$0")"
TV="${1:?uso: sh instalar.sh <ip-tv>}"
KEY="${TV_KEY:?pon TV_KEY con la llave de Developer Mode sin passphrase}"
SSH="ssh -i $KEY -p 9922 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o PubkeyAcceptedAlgorithms=+ssh-rsa -o HostKeyAlgorithms=+ssh-rsa prisoner@$TV"

# Las páginas del iPhone y del computador las sirve el servicio desde service/www.
mkdir -p service/www
cp pc/telefono.html pc/computador.html pc/icon-180.png service/www/

rm -rf dist && mkdir dist
ares-package app service -o dist >/dev/null
IPK=$(ls dist/*.ipk)
echo "Paquete: $IPK"

$SSH "cat > /media/developer/temp/retrotv.ipk" < "$IPK"
# Si Terminal está abierta, la TV primero la cierra: la instalación puede tardar ~30 s.
$SSH 'luna-send-pub -i -w 60000 luna://com.webos.appInstallService/dev/install "{\"id\":\"com.mariana.retrotv\",\"ipkUrl\":\"/media/developer/temp/retrotv.ipk\",\"subscribe\":true}" | grep -o "\"state\":\"[^\"]*\"" | uniq | tail -1; rm -f /media/developer/temp/retrotv.ipk'
