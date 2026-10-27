import { Suspense, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { Meter } from './Controls';
import { ErrorBoundary } from './ErrorBoundary';
import { isRemoteVoice, useSpeech } from '../lib/speech';
import { activityStore, kanaStore, lessonStore, settingsStore, updateSettings } from '../state';
import { readJSON, storageHealth, useStore, writeJSON } from '../state/store';
import { countMastered, courseLessonsDone, HIRA_KEYS, kanaCourseDone } from '../lib/progress';
import { COURSE_LESSONS } from '../data/lessons/meta';

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
  { to: '/stats', label: '學習紀錄', icon: 'chart' },
  { to: '/settings', label: '設定', icon: 'gear' },
];

/** 練習底下的頁面（假名測驗、手寫描字、五十音表、錯題本）都算「練習」 */
function isPracticePath(path: string) {
  return path.startsWith('/practice') || path.startsWith('/writing') || path.startsWith('/chart') || path.startsWith('/mistakes');
}

/**
 * 主要功能的連結（上方分頁和手機的底部選單）。目前所在的那一個標成 active 和 aria-current，
 * 練習底下的頁面也算在「練習」（NavLink 只認得自己的網址，所以另外處理）。
 */
function MainLink({ item, base, children }: { item: (typeof PRIMARY)[number]; base: string; children: ReactNode }) {
  const { pathname } = useLocation();
  if (item.to === '/practice' && isPracticePath(pathname)) {
    return (
      <Link to={item.to} className={`${base} active`} aria-current="page">
        {children}
      </Link>
    );
  }
  return (
    <NavLink to={item.to} end={item.end} className={({ isActive }) => `${base} ${isActive ? 'active' : ''}`}>
      {children}
    </NavLink>
  );
}

function Loading() {
  return (
    <div className="wrap">
      <p className="loading">載入中…</p>
    </div>
  );
}

/** 線上語音念不出來（離線、連不到），又沒有內建的日文語音：按發音鍵的當下浮在畫面下方提醒（這次開網頁一次） */
function RemoteVoiceNote() {
  const sp = useSpeech();
  const [closed, setClosed] = useState(false);
  if (!sp.remoteFailed || closed || sp.voices.some((v) => !isRemoteVoice(v))) return null;
  return (
    <div className="vnote" role="status">
      <p>
        線上的日文語音現在念不出來（可能沒有網路，或連不到語音服務），這台裝置也沒有內建的日文語音，所以聽不到發音。Windows
        請到「設定 → 時間與語言 → 語音 → 新增語音」加入日文，之後沒有網路也能發音。
      </p>
      <button type="button" className="chip-btn" onClick={() => setClosed(true)}>
        知道了
      </button>
    </div>
  );
}

/**
 * 裝置沒有日文語音（或不支援語音）：放在頁面最上方，按「知道了」以後不再出現。
 * 不浮在畫面上：按掉之前會一直在，浮著的話會蓋住手寫的描字格、五十音表的說明面板。
 */
function VoiceNote() {
  const sp = useSpeech();
  const [closed, setClosed] = useState(() => readJSON('nk.vnote') === true);
  if (closed || !sp.ready || (sp.supported && sp.hasJapanese)) return null;
  return (
    <div className="wrap vnote-top">
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
  const lessons = useStore(lessonStore);
  const mastered = countMastered(stats, HIRA_KEYS);
  // 頁首的進度：還在學五十音時看平假名熟悉度；上初級課程以後看課程進度（不一定做過假名測驗，平假名會一直是 0）
  const inCourse = kanaCourseDone(lessons);
  const courseDone = courseLessonsDone(lessons);
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
            {inCourse ? (
              <span className="meter" title="初級課程完成幾課">
                <span className="meter-label">課程</span>
                <Meter value={courseDone} max={COURSE_LESSONS.length} label="初級課程完成" />
                <span className="meter-num">
                  {courseDone}/{COURSE_LESSONS.length}
                </span>
              </span>
            ) : (
              <span className="meter" title="平假名熟悉度">
                <span className="meter-label">平假名</span>
                <Meter value={mastered} max={46} label="平假名熟悉" />
                <span className="meter-num">{mastered}/46</span>
              </span>
            )}
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
              <MainLink key={p.to} item={p} base="tab">
                {p.label}
              </MainLink>
            ))}
          </nav>
        </div>
      </div>

      <div className="vnote-toast">
        <StorageWarning />
        <RemoteVoiceNote />
      </div>

      <main id="main" tabIndex={-1}>
        <VoiceNote />
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
          <MainLink key={p.to} item={p} base="bb-item">
            <Icon name={p.icon} size={21} />
            <span>{p.label}</span>
          </MainLink>
        ))}
      </nav>
    </div>
  );
}
