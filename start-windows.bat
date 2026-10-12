@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 日文自學教室
where node >nul 2>nul
if errorlevel 1 goto nonode
for /f "tokens=1 delims=." %%v in ('node -v') do set NODEV=%%v
set NODEV=%NODEV:v=%
if %NODEV% LSS 22 goto oldnode
if not exist node_modules (
  echo 第一次執行，正在安裝套件，約需 1 到 2 分鐘...
  call npm install
  if errorlevel 1 goto installfail
)
echo 正在啟動日文自學教室，瀏覽器會自動開啟 http://localhost:5288
echo 要結束時，關掉這個視窗即可。
call npm start
pause
exit /b 0

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

:installfail
echo 安裝失敗，請檢查網路連線後再試一次。
pause
exit /b 1
