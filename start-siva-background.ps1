# SIVA Sentinel: run quietly in the background (no window, no browser), so Siva keeps reading her
# sources on her live schedule (Settings -> Live mode) even when you are not using her.
# Started automatically at login by install-autostart.ps1. Log: data\siva-server.log
Set-Location -Path $PSScriptRoot
$log = Join-Path $PSScriptRoot 'data\siva-server.log'
New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'data') | Out-Null
"[$(Get-Date -Format s)] Starting SIVA Sentinel in the background" | Out-File -FilePath $log -Append -Encoding utf8

# Do not start twice (for example if you also ran start-siva.ps1).
try {
  Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/status' -TimeoutSec 3 | Out-Null
  "[$(Get-Date -Format s)] Already running - nothing to do" | Out-File -FilePath $log -Append -Encoding utf8
  exit 0
} catch { }

# Build once (or again after a patch changed the code), then run the fast production server.
$buildId = Join-Path $PSScriptRoot '.next\BUILD_ID'
$needBuild = -not (Test-Path $buildId)
if (-not $needBuild) {
  $built = (Get-Item $buildId).LastWriteTime
  # Source folders plus the root files that change how the app is built or served.
  $sources = Get-ChildItem -Path (Join-Path $PSScriptRoot 'app'), (Join-Path $PSScriptRoot 'components'), (Join-Path $PSScriptRoot 'lib') -Recurse -File
  $rootFiles = Get-ChildItem -Path $PSScriptRoot -File | Where-Object { $_.Name -in 'middleware.ts', 'instrumentation.ts', 'next.config.mjs', 'package.json', 'tsconfig.json' }
  $newer = @($sources) + @($rootFiles) | Where-Object { $_.LastWriteTime -gt $built } | Select-Object -First 1
  if ($newer) { $needBuild = $true }
}
if ($needBuild) {
  "[$(Get-Date -Format s)] Building (first run or code changed)..." | Out-File -FilePath $log -Append -Encoding utf8
  npm run build *>> $log
  if ($LASTEXITCODE -ne 0) {
    "[$(Get-Date -Format s)] Build failed - not starting. See the errors above in this log." | Out-File -FilePath $log -Append -Encoding utf8
    exit 1
  }
}
npm start *>> $log
