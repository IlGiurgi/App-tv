# Pacchettizza HomeTivu da una copia pulita e la installa su una TV Samsung.
# Uso: scripts\install-tv.ps1 -Tv 192.168.86.54 [-Profile TiptOld] [-What app|sitotv]
param(
  [Parameter(Mandatory = $true)][string]$Tv,
  [string]$Profile = "TiptOld",
  [ValidateSet("app", "sitotv")][string]$What = "app",
  [string]$TizenHome = "C:\tizen-studio"
)
$ErrorActionPreference = "Stop"
if ($What -eq "app") { $Id = "XtrmIPTVtv.XtreamTV"; $Name = "HomeTivu" } else { $Id = "SitoTVview.SitoTV"; $Name = "SitoTV" }
$Tizen = Join-Path $TizenHome "tools\ide\bin\tizen.bat"
$Sdb = Join-Path $TizenHome "tools\sdb.exe"
$Root = git -C $PSScriptRoot rev-parse --show-toplevel
$Work = Join-Path $env:TEMP ("hometivu-" + [guid]::NewGuid())
New-Item -ItemType Directory $Work | Out-Null
try {
  # Copia pulita dei soli file versionati: evita .buildResult e altri residui (errore 118).
  $Zip = Join-Path $Work "src.zip"
  git -C $Root archive --format=zip -o $Zip HEAD $What
  Expand-Archive $Zip $Work
  & $Tizen package -t wgt -s $Profile -o $Work -- (Join-Path $Work $What)
  Get-ChildItem $Work -Filter *.wgt | Select-Object -First 1 | Rename-Item -NewName "$Name.wgt"
  & $Sdb connect "${Tv}:26101"
  & $Tizen install -n "$Name.wgt" -s "${Tv}:26101" -- $Work
  & $Tizen run -p $Id -s "${Tv}:26101"
} finally { Remove-Item -Recurse -Force $Work -ErrorAction SilentlyContinue }
