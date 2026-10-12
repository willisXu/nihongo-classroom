#!/bin/bash
# 日文自學教室：macOS 啟動檔（在 Finder 雙擊，或在終端機執行 ./start-mac.command）
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "找不到 Node.js。請先到 https://nodejs.org/ 下載安裝 LTS 版，再重新執行。"
  open "https://nodejs.org/"
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "第一次執行，正在安裝套件，約需 1 到 2 分鐘..."
  npm install || { echo "安裝失敗，請檢查網路連線後再試一次。"; exit 1; }
fi
echo "正在啟動日文自學教室，瀏覽器會自動開啟 http://localhost:5288"
echo "要結束時，按 Ctrl+C 或關掉這個視窗。"
npm start
