import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 學習紀錄存在瀏覽器的 localStorage，而 localStorage 是跟著「網址＋連接埠」走的。
// 固定用 5288（開發和預覽都一樣），換次啟動也能接著學；strictPort 讓它不會悄悄換成別的埠。
// 啟動程式（scripts/start-lib.mjs 的 PORT）也寫死同一個埠，tests/start.test.ts 會檢查兩邊一致。
const PORT = 5288;

export default defineConfig({
  // './' 讓建置結果可以放在任何子路徑（例如 GitHub Pages 的 /nihongo-classroom/）
  base: './',
  plugins: [react()],
  server: { port: PORT, strictPort: true },
  preview: { port: PORT, strictPort: true },
  build: {
    chunkSizeWarningLimit: 1200,
    // 把打包進網站的 npm 套件（React、React Router、Anthropic SDK…）的授權全文
    // 輸出成 dist/THIRD-PARTY-LICENSES.md，和 index.html 放在一起發布。
    // 不用預設的 .vite/license.md：GitHub Pages 上傳時會略過以「.」開頭的資料夾。
    license: { fileName: 'THIRD-PARTY-LICENSES.md' },
  },
});
