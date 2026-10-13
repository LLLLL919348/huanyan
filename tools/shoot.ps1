# 截图验收：用无头 Edge 驱动 tools/preview.html 抓取各状态
# 用法： pwsh -File tools/shoot.ps1            抓全部
#        pwsh -File tools/shoot.ps1 chat      只抓某个状态
param([string]$Only = '')

$ErrorActionPreference = 'Continue'   # Edge 会往 stderr 写无关日志，不能中断脚本
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $PSScriptRoot 'shots'
New-Item -ItemType Directory -Force -Path $out | Out-Null
# 每次都用干净的浏览器档案：localStorage 里的额度 / 会话 / 装扮不会影响截图
$profile = Join-Path $env:TEMP 'edge-rp'
if (Test-Path -LiteralPath $profile) { Remove-Item -LiteralPath $profile -Recurse -Force -ErrorAction SilentlyContinue }

$scenes = @(
  @{ n = '01-resources'; s = 'none'; h = 1000 },
  @{ n = '02-hover';     s = 'hover'; h = 1000 },
  @{ n = '03-chat';      s = 'chat'; h = 1100 },
  @{ n = '04-muted';     s = 'muted'; h = 1000 },
  @{ n = '05-danger';    s = 'danger'; h = 1000 },
  @{ n = '06-profile';   s = 'profile'; h = 1100 },
  @{ n = '07-filter';    s = 'empty'; h = 900 },
  @{ n = '08-dark';      s = 'dark'; h = 1000 },
  @{ n = '09-dark-chat'; s = 'darkchat'; h = 1100 },
  @{ n = '10-dark-prof'; s = 'darkprofile'; h = 1100 },
  @{ n = '11-act';       s = 'act'; h = 1000 },
  @{ n = '12-dmg';       s = 'dmg'; h = 1000 },
  @{ n = '13-selected';  s = 'selected'; h = 1000 },
  @{ n = '14-shop';      s = 'shop'; h = 1250 },
  @{ n = '15-items';     s = 'items'; h = 1100 },
  @{ n = '16-win';       s = 'win'; h = 1000 },
  @{ n = '17-leave';     s = 'leave'; h = 1000 },
  @{ n = '18-backdrop';  s = 'backdrop'; h = 1000 },
  @{ n = '19-quota-out'; s = 'quotaout'; h = 1100 },
  @{ n = '20-nomodel';   s = 'nomodel'; h = 1000 },
  @{ n = '21-focus';     s = 'focus'; h = 1000 },
  @{ n = '22-type-big';  s = 'typebig'; h = 1100 },
  @{ n = '23-horror';    s = 'horror'; h = 1000 },
  @{ n = '25-thinking';  s = 'thinking'; h = 1000 }
)

# 后端在跑就走 http（顺带验证真实部署路径与 /api 数据），否则退回 file://
$port = 5599
$base = "file:///" + ($root -replace '\\', '/')
try {
  $null = Invoke-WebRequest "http://127.0.0.1:$port/api/health" -UseBasicParsing -TimeoutSec 3
  $base = "http://127.0.0.1:$port"
  Write-Host "使用后端：$base（资源来自 /api/resources）"
} catch {
  Write-Host "后端未启动，使用本地文件：$base（资源来自内置数据）"
}

foreach ($sc in $scenes) {
  if ($Only -and $sc.n -notlike "*$Only*") { continue }
  $url = if ($sc.s -eq 'none') {
    "$base/index.html"
  } else {
    "$base/tools/preview.html?s=" + $sc.s
  }
  $png = Join-Path $out ($sc.n + ".png")
  if (Test-Path $png) { Remove-Item $png -Force }
  & $edge --headless=new --disable-gpu --hide-scrollbars --no-first-run --allow-file-access-from-files `
    --user-data-dir="$profile" --virtual-time-budget=14000 `
    --window-size=1500,$($sc.h) --screenshot="$png" $url 2>$null | Out-Null
  if (Test-Path $png) {
    "OK   {0,-14} {1,8:N0} bytes" -f $sc.n, (Get-Item $png).Length
  } else {
    "FAIL $($sc.n)"
  }
}
