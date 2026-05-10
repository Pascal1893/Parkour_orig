$ErrorActionPreference = "Stop"

if (-not $env:PARKOUR_SESSION_SECRET) {
  Write-Host "Hinweis: Setze PARKOUR_SESSION_SECRET für produktivere Nutzung (Cookies signieren)."
}

python "$PSScriptRoot\\server.py"

