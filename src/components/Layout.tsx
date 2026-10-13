import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { Meter } from './Controls';
import { ErrorBoundary } from './ErrorBoundary';
import { useSpeech } from '../lib/speech';
import { activityStore, kanaStore, settingsStore, updateSettings } from '../state';
import { readJSON, storageHealth, useStore, writeJSON } from '../state/store';
import { countMastered, HIRA_KEYS } from '../lib/progress';

const PRIMARY: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: '今日', icon: 'home', end: true },
  { to: '/lessons', label: '課程', icon: 'book' },
  { to: '/practice', label: '練習', icon: 'target' },
  { to: '/vocab', label: '單字', icon: 'cards' },
  { to: '/tutor', label: 'AI 家教', icon: 'chat' },
];

const SECONDARY: { to: string; label: string; icon: IconName }[] = [
  { to: '/chart', label: '五十音表', icon: 'grid' },
  { to: '/roadmap', label: '學習地圖', icon: 'map' },
  { to: '/settings', label: '設定', icon: 'gear' },
];

/** 練習底下的頁面（假名測驗、手寫描字、五十音表、錯題本）都算「練習」 */
function isPracticePath(path: string) {
  return path.startsWith('/practice') || path.startsWith('/writing') || path.startsWith('/chart') || path.startsWith('/mistakes');
}

function Loading() {
  return (
    <div className="wrap">
      <p className="loading">載入中…</p>
    </div>
  );
}

function VoiceNote() {
  const sp = useSpeech();
  const [closed, setClosed] = useState(() => readJSON('nk.vnote') === true);
  if (closed || !sp.ready || (sp.supported && sp.hasJapanese)) return null;
  return (
    <div className="vnote" role="status">
      <p>
        {sp.supported
          ? '這台裝置沒有找到日文語音，按發音鍵可能沒有聲音，或會用其他語言念。請在系統的語音設定加入「日文（Japanese）」語音，再重新開啟這頁。'
          : '這個瀏覽器不支援語音合成，聽不到發音。建議改用最新版的 Chrome、Edge 或 Safari。'}
      </p>
      <button
        type="button"
        className="chip-btn"
        onClick={() => {
          setClosed(true);
          writeJSON('nk.vnote', true);
        }}
      >
        知道了
      </button>
    </div>
  );
}

/** 存檔失敗（封鎖網站資料、空間已滿…）時提醒：不然重新整理後進度就不見了 */
function StorageWarning() {
  const failed = useSyncExternalStore(storageHealth.subscribe, storageHealth.failed, storageHealth.failed);
  const [closed, setClosed] = useState(false);
  if (!failed || closed) return null;
  return (
    <div className="vnote" role="alert">
      <p>
        這個瀏覽器現在存不了學習紀錄（可能封鎖了網站資料，或儲存空間已滿）。重新整理或關掉這一頁，剛才的進度就會不見；可以先到
        <NavLink to="/settings">設定</NavLink>「匯出備份」。
      </p>
      <button type="button" className="chip-btn" onClick={() => setClosed(true)}>
        知道了
      </button>
    </div>
  );
}

let persistAsked = false;

export function Layout() {
  const loc = useLocation();
  const stats = useStore(kanaStore);
  const settings = useStore(settingsStore);
  const activity = useStore(activityStore);
  const mastered = countMastered(stats, HIRA_KEYS);
  const prevPath = useRef(loc.pathname);

  // 換頁時回到頂端，並把焦點移到主要內容，讀屏軟體才知道換頁了（剛打開網站時不動）
  useEffect(() => {
    if (prevPath.current === loc.pathname) return;
    prevPath.current = loc.pathname;
    window.scrollTo(0, 0);
    const active = document.activeElement;
    // 頁面自己把焦點放到別處（例如輸入框）就不要搶
    if (!active || active === document.body || active.closest('.masthead, .tabbar, .bottombar')) {
      document.getElementById('main')?.focus({ preventScroll: true });
    }
  }, [loc.pathname]);

  // 開始有學習紀錄後，請瀏覽器不要在空間不足時自動清掉這個網站的資料（盡力而為）
  const hasActivity = Object.keys(activity).length > 0;
  useEffect(() => {
    if (!hasActivity || persistAsked) return;
    persistAsked = true;
    void navigator.storage?.persist?.().catch(() => false);
  }, [hasActivity]);

  return (
    <div className="app">
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        跳到主要內容
      </a>
      <header className="masthead">
        <div className="wrap masthead-row">
          <NavLink to="/" className="brand">
            <span className="masu brand-masu" aria-hidden="true">
              <span className="kana" lang="ja">
                あ
              </span>
            </span>
            <span>
              <span className="brand-name">日文自學教室</span>
              <span className="brand-sub">零基礎 · 從五十音開始</span>
            </span>
          </NavLink>
          <div className="tools">
            <span className="meter" title="平假名熟悉度">
              <span className="meter-label">平假名</span>
              <Meter value={mastered} max={46} label="平假名熟悉" />
              <span className="meter-num">{mastered}/46</span>
            </span>
            <button
              type="button"
              className="chip-btn"
              aria-pressed={settings.slow}
              onClick={() => updateSettings({ slow: !settings.slow })}
            >
              慢速發音
            </button>
            <nav className="subnav" aria-label="其他頁面">
              {SECONDARY.map((s) => (
                <NavLink key={s.to} to={s.to} className="subnav-link" title={s.label}>
                  <Icon name={s.icon} size={18} />
                  <span className="subnav-label">{s.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <div className="tabbar">
        <div className="wrap">
          <nav className="tabs" aria-label="主要功能">
            {PRIMARY.map((p) => (
              <NavLink
                key={p.to}
                to={p.to}
                end={p.end}
                className={({ isActive }) => `tab ${isActive || (p.to === '/practice' && isPracticePath(loc.pathname)) ? 'active' : ''}`}
              >
                {p.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      <div className="vnote-toast">
        <StorageWarning />
        <VoiceNote />
      </div>

      <main id="main" tabIndex={-1}>
        {/* 換頁就清掉錯誤狀態；網站更新後舊分頁載不到新檔案時，會自動重新整理一次 */}
        <ErrorBoundary key={loc.pathname}>
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <footer className="site-foot">
        <div className="wrap">
          <p>
            日文自學教室 · 學習紀錄只存在這個瀏覽器，可在<NavLink to="/settings">設定</NavLink>匯出備份。筆順資料來自{' '}
            <a href="https://kanjivg.tagaini.net/" target="_blank" rel="noopener noreferrer">
              KanjiVG
            </a>
            （
            <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer">
              CC BY-SA 3.0
            </a>
            ）·{' '}
            <a href="./THIRD-PARTY-LICENSES.md" target="_blank" rel="noopener">
              開源授權
            </a>
          </p>
        </div>
      </footer>

      <nav className="bottombar" aria-label="主要功能">
        {PRIMARY.map((p) => (
          <NavLink
            key={p.to}
            to={p.to}
            end={p.end}
            className={({ isActive }) => `bb-item ${isActive || (p.to === '/practice' && isPracticePath(loc.pathname)) ? 'active' : ''}`}
          >
            <Icon name={p.icon} size={21} />
            <span>{p.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
