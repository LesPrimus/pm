# Start the app. Windows.
$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")
New-Item -ItemType Directory -Force -Path data | Out-Null
docker compose up --build -d
Write-Host "Running on http://localhost:8000"
