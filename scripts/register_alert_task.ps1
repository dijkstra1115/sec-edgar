<#
  Registers a Windows Scheduled Task that runs the insider-filing alerter every
  5 minutes. The script itself exits in milliseconds outside SEC filing hours
  (~6am-11pm ET weekdays), so a 24/7 5-minute trigger costs almost nothing.

  Runs only while you are logged on (simplest, no stored password). To run when
  logged off, re-register with  -User / -Password  or an -RunLevel/-LogonType.

  Usage (from an ordinary PowerShell, no admin needed for the current user):
      powershell -ExecutionPolicy Bypass -File scripts\register_alert_task.ps1
  Remove it later with:
      Unregister-ScheduledTask -TaskName "SEC Insider Alert" -Confirm:$false
#>
$ErrorActionPreference = "Stop"

$repo   = Split-Path -Parent $PSScriptRoot
$script = Join-Path $repo "src\insider_alert.py"
$python = (Get-Command python).Source
if (-not $python) { throw "python not found on PATH" }
if (-not (Test-Path $script)) { throw "not found: $script" }

# Prefer pythonw.exe (the windowless Python) so the every-5-minute runs do NOT
# flash a console window. Falls back to python.exe if pythonw is missing. Output
# still goes to data/alerts/alerts.log either way (stdout is just discarded).
$pythonw = Join-Path (Split-Path $python) "pythonw.exe"
$exe = if (Test-Path $pythonw) { $pythonw } else { $python }

$action = New-ScheduledTaskAction -Execute $exe -Argument "`"$script`"" -WorkingDirectory $repo

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date)
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 5) `
    -RepetitionDuration (New-TimeSpan -Days 3650)).Repetition

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName "SEC Insider Alert" -Action $action -Trigger $trigger `
    -Settings $settings -Force `
    -Description "Poll SEC EDGAR for new insider Form 4 filings on the watchlist; push high-signal alerts to Telegram. Rule-based, zero LLM tokens."

Write-Host "Registered scheduled task 'SEC Insider Alert' (every 5 minutes, while logged on)."
Write-Host "Run once now to test:  Start-ScheduledTask -TaskName 'SEC Insider Alert'"
