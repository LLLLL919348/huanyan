@echo off
chcp 936 >nul
title 幻言后台（SSH 隧道）
setlocal

set "KEY=%USERPROFILE%\.ssh\openclaw-cloud"
set "SECRET=%USERPROFILE%\.huanyan-deploy.json"
set "SERVER=admin@8.138.170.154"
set "LPORT=18080"

echo.
echo   ============================================================
echo     幻言 · 打开内容后台
echo   ============================================================
echo.
echo   后台只允许从服务器本机访问，所以这里先开一条 SSH 隧道：
echo     你电脑的 127.0.0.1:%LPORT%  →  服务器的 127.0.0.1:80
echo   隧道只在下面这个窗口开着时有效；关掉窗口 = 关闭后台入口。
echo.

if not exist "%KEY%" (
  echo   [x] 找不到 SSH 私钥：%KEY%
  echo       没有它就建不了隧道。
  pause
  exit /b 1
)

set "TOKEN="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "try{(Get-Content -Raw '%SECRET%' ^| ConvertFrom-Json).adminToken}catch{''}"`) do set "TOKEN=%%i"
if "%TOKEN%"=="" (
  echo   [x] 读不到管理令牌（%SECRET%）
  echo       令牌在部署时生成；丢了可以重新部署一次（tools\deploy.ps1）。
  pause
  exit /b 1
)

echo   [1/3] 打开隧道窗口...
start "幻言 SSH 隧道（关掉它就等于关闭后台入口）" cmd /k "chcp 936 >nul & echo 隧道已建立：本机 %LPORT% -^> 服务器 80。关掉本窗口即断开。 & ssh -i "%KEY%" -N -L %LPORT%:127.0.0.1:80 %SERVER%"

echo   [2/3] 等隧道就绪...
ping -n 4 127.0.0.1 >nul

echo   [3/3] 打开后台页面...
start "" "http://127.0.0.1:%LPORT%/admin?token=%TOKEN%"

echo.
echo   后台地址：http://127.0.0.1:%LPORT%/admin
echo   访问统计：http://127.0.0.1:%LPORT%/admin  → 顶部「访问统计」标签
echo   站点前台：http://8.138.170.154/
echo.
echo   （本窗口可以关掉，隧道在另一个窗口里）
timeout /t 8 >nul
endlocal
