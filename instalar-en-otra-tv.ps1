# Instala Terminal en otra TV LG/webOS desde este computador (misma Wi-Fi).
# Uso (PowerShell, en esta carpeta):
#   powershell -ExecutionPolicy Bypass -File .\instalar-en-otra-tv.ps1
# Antes: en la TV, la app Developer Mode con "Dev Mode Status" y "Key Server" en ON (ver GUIA-OTRA-TV.md).
# La llave de la TV y la passphrase solo se usan en una carpeta temporal que se borra al final: nada queda en el repo.
# ares-install no sirve con estas TVs (piden ssh-rsa): se usa el OpenSSH de Windows.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$appId = "com.mariana.retrotv"

function Paso($t) { Write-Host ""; Write-Host "== $t" -ForegroundColor Green }
function Ojo($t) { Write-Host "   $t" -ForegroundColor Yellow }

# ---------- Herramientas ----------
$sshExe = (Get-Command ssh.exe -ErrorAction SilentlyContinue).Source
$keygen = (Get-Command ssh-keygen.exe -ErrorAction SilentlyContinue).Source
if (-not $sshExe -or -not $keygen) {
  throw "Falta OpenSSH de Windows. Configuración > Sistema > Características opcionales > Agregar 'Cliente OpenSSH'."
}

# ---------- Paquete ----------
Paso "Paquete de Terminal"
$ares = Get-Command ares-package -ErrorAction SilentlyContinue
if ($ares) {
  # Las páginas del teléfono y del computador las sirve el servicio desde service/www.
  New-Item -ItemType Directory -Force (Join-Path $here "service\www") | Out-Null
  Copy-Item (Join-Path $here "pc\telefono.html"), (Join-Path $here "pc\computador.html"), (Join-Path $here "pc\icon-180.png"), (Join-Path $here "pc\ofrenda.html"), (Join-Path $here "pc\heic2any.min.js") (Join-Path $here "service\www") -Force
  $dist = Join-Path $here "dist"
  if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
  Push-Location $here
  try { & ares-package app service -o dist | Out-Null } finally { Pop-Location }
}
$ipk = Get-ChildItem (Join-Path $here "dist") -Filter *.ipk -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $ipk) { throw "No hay paquete en dist\. Instala el webOS CLI (npm i -g @webos-tools/cli) o corre: ares-package app service -o dist" }
Write-Host "   $($ipk.Name)"

# ---------- La TV ----------
Paso "La TV"
Write-Host "   En la TV: abre la app Developer Mode. Debe decir Dev Mode Status ON y Key Server ON."
Write-Host "   Ahí mismo verás la IP de la TV y la Passphrase (6 letras/números)."
do { $ip = (Read-Host "   IP de la TV (ej. 192.168.1.50)").Trim() } until ($ip -match '^\d{1,3}(\.\d{1,3}){3}$')

