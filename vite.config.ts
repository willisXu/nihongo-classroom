import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 學習紀錄存在瀏覽器的 localStorage，而 localStorage 是跟著「網址＋連接埠」走的。
// 固定用 5288（開發和預覽都一樣），換次啟動也能接著學；strictPort 讓它不會悄悄換成別的埠。
const PORT = 5288;

export default defineConfig({
  // './' 讓建置結果可以放在任何子路徑（例如 GitHub Pages 的 /nihongo-classroom/）
  base: './',
  plugins: [react()],
  server: { port: PORT, strictPort: true },
  preview: { port: PORT, strictPort: true },
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
