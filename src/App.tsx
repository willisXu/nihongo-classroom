import { lazy, useEffect } from 'react';
import { HashRouter, Route, Routes, Link } from 'react-router-dom';
import { Layout } from './components/Layout';
import Home from './pages/Home';
import Lessons from './pages/Lessons';
import Vocab from './pages/Vocab';
import { settingsStore, type ThemePref } from './state';
import { useStore } from './state/store';
import { usePageTitle } from './lib/title';

// 首頁和兩個列表頁跟著主程式載入；其他頁面點進去才載入（筆順資料、Claude SDK 等不拖慢首頁）
const LessonPage = lazy(() => import('./pages/Lesson'));
const Chart = lazy(() => import('./pages/Chart'));
const Practice = lazy(() => import('./pages/Practice'));
const Writing = lazy(() => import('./pages/Writing'));
const Deck = lazy(() => import('./pages/Deck'));
const Review = lazy(() => import('./pages/Review'));
const Tutor = lazy(() => import('./pages/Tutor'));
const Settings = lazy(() => import('./pages/Settings'));
const Roadmap = lazy(() => import('./pages/Roadmap'));
const Mistakes = lazy(() => import('./pages/Mistakes'));
const Stats = lazy(() => import('./pages/Stats'));

/** 網址列、安裝後 App 標題列的顏色（和 index.html、tokens.css 的紙張顏色一樣） */
const BAR_COLOR = { light: '#f5f8f3', dark: '#1a2e28' };

export function applyTheme(theme: ThemePref) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  // 跟隨系統時兩個 meta 各自照系統的深淺；指定了筆記紙或黑板，兩個都用那個顏色，標題列才不會和頁面不搭
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const own = m.media.includes('dark') ? BAR_COLOR.dark : BAR_COLOR.light;
    m.content = theme === 'system' ? own : BAR_COLOR[theme];
  });
}

function NotFound() {
  usePageTitle('找不到這一頁');
  return (
    <div className="wrap">
      <header className="ph">
        <h1>找不到這一頁</h1>
        <p className="lede">
          網址可能打錯了。<Link to="/">回到今日</Link>
        </p>
      </header>
    </div>
  );
}

export default function App() {
  const settings = useStore(settingsStore);
  useEffect(() => applyTheme(settings.theme), [settings.theme]);

  return (
    <HashRouter>
      <Routes>
        {/* 載入中與錯誤畫面在 Layout 裡處理，換頁時頁首和導覽列不會消失 */}
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="lessons" element={<Lessons />} />
          <Route path="lessons/:id" element={<LessonPage />} />
          <Route path="chart" element={<Chart />} />
          <Route path="mistakes" element={<Mistakes />} />
          <Route path="stats" element={<Stats />} />
          <Route path="practice" element={<Practice />} />
          <Route path="writing" element={<Writing />} />
          <Route path="vocab" element={<Vocab />} />
          <Route path="vocab/:deck" element={<Deck />} />
          <Route path="review/:deck" element={<Review />} />
          <Route path="tutor" element={<Tutor />} />
          <Route path="roadmap" element={<Roadmap />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
