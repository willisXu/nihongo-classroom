import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nkFonts } from './scripts/nk-fonts.mjs';
import { nkPwa } from './scripts/nk-pwa.mjs';

// 學習紀錄存在瀏覽器的 localStorage，而 localStorage 是跟著「網址＋連接埠」走的。
// 固定用 5288（開發和預覽都一樣），換次啟動也能接著學；strictPort 讓它不會悄悄換成別的埠。
// 啟動程式（scripts/start-lib.mjs 的 PORT）也寫死同一個埠，tests/start.test.ts 會檢查兩邊一致。
const PORT = 5288;

export default defineConfig({
  // './' 讓建置結果可以放在任何子路徑（例如 GitHub Pages 的 /nihongo-classroom/）
  base: './',
  // nkFonts：把兩套中日文字型裁成網站用得到的字（見 scripts/nk-fonts.mjs）
  // nkPwa：產生 sw.js，讓網站可以離線使用、加到主畫面（見 scripts/nk-pwa.mjs）
  plugins: [react(), nkFonts(), nkPwa()],
  server: { port: PORT, strictPort: true },
  preview: { port: PORT, strictPort: true },
  build: {
    // 字型檔不要內嵌成 base64：內嵌後每一頁都得連同 CSS 下載全部字型，就失去「用到才下載」的好處
    assetsInlineLimit: (file: string) => (/\.woff2?$/.test(file) ? false : undefined),
    // 最大的程式檔是首頁主程式（約 320 kB）；任何一個超過 700 kB 就提醒，避免不知不覺越來越大
    chunkSizeWarningLimit: 700,
    // 把打包進網站的 npm 套件（React、React Router、Anthropic SDK…）的授權全文
    // 輸出成 dist/THIRD-PARTY-LICENSES.md，和 index.html 放在一起發布。
    // 不用預設的 .vite/license.md：GitHub Pages 上傳時會略過以「.」開頭的資料夾。
    license: { fileName: 'THIRD-PARTY-LICENSES.md' },
    // 第一次建置時裁切字型要幾秒，不要印出「外掛花太久」的英文警告（之後有快取就很快）
    rolldownOptions: { checks: { bundlerTimings: false } },
  },
});
