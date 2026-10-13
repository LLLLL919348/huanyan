# Run the real-model playthrough harness (tools/playthrough.html) in headless Edge.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools/run-playthrough.ps1 [-N 10] [-Port 5599] [-Shot] [-Budget 240000]
# NOTE: keep this file ASCII-only (PS 5.1 reads it without a BOM).
param([int]$N = 10, [int]$Port = 5599, [switch]$Shot, [int]$Budget = 240000)

$ErrorActionPreference = 'Continue'
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
$tmp = Join-Path $env:TEMP "rp-playthrough.html"
$url = "http://127.0.0.1:$Port/tools/playthrough.html?n=$N"
if ($Shot) { $url = $url + "&shot=1" }
# fresh profile per run: quota / conversations never leak between runs
$prof = Join-Path $env:TEMP ("edge-rp-playthrough-" + [guid]::NewGuid().ToString('N').Substring(0, 6))
$args = @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  "--user-data-dir=$prof", "--virtual-time-budget=$Budget")
if ($Shot) {
  $png = Join-Path $PSScriptRoot ("shots\playthrough-" + (Get-Date -Format 'MMdd-HHmm') + ".png")
  New-Item -ItemType Directory -Force -Path (Split-Path $png) | Out-Null
  $args += "--screenshot=$png"
  $args += '--window-size=1280,900'
}
$args += '--dump-dom'
$args += $url
& $edge @args 2>$null | Out-File -Encoding utf8 $tmp
node (Join-Path $PSScriptRoot 'extract-out.js') $tmp
if ($Shot -and (Test-Path $png)) { Write-Host ("截图: " + $png) }
Remove-Item -LiteralPath $prof -Recurse -Force -ErrorAction SilentlyContinue
