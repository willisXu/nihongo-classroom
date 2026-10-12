import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 字型只自帶兩套：假名用的教科書體、標題用的楷書；內文用系統的正體中文字型
import '@fontsource/klee-one/600.css';
import '@fontsource/lxgw-wenkai-tc/700.css';
import './styles/tokens.css';
import './styles/app.css';
import App, { applyTheme } from './App';
import { settingsStore } from './state';
import { storageHealth } from './state/store';
import { initSpeech } from './lib/speech';
import { reloadOnce } from './components/ErrorBoundary';

// 網站更新後，舊分頁載不到新版的程式檔：自動重新整理一次（30 秒內不重複）。
// 沒有重新整理時不攔下錯誤，交給頁面的錯誤畫面顯示「重新整理」按鈕。
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnce()) event.preventDefault();
});

applyTheme(settingsStore.get().theme);
storageHealth.probe();
initSpeech();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
