import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nkFonts } from './scripts/nk-fonts.mjs';
import { nkPwa } from './scripts/nk-pwa.mjs';
import { nkLicenses } from './scripts/nk-licenses.mjs';

// 學習紀錄存在瀏覽器的 localStorage，而 localStorage 是跟著「網址＋連接埠」走的。
// 固定用 5288（開發和預覽都一樣），換次啟動也能接著學；strictPort 讓它不會悄悄換成別的埠。
// 啟動程式（scripts/start-lib.mjs 的 PORT）也寫死同一個埠，tests/start.test.ts 會檢查兩邊一致。
const PORT = 5288;

export default defineConfig({
  // './' 讓建置結果可以放在任何子路徑（例如 GitHub Pages 的 /nihongo-classroom/）
  base: './',
  // nkFonts：把兩套中日文字型裁成網站用得到的字（見 scripts/nk-fonts.mjs）
  // nkPwa：產生 sw.js，讓網站可以離線使用、加到主畫面（見 scripts/nk-pwa.mjs）
  // nkLicenses：補上套件沒附的授權全文（見 scripts/nk-licenses.mjs）
  plugins: [react(), nkFonts(), nkPwa(), nkLicenses()],
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
    rolldownOptions: {
      // 第一次建置時裁切字型要幾秒，不要印出「外掛花太久」的英文警告（之後有快取就很快）
      checks: { bundlerTimings: false },
      output: {
        // 首頁一開始就要的程式，拆成套件（vendor）和共用模組（shared）兩個檔，各頁的程式檔改成 import 它們。
        // 不拆的話，每一頁的程式檔都 import 主程式（檔名有內容雜湊），而主程式記著所有程式檔的檔名：
        // 改一課的資料，主程式改名 → 七十幾個 import 它的檔跟著改名，離線版更新要重下載約 1 MB。
        // 拆開以後，改一課只會換掉 1～3 個檔。
        codeSplitting: {
          groups: [
            { name: 'vendor', test: /node_modules[\\/]/, tags: ['$initial'], priority: 2 },
            {
              name: 'shared',
              priority: 1,
              tags: ['$initial'],
              test: (id: string) => /[\\/]src[\\/]/.test(id) && !/[\\/]src[\\/](main\.tsx|App\.tsx|pages[\\/])/.test(id),
            },
          ],
        },
      },
    },
  },
});
