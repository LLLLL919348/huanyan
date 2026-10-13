@echo off
chcp 936 >nul
title 幻言 - 手机试玩（局域网模式）
cd /d "D:\agent\roleplay-studio"

echo.
echo   ============================================================
echo     幻言 · 手机试玩（局域网模式）
echo   ============================================================
echo.
echo   这个模式让同一个 Wi-Fi 下的手机能打开站点。
echo   注意两点：
echo     1) 同一 Wi-Fi 下任何人都能打开并对话（会消耗你配的模型额度），
echo        所以试完请关掉这个窗口，恢复成「只听本机」的启动方式。
echo     2) Windows 可能弹出防火墙提示，请选择「允许访问」（专用网络）。
echo.

rem ---- 取本机局域网 IP 与一个随机管理令牌 ----
set "LANIP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } ^| Select-Object -First 1).IPAddress"`) do set "LANIP=%%i"
set "TOKEN="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "[guid]::NewGuid().ToString('N')"`) do set "TOKEN=%%i"
if "%LANIP%"=="" set "LANIP=127.0.0.1"
if "%TOKEN%"=="" set "TOKEN=localdev"

rem ---- 端口被占就先停掉旧实例（否则 0.0.0.0 绑不上）----
netstat -ano | findstr ":5599" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo   [1/3] 5599 端口已有站点在跑，先停掉它...
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5599" ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>&1
  ping -n 3 127.0.0.1 >nul
) else (
  echo   [1/3] 5599 端口空闲
)

echo   [2/3] 用局域网模式启动（0.0.0.0:5599）
echo.
echo   ------------------------------------------------------------
echo     手机请打开这个地址（要和这台电脑连同一个 Wi-Fi）：
echo.
echo         http://%LANIP%:5599/
echo.
echo     内容后台（只有这台电脑用，带令牌才改得动）：
echo         http://127.0.0.1:5599/admin?token=%TOKEN%
echo.
echo     关掉本窗口即停止站点服务。
echo   ------------------------------------------------------------
echo.

set HOST=0.0.0.0
set ADMIN_TOKEN=%TOKEN%
node "server\server.js" 5599

echo.
echo   站点已停止。想恢复成「只听本机」的常规模式，双击 启动站点.cmd 即可。
pause
