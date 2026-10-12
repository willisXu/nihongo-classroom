#!/bin/bash
# 日文自學教室：macOS 啟動檔（在 Finder 雙擊，或在終端機執行 ./start-mac.command）
# Node.js 版本細節（22.12 以上）、連接埠 5288、安裝套件和建置都交給 scripts/start.mjs。
cd "$(dirname "$0")" || exit 1

wait_for_key() {
  echo
  read -r -n 1 -s -p "按任意鍵結束…"
  echo
}

if ! command -v node >/dev/null 2>&1; then
  echo "找不到 Node.js。請先到 https://nodejs.org/ 下載安裝 LTS 版，再重新執行。"
  open "https://nodejs.org/"
  wait_for_key
  exit 1
fi
NODE_MAJOR=$(node -v | sed -E 's/^v([0-9]+).*/\1/')
case "$NODE_MAJOR" in
  '' | *[!0-9]*) NODE_MAJOR=0 ;;
esac
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "你的 Node.js 版本太舊（需要 22.12 以上）。請到 https://nodejs.org/ 安裝最新的 LTS 版。"
  open "https://nodejs.org/"
  wait_for_key
  exit 1
fi

node scripts/start.mjs
status=$?
if [ "$status" -ne 0 ]; then
  wait_for_key
fi
exit "$status"
