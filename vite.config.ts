import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' 讓建置結果可以放在任何子路徑（例如 GitHub Pages 的 /nihongo-classroom/）
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
