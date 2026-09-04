# Stop the app. Windows.
$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")
docker compose down
Write-Host "Stopped"
