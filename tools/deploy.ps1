# ============================================================================
# 幻言站点 · 部署到阿里云服务器（本地执行）
#   1) 只上传"该上线的文件"：index.html / assets / admin / server / data 三件套
#      —— docs、tools、README、.git 一律不传（它们含内部信息）
#   2) 在服务器上跑 server-install.sh（装 systemd 服务、监听 80）
#   3) 核对线上防护：后台对访客必须 404
# 用法：powershell -File tools/deploy.ps1            # 完整部署
#       powershell -File tools/deploy.ps1 -DryRun    # 只看会上传哪些文件
# NOTE: 本文件保持纯 ASCII，避免 PS 5.1 读取出错。
# ============================================================================
param(
  [string]$Server = '8.138.170.154',
  [string]$User = 'admin',
  [string]$KeyPath = "$env:USERPROFILE\.ssh\openclaw-cloud",
  [string]$RemoteDir = '/home/admin/huanyan',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$secretFile = "$env:USERPROFILE\.huanyan-deploy.json"

function Say($m) { Write-Host $m }

Say "=== 0) 准备管理令牌 ==="
$secret = $null
if (Test-Path $secretFile) { $secret = Get-Content $secretFile -Raw | ConvertFrom-Json }
if (-not $secret -or -not $secret.adminToken) {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $tok = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
  $secret = [pscustomobject]@{ server = $Server; adminToken = $tok; createdAt = (Get-Date).ToString('s') }
  $secret | ConvertTo-Json | Set-Content $secretFile -Encoding UTF8
  Say "  已生成新的管理令牌并写入 $secretFile（不要提交到仓库）"
} else {
  Say "  复用已有令牌（$secretFile）"
}

Say "=== 1) 组装 staging（只放该上线的文件）==="
$stage = Join-Path $env:TEMP ('huanyan-stage-' + [guid]::NewGuid().ToString('N').Substring(0, 6))
New-Item -ItemType Directory -Force -Path $stage | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'data') | Out-Null

Copy-Item (Join-Path $root 'index.html') $stage -Force
foreach ($d in 'assets', 'admin', 'server') {
  Copy-Item (Join-Path $root $d) (Join-Path $stage $d) -Recurse -Force
}
foreach ($f in 'resources.json', 'settings.json', 'model.json') {
  $src = Join-Path $root ('data\' + $f)
  if (Test-Path $src) { Copy-Item $src (Join-Path $stage 'data') -Force }
}
# 明确排除：运行期状态与内部资料
Remove-Item (Join-Path $stage 'data\quota.json') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $stage 'data\stats.json') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $stage 'data\server-error.log') -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'data\uploads') | Out-Null

$files = Get-ChildItem $stage -Recurse -File
$total = ($files | Measure-Object Length -Sum).Sum
Say ("  待上传 " + $files.Count + " 个文件，" + [math]::Round($total / 1KB, 0) + " KB")
$files | Where-Object { $_.FullName -notmatch '\\assets\\' } | ForEach-Object { Say ("    " + $_.FullName.Replace($stage, '')) }
Say ("    assets\ ... 共 " + ($files | Where-Object { $_.FullName -match '\\assets\\' }).Count + " 个")

if ($DryRun) { Say "（-DryRun：到此为止）"; Remove-Item $stage -Recurse -Force; exit 0 }

Say "=== 2) 上传（scp）==="
& ssh -i $KeyPath -o BatchMode=yes "$User@$Server" "mkdir -p $RemoteDir/data/uploads"
& scp -i $KeyPath -o BatchMode=yes -r "$stage/*" "${User}@${Server}:$RemoteDir/"
if ($LASTEXITCODE -ne 0) { throw "scp 失败（退出码 $LASTEXITCODE）" }

Say "=== 3) 上传安装脚本并执行 ==="
& scp -i $KeyPath -o BatchMode=yes (Join-Path $PSScriptRoot 'server-install.sh') "${User}@${Server}:/tmp/server-install.sh"
$install = "sed -i 's/\r$//' /tmp/server-install.sh; bash /tmp/server-install.sh " + $secret.adminToken
& ssh -i $KeyPath -o BatchMode=yes "$User@$Server" $install

Say "=== 4) 清理 staging ==="
Remove-Item $stage -Recurse -Force
Say "=== 部署完成 ==="
Say ("  站点: http://" + $Server + "/（需在阿里云控制台放行 80 端口）")
Say ("  后台: 只能从本机经 SSH 隧道访问，见桌面快捷方式；令牌在 " + $secretFile)
