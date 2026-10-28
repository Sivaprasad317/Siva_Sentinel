# SIVA Sentinel: start the app and open it in Microsoft Edge (best voice).
#   .\start-siva.ps1               development mode (fast to start, reloads when files change)
#   .\start-siva.ps1 -Production   build once, then run the faster production server
# Keep this window open while you use Siva. Press Ctrl + C to stop.
param([switch]$Production)

Set-Location -Path $PSScriptRoot
if (-not (Test-Path (Join-Path $PSScriptRoot 'node_modules'))) {
  Write-Host "Packages are not installed yet. Run .\setup.ps1 first." -ForegroundColor Red
  exit 1
}
if (-not (Test-Path (Join-Path $PSScriptRoot '.env.local'))) {
  Write-Host "No .env.local found. Run .\setup.ps1 first." -ForegroundColor Red
  exit 1
}

$url = 'http://127.0.0.1:3000'
# Open the browser in the background once the server answers (or after ~2 minutes).
Start-Job -ArgumentList $url -ScriptBlock {
  param($u)
  for ($i = 0; $i -lt 60; $i++) {
    try { Invoke-WebRequest -UseBasicParsing -Uri "$u/api/status" -TimeoutSec 2 | Out-Null; break }
    catch { if ($_.Exception.Response) { break }; Start-Sleep -Seconds 2 }
  }
  try { Start-Process "microsoft-edge:$u" } catch { Start-Process $u }
} | Out-Null

Write-Host "Starting SIVA Sentinel at $url ... (Ctrl + C to stop)" -ForegroundColor Cyan
if ($Production) {
  npm run build
  if ($LASTEXITCODE -ne 0) { Write-Host "Build failed. Read the error above." -ForegroundColor Red; exit 1 }
  npm start
} else {
  npm run dev
}
