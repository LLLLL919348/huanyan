# Check every tools/preview.html scene: drives the page headless and fails loudly
# if the scene script threw (title != READY-) or the error banner is present.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools/check-scenes.ps1 [port]
# NOTE: keep this file ASCII-only (no BOM on disk).
param([int]$Port = 5599)

$ErrorActionPreference = 'Continue'
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
$tmp = Join-Path $env:TEMP 'rp-scene.html'
$prof = Join-Path $env:TEMP 'edge-rp-scenes'
if (Test-Path -LiteralPath $prof) { Remove-Item -LiteralPath $prof -Recurse -Force -ErrorAction SilentlyContinue }

$scenes = @('hover','chat','muted','danger','profile','empty','dark','darkchat','darkprofile',
            'act','dmg','dmg4','selected','shop','items','win','leave','backdrop','quotaout','nomodel',
            'focus','typebig','horror','thinking','speed','assistant','newres','clinic')
$bad = 0
foreach ($s in $scenes) {
  $url = "http://127.0.0.1:$Port/tools/preview.html?s=$s"
  & $edge --headless=new --disable-gpu --hide-scrollbars --no-first-run --allow-file-access-from-files `
    --user-data-dir="$prof" --virtual-time-budget=26000 --dump-dom $url 2>$null | Out-File -Encoding utf8 $tmp
  $html = Get-Content -LiteralPath $tmp -Raw
  # 场景成功时标题一定是 READY-<scene>；失败时是 ERROR-<scene> 并额外插入 <pre id="scene-error">
  $ok = ($html -match '<title>READY-') -and ($html -notmatch 'id="scene-error"')
  if ($ok) { "OK   scene $s" } else { $bad++; "FAIL scene $s" }
}
if ($bad -eq 0) { "ALL SCENES OK ($($scenes.Count))" } else { "SCENES FAILED: $bad" }
