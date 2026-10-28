# SIVA Sentinel: one-step setup (run once, and again after big updates).
# From the project folder run:   .\setup.ps1
# If Windows blocks scripts, run: powershell -ExecutionPolicy Bypass -File .\setup.ps1
# What it does: checks Node.js, installs packages, creates .env.local, asks for your keys
# (typed keys are hidden and stay only in .env.local on this PC), then runs the tests.

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
$envFile = Join-Path $PSScriptRoot '.env.local'

function Write-Step($text) { Write-Host "`n==> $text" -ForegroundColor Magenta }

function Read-Secret($prompt) {
  $sec = Read-Host -Prompt $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Get-EnvValue($name) {
  foreach ($line in [System.IO.File]::ReadAllLines($envFile)) {
    if ($line -match "^\s*$name\s*=(.*)$") { return $Matches[1].Trim() }
  }
  return ''
}

function Set-EnvValue($name, $value) {
  $lines = [System.Collections.Generic.List[string]]::new([System.IO.File]::ReadAllLines($envFile))
  $done = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*$name\s*=") { $lines[$i] = "$name=$value"; $done = $true }
  }
  if (-not $done) { $lines.Add("$name=$value") }
  [System.IO.File]::WriteAllLines($envFile, $lines)  # UTF-8 without BOM
}

Write-Host "SIVA Sentinel setup" -ForegroundColor Cyan

Write-Step "Checking Node.js"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is not installed. Install Node.js 22 LTS from https://nodejs.org, reopen PowerShell, and run .\setup.ps1 again." -ForegroundColor Red
  exit 1
}
$major = [int]((node -v).TrimStart('v').Split('.')[0])
if ($major -lt 22) {
  Write-Host "Node.js $(node -v) is too old. Please install Node.js 22 LTS or newer from https://nodejs.org." -ForegroundColor Red
  exit 1
}
Write-Host "Node.js $(node -v) OK"

Write-Step "Installing packages (npm install). This can take a few minutes the first time."
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "npm install failed. Read the error above." -ForegroundColor Red; exit 1 }

Write-Step "Preparing your private settings file (.env.local)"
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $PSScriptRoot '.env.example') $envFile
  Write-Host "Created .env.local from .env.example"
}
# Add any new settings from .env.example that an older .env.local does not have yet.
foreach ($line in [System.IO.File]::ReadAllLines((Join-Path $PSScriptRoot '.env.example'))) {
  if ($line -match '^\s*([A-Z0-9_]+)\s*=(.*)$') {
    $name = $Matches[1]
    $defaultValue = $Matches[2].Trim()
    $exists = [System.IO.File]::ReadAllLines($envFile) | Where-Object { $_ -match "^\s*$name\s*=" }
    if (-not $exists) { Set-EnvValue $name $defaultValue; Write-Host "Added new setting $name" }
  }
}

$gemini = Get-EnvValue 'GEMINI_API_KEY'
if (-not $gemini -or $gemini -like 'your-*') {
  Write-Host "Gemini powers Siva's answers. Get a free key at https://aistudio.google.com/apikey"
  $k = Read-Secret "Paste your Gemini API key (hidden), or press Enter to skip"
  if ($k) { Set-EnvValue 'GEMINI_API_KEY' $k; Write-Host "Saved GEMINI_API_KEY" -ForegroundColor Green }
} else { Write-Host "GEMINI_API_KEY already set" }

if (-not (Get-EnvValue 'NVD_API_KEY')) {
  $k = Read-Secret "Optional: NVD API key for faster CVE lookups (https://nvd.nist.gov/developers/request-an-api-key). Enter to skip"
  if ($k) { Set-EnvValue 'NVD_API_KEY' $k; Write-Host "Saved NVD_API_KEY" -ForegroundColor Green }
}
if (-not (Get-EnvValue 'ABUSECH_AUTH_KEY')) {
  $k = Read-Secret "Optional: abuse.ch Auth-Key for IP/domain/hash checks (https://auth.abuse.ch/). Enter to skip"
  if ($k) { Set-EnvValue 'ABUSECH_AUTH_KEY' $k; Write-Host "Saved ABUSECH_AUTH_KEY" -ForegroundColor Green }
}
$title = Get-EnvValue 'SIVA_USER_TITLE'
if (-not $title) {
  $t = Read-Host "How should Siva address you? (Enter for 'boss')"
  Set-EnvValue 'SIVA_USER_TITLE' ($(if ($t) { $t.Trim() } else { 'boss' }))
}

Write-Step "Running the automated tests"
npm test
if ($LASTEXITCODE -ne 0) { Write-Host "Some tests failed. Copy the output above and send it to your assistant." -ForegroundColor Yellow; exit 1 }

Write-Host "`nSetup complete. Start Siva any time with:  .\start-siva.ps1" -ForegroundColor Green
