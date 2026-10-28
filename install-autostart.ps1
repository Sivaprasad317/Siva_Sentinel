# Make Siva start by herself when you log in to Windows, and keep reading the news in the background.
#   .\install-autostart.ps1            install (or update) the startup task
#   .\install-autostart.ps1 -Remove    remove it again
# After installing, open http://127.0.0.1:3000 any time - Siva will already be up to date.
param([switch]$Remove)
$taskName = 'SIVA Sentinel'
if ($Remove) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed the '$taskName' startup task. Siva will no longer start by herself." -ForegroundColor Yellow
  exit 0
}
$script = Join-Path $PSScriptRoot 'start-siva-background.ps1'
if (-not (Test-Path $script)) { Write-Host "start-siva-background.ps1 is missing. Apply the latest patch first." -ForegroundColor Red; exit 1 }
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`"" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Runs SIVA Sentinel in the background so it keeps reading cybersecurity news.' -Force | Out-Null
Write-Host "Installed. Siva will start by herself every time you log in to Windows." -ForegroundColor Green
Write-Host "Starting her now in the background..." -ForegroundColor Cyan
Start-ScheduledTask -TaskName $taskName
Write-Host "In a minute or two open http://127.0.0.1:3000 . Log file: data\siva-server.log" -ForegroundColor Cyan
Write-Host "Tip: set how often she reads in Settings -> Live mode (every 1, 2 or 3 hours)." -ForegroundColor Cyan
