@echo off
chcp 936 >nul
cd /d "%~dp0"
title 幻言 · 备份到 GitHub
echo ============================================================
echo   幻言 · 把站点内容备份到 GitHub
echo   远端：https://github.com/LLLLL919348/huanyan
echo ============================================================
echo.

rem ---- 1) 先确认代理在跑：这台机器直连 github.com 是被拦的 ----
netstat -ano | findstr ":7890" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo [x] 没有检测到本机代理（127.0.0.1:7890）。
  echo.
  echo     这台电脑直连 github.com 是打不通的（TCP 能连上，但之后没有任何响应），
  echo     所以推代码之前必须先开代理：
  echo.
  echo       1. 双击打开 Clash for Windows
  echo       2. 打开它的「System Proxy / 系统代理」开关
  echo       3. 再双击一次本脚本
  echo.
  pause
  exit /b 1
)
echo [1/3] 代理正常（127.0.0.1:7890 在监听）
echo.

rem ---- 2) 提交改动 ----
echo [2/3] 当前的改动：
git status --short
echo.
git add -A
set "MSG="
set /p "MSG=写一句本次备份说明（直接回车 = 站点内容更新）: "
if "%MSG%"=="" set "MSG=站点内容更新"
git commit -m "%MSG%"
if errorlevel 1 echo      （没有新改动，或提交没成功；下面照样尝试推送）
echo.

rem ---- 3) 推送 ----
echo [3/3] 正在推送到 GitHub...
git push origin main
if errorlevel 1 (
  echo.
  echo [x] 推送失败。常见原因：
  echo     - 代理掉了：回 Clash 看一眼「系统代理」还开着没
  echo     - 凭据失效：再运行一次本脚本，会弹出浏览器，点 Authorize 即可
  echo     - 网络抖动：等一会儿重试
  echo.
  pause
  exit /b 1
)
echo.
echo [√] 备份完成。
echo     去这里看：https://github.com/LLLLL919348/huanyan
echo.
echo     提示：data\model.json（模型密钥）、data\quota.json（访客额度）、
echo           tools\shots（测试截图）是故意不备份的，规则见 .gitignore。
echo.
pause
