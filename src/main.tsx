import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 字型只自帶兩套：假名用的教科書體、標題用的楷書；內文用系統的正體中文字型。
// nk-fonts.css 是建置時裁成網站用得到的字的版本（scripts/nk-fonts.mjs），只有幾 kB，跟著主要 CSS 一起載入，
// 字型檔已經在快取裡時，第一次畫面就是正確的字型，不會閃一下。
import './fonts/generated/nk-fonts.css';
import './styles/tokens.css';
import './styles/app.css';
import App, { applyTheme } from './App';
import { settingsStore } from './state';
import { storageHealth } from './state/store';
import { initSpeech } from './lib/speech';
import { initPwa } from './lib/pwa';
import { reloadOnce } from './components/ErrorBoundary';
import { preloading } from './data/lessons/preload';

// 網站更新後，舊分頁載不到新版的程式檔：自動重新整理一次（30 秒內不重複）。
// 沒有重新整理時不攔下錯誤，交給頁面的錯誤畫面顯示「重新整理」按鈕。
window.addEventListener('vite:preloadError', (event) => {
  // 背景預載下一課失敗：使用者還沒打開那一課，不重新整理正在看的這一課（真的打開時課文頁的錯誤處理會接手）
  if (preloading()) return;
  if (reloadOnce()) event.preventDefault();
});

applyTheme(settingsStore.get().theme);
storageHealth.probe();
initSpeech();
// 離線使用與安裝成 App（service worker 等頁面載完才註冊）
initPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
