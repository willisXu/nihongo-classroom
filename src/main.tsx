import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 字型只自帶兩套：假名用的教科書體、標題用的楷書；內文用系統的正體中文字型
import '@fontsource/klee-one/600.css';
import '@fontsource/lxgw-wenkai-tc/700.css';
import './styles/tokens.css';
import './styles/app.css';
import App, { applyTheme } from './App';
import { settingsStore } from './state';
import { initSpeech } from './lib/speech';

applyTheme(settingsStore.get().theme);
initSpeech();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
