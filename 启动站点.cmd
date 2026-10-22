@echo off
chcp 936 >nul
title 幻言 · 本地站点（关掉这个窗口就停）
cd /d "D:\agent\roleplay-studio"

netstat -ano | findstr ":5599" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo.
  echo   5599 上已经有一个服务在跑，直接打开浏览器。
  echo.
  echo   站点：http://127.0.0.1:5599/
  echo   后台：http://127.0.0.1:5599/admin
  echo.
  echo   注意：如果那个服务是用 ADMIN_TOKEN 起的，后台会要求令牌；
  echo         正常双击本文件启动的那个不带令牌，后台可以直接进。
  echo.
  start "" http://127.0.0.1:5599/
  ping -n 4 127.0.0.1 >nul
  exit /b
)

echo.
echo   ================================================
echo     幻言 · 本地站点（只在本机可访问）
echo   ================================================
echo.
echo   站点：http://127.0.0.1:5599/
echo   后台：http://127.0.0.1:5599/admin
echo.
echo   本窗口关掉 = 站点停止；数据都在 data\ 下面，可以整体备份。
echo   线上站点在 http://8.138.170.154/
echo   注意：改本地不会同步到线上，要跑 tools\deploy.ps1 才会生效。
echo.
start "" http://127.0.0.1:5599/
node "server\server.js" 5599

echo.
echo   ------------------------------------------------
echo   服务已退出（端口被占用，或者没装 Node.js）
echo   ------------------------------------------------
pause