$tmp = Join-Path $env:TEMP ("terminal-tv-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory $tmp | Out-Null
$key = Join-Path $tmp "webos_rsa"

try {
  # ---------- Llave de Developer Mode ----------
  Paso "Llave de Developer Mode"
  try {
    Invoke-WebRequest -Uri "http://${ip}:9991/webos_rsa" -OutFile $key -UseBasicParsing -TimeoutSec 15
  } catch {
    throw "No pude bajar la llave de http://${ip}:9991/webos_rsa. ¿Key Server está en ON y la IP es la correcta? ($($_.Exception.Message))"
  }
  # OpenSSH rechaza llaves que otros usuarios del PC puedan leer.
  & icacls $key /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null

  $sec = Read-Host "   Passphrase de Developer Mode (la de la TV, respeta mayúsculas)" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try { $pass = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  # Se le quita la passphrase a la copia temporal para que ssh no la pida en cada paso.
  # (Con Process y no con & : PowerShell 5 y 7 pasan distinto una passphrase nueva vacía.)
  $kg = New-Object System.Diagnostics.ProcessStartInfo
  $kg.FileName = $keygen
  $kg.Arguments = "-p -P `"$($pass -replace '"', '')`" -N `"`" -f `"$key`""
  $kg.UseShellExecute = $false; $kg.RedirectStandardOutput = $true; $kg.RedirectStandardError = $true
  $kp = [System.Diagnostics.Process]::Start($kg)
  $null = $kp.StandardOutput.ReadToEndAsync(); $null = $kp.StandardError.ReadToEndAsync()
  $kp.WaitForExit()
  $ok = $kp.ExitCode -eq 0
  $pass = $null; $kg.Arguments = ""
  if (-not $ok) { throw "La passphrase no abre la llave. Revísala en la app Developer Mode (cambia si la TV regeneró la llave)." }

  # ssh a la TV. El comando y los datos van por la entrada estándar: sin líos de comillas ni de binarios en PowerShell 5.
  function TvSsh([string]$remote, [byte[]]$data) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $sshExe
    $psi.Arguments = "-i `"$key`" -p 9922 -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL -o LogLevel=ERROR " +
      "-o BatchMode=yes -o ConnectTimeout=15 -o PubkeyAcceptedAlgorithms=+ssh-rsa -o HostKeyAlgorithms=+ssh-rsa prisoner@$ip `"$remote`""
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
    $p = [System.Diagnostics.Process]::Start($psi)
    $out = $p.StandardOutput.ReadToEndAsync(); $err = $p.StandardError.ReadToEndAsync()
    if ($data) { $p.StandardInput.BaseStream.Write($data, 0, $data.Length) }
    $p.StandardInput.Close()
    $p.WaitForExit()
    return @{ code = $p.ExitCode; out = $out.Result; err = $err.Result }
  }

  # ---------- Subir e instalar ----------
  Paso "Subiendo el paquete"
  $r = TvSsh "cat > /media/developer/temp/terminal.ipk" ([IO.File]::ReadAllBytes($ipk.FullName))
  if ($r.code -ne 0) { throw "No pude conectar por SSH (puerto 9922): $($r.err)" }

  Paso "Instalando (puede tardar ~30 s)"
  $script = @"
luna-send-pub -i -w 90000 luna://com.webos.appInstallService/dev/install '{"id":"$appId","ipkUrl":"/media/developer/temp/terminal.ipk","subscribe":true}' | grep -o '"state":"[^"]*"' | uniq | tail -1
rm -f /media/developer/temp/terminal.ipk
luna-send-pub -n 1 luna://com.webos.applicationManager/launch '{"id":"$appId"}' >/dev/null 2>&1
exit 0
"@
  $r = TvSsh "sh" ([Text.Encoding]::UTF8.GetBytes($script.Replace("`r`n", "`n")))
  $state = $r.out.Trim()
  Write-Host "   La TV respondió: $state"
  if ($state -notmatch 'installed') { Ojo "No vi 'installed'. Si Terminal no aparece en la TV, vuelve a correr el script. $($r.err)" }

  # ---------- Primer arranque ----------
  Paso "Abriendo Terminal en la TV"
  Ojo "La PRIMERA vez la TV muestra un aviso de LG pidiendo permiso para conectarse: acéptalo con el control."
  Ojo "(Sin ese permiso no salen la lista de apps, el botón Home ni el control del teléfono.)"
  $base = "http://${ip}:8765"
  $up = $false
  for ($i = 0; $i -lt 30 -and -not $up; $i++) {
    try { Invoke-RestMethod "$base/api/health" -TimeoutSec 3 | Out-Null; $up = $true } catch { Start-Sleep -Seconds 2 }
  }
  if (-not $up) {
    Ojo "El servidor de la TV aún no contesta. Abre Terminal en la TV y luego $base/control en el teléfono."
  } else {
    Paso "Ajustes de esta TV (Enter para dejar como está; se cambian luego desde el teléfono → Ajustes)"
    $cfg = @{}
    $name = Read-Host "   ¿Cómo la saluda la TV? (nombre)"
    if ($name) { $cfg.name = $name.Trim() }
    $trato = Read-Host "   ¿Trato en plural ('¿qué vemos hoy?') o singular ('¿qué ves hoy?')? [p/s]"
    if ($trato -match '^p') { $cfg.plural = $true } elseif ($trato -match '^s') { $cfg.plural = $false }
    $city = Read-Host "   Ciudad para el clima"
    if ($city) { $cfg.city = $city.Trim() }
    $tema = Read-Host "   Tema: 1 Terminal · 2 Ámbar CRT · 3 Synthwave · 4 Minimal claro"
    $temas = @{ "1" = "terminal"; "2" = "ambar"; "3" = "synthwave"; "4" = "minimal" }
    if ($temas.ContainsKey($tema)) { $cfg.theme = $temas[$tema] }
    if ($cfg.Count) {
      $body = [Text.Encoding]::UTF8.GetBytes(($cfg | ConvertTo-Json -Compress))
      try { Invoke-RestMethod "$base/api/config" -Method Post -ContentType "application/json; charset=utf-8" -Body $body | Out-Null; Write-Host "   Guardado: ya se ve en la TV." }
      catch { Ojo "No pude guardar los ajustes ($($_.Exception.Message)). Hazlo desde el teléfono → Ajustes." }
    }
  }

  Paso "Listo"
  Write-Host "   Control del teléfono: $base/control  (o escanea el QR en la TV → Compartir → Agregar a inicio)"
  Ojo "Developer Mode caduca: abre la app Developer Mode en ESA TV y pulsa EXTEND antes de que llegue a cero,"
  Ojo "o LG borra Terminal. Para reinstalar o actualizar, vuelve a correr este script."
} finally {
  # La llave sin passphrase nunca se queda en el computador.
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
