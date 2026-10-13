@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 日文自學教室
rem Exact Node.js version (22.12+), port 5288, npm ci and the build are all handled by scripts\start.mjs
where node >nul 2>nul
if errorlevel 1 goto nonode
set "NODEV=0"
for /f "tokens=1 delims=." %%v in ('node -v') do set "NODEV=%%v"
set "NODEV=%NODEV:v=%"
if %NODEV% LSS 22 goto oldnode
rem call: if node is a .cmd shim (some version managers), control still returns here so errors stay visible
call node scripts\start.mjs
rem Any non-zero code, including negative Windows crash codes, keeps the window open
if %errorlevel% neq 0 goto failed
exit /b 0

:failed
echo.
pause
exit /b 1

:nonode
echo 找不到 Node.js。請先到 https://nodejs.org/ 下載安裝 LTS 版，再重新執行這個檔案。
start "" https://nodejs.org/
pause
exit /b 1

:oldnode
echo 你的 Node.js 版本太舊（需要 22.12 以上）。請到 https://nodejs.org/ 安裝最新的 LTS 版，再重新執行這個檔案。
start "" https://nodejs.org/
pause
exit /b 1
