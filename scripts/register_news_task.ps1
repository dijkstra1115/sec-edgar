<#
  Registers a Windows Scheduled Task that runs the NEWS alerter every 10 minutes.
  The script exits fast outside SEC/US-market hours (~6am-11pm ET weekdays), so a
  24/7 10-minute trigger costs almost nothing. Fetch/dedup is free; only the LLM
  judge (config judge.enabled) spends tokens, and it self-throttles (cadence_min /
  queue_trigger in news_config.json).

  Runs only while you are logged on (no stored password). Uses pythonw.exe so no
  console window flashes. Output goes to data/news/news.log.

  Usage:
      powershell -ExecutionPolicy Bypass -File scripts\register_news_task.ps1
  Remove later with:
      Unregister-ScheduledTask -TaskName "SEC News Alert" -Confirm:$false
#>
$ErrorActionPreference = "Stop"

$repo   = Split-Path -Parent $PSScriptRoot
$script = Join-Path $repo "src\news_alert.py"
$python = (Get-Command python).Source
if (-not $python) { throw "python not found on PATH" }
if (-not (Test-Path $script)) { throw "not found: $script" }

# Prefer pythonw.exe (windowless) so the runs don't flash a console.
$pythonw = Join-Path (Split-Path $python) "pythonw.exe"
$exe = if (Test-Path $pythonw) { $pythonw } else { $python }

$action = New-ScheduledTaskAction -Execute $exe -Argument "`"$script`"" -WorkingDirectory $repo

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date)
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 10) `
    -RepetitionDuration (New-TimeSpan -Days 3650)).Repetition

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName "SEC News Alert" -Action $action -Trigger $trigger `
    -Settings $settings -Force `
    -Description "Poll Benzinga/Finnhub/SEC 8-K for watchlist news; LLM-judge materiality; push high-signal events to Telegram."

Write-Host "Registered scheduled task 'SEC News Alert' (every 10 minutes, while logged on)."
