# Run a tools/smoke-*.html harness in headless Edge and print its #out block.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools/run-smoke.ps1 smoke-guard [budgetMs] [port]
# NOTE: keep this file ASCII-only (no BOM on disk, so non-ASCII would be mis-decoded by PS 5.1).
param([string]$Name = 'smoke-guard', [int]$Budget = 30000, [int]$Port = 5599)

$ErrorActionPreference = 'Continue'
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
$tmp = Join-Path $env:TEMP ("rp-" + $Name + ".html")
$url = "http://127.0.0.1:$Port/tools/$Name.html"
# fresh browser profile per run: localStorage quota / outfits / sessions never leak between runs
$prof = Join-Path $env:TEMP ("edge-rp-" + $Name)
if (Test-Path -LiteralPath $prof) { Remove-Item -LiteralPath $prof -Recurse -Force -ErrorAction SilentlyContinue }

& $edge --headless=new --disable-gpu --hide-scrollbars --no-first-run --allow-file-access-from-files `
  --user-data-dir="$prof" --virtual-time-budget=$Budget --dump-dom $url 2>$null | Out-File -Encoding utf8 $tmp
node (Join-Path $PSScriptRoot 'extract-out.js') $tmp
