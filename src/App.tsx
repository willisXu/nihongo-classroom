import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Route, Routes, Link } from 'react-router-dom';
import { Layout } from './components/Layout';
import Home from './pages/Home';
import Lessons from './pages/Lessons';
import LessonPage from './pages/Lesson';
import Chart from './pages/Chart';
import Practice from './pages/Practice';
import Vocab from './pages/Vocab';
import Deck from './pages/Deck';
import Review from './pages/Review';
import { settingsStore, type ThemePref } from './state';
import { useStore } from './state/store';

// 用到 Claude SDK 或筆順引擎的頁面分開載入
const Writing = lazy(() => import('./pages/Writing'));
const Tutor = lazy(() => import('./pages/Tutor'));
const Settings = lazy(() => import('./pages/Settings'));
const Roadmap = lazy(() => import('./pages/Roadmap'));

export function applyTheme(theme: ThemePref) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

function NotFound() {
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

function Loading() {
  return (
    <div className="wrap">
      <p className="loading">載入中…</p>
    </div>
  );
}

export default function App() {
  const settings = useStore(settingsStore);
  useEffect(() => applyTheme(settings.theme), [settings.theme]);

  return (
    <HashRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="lessons" element={<Lessons />} />
            <Route path="lessons/:id" element={<LessonPage />} />
            <Route path="chart" element={<Chart />} />
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
      </Suspense>
    </HashRouter>
  );
}
