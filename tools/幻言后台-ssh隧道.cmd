@echo off
chcp 936 >nul
title 幻言后台（SSH 隧道）
setlocal enabledelayedexpansion

set "KEY=%USERPROFILE%\.ssh\openclaw-cloud"
set "SECRET=%USERPROFILE%\.huanyan-deploy.json"
set "SERVER=admin@8.138.170.154"
set "LPORT=18080"
set "ADMINURL=http://127.0.0.1:%LPORT%/admin"

echo.
echo   ============================================================
echo     幻言 · 打开内容后台
echo   ============================================================
echo.
echo   后台只允许从服务器本机访问，所以这里先开一条 SSH 隧道：
echo     你电脑的 127.0.0.1:%LPORT%  -^>  服务器的 127.0.0.1:80
echo   隧道只在那个窗口开着时有效；关掉窗口 = 关闭后台入口。
echo.

if not exist "%KEY%" goto :nokey

rem ------------------------------------------------------------------
rem  取令牌：以前用 powershell 解析 JSON，在 for /f 里引号嵌套会解析失败，
rem  结果令牌永远是空的、脚本直接退出 —— 表现就是"双击了没反应"。
rem  改成 findstr 取那一行、再去掉引号/空格/逗号，不依赖任何外部程序。
rem ------------------------------------------------------------------
set "TOKEN="
for /f "tokens=2 delims=:" %%i in ('findstr /i /c:"adminToken" "%SECRET%" 2^>nul') do set "TOKEN=%%i"
if defined TOKEN (
  set TOKEN=!TOKEN:"=!
  set TOKEN=!TOKEN: =!
  set TOKEN=!TOKEN:,=!
)
if not defined TOKEN goto :notoken

rem ------------------------------------------------------------------
rem  隧道可能已经开着（上次没关）。这时再 ssh -L 会报
rem  "bind: Address already in use" 然后当场退出，窗口一闪就没了。
rem  所以先探端口：已经在监听就跳过开隧道这一步。
rem ------------------------------------------------------------------
netstat -ano | findstr ":%LPORT%" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo   [1/2] 隧道已经在跑（本机 %LPORT% 已监听），跳过。
  goto :open
)

echo   [1/2] 打开隧道窗口...
start "幻言 SSH 隧道（关掉它就等于关闭后台入口）" cmd /k ssh -i %KEY% -N -L %LPORT%:127.0.0.1:80 %SERVER%
echo         等隧道就绪...
ping -n 4 127.0.0.1 >nul

:open
echo   [2/2] 打开后台页面...
start "" "%ADMINURL%?token=%TOKEN%"
echo.
echo   后台地址：%ADMINURL%
echo   地址里带的令牌只用于这一次打开，页面载入后会被抹掉。
echo.
echo   进不去时按这个顺序查：
echo     1^) 隧道那个窗口还在不在（关了就等于关闭入口，这是设计如此）
echo     2^) 手动打开 %ADMINURL% ，弹出令牌框就粘贴 %SECRET% 里的 adminToken
echo     3^) 服务器上服务在不在：ssh 上去跑 systemctl is-active huanyan.service
echo.
timeout /t 8 >nul
endlocal
exit /b 0

:nokey
echo   [x] 找不到 SSH 私钥：%KEY%
echo       没有它就建不了隧道。
echo.
pause
exit /b 1

:notoken
echo   [x] 从 %SECRET% 里读不到 adminToken
echo       打开那个文件，把 "adminToken" 后面引号里那串复制出来，
echo       然后手动打开 %ADMINURL% ，在页面的令牌框里粘贴。
echo.
pause
exit /b 1
