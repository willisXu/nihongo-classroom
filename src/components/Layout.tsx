import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { Meter } from './Controls';
import { useSpeech } from '../lib/speech';
import { kanaStore, settingsStore, updateSettings } from '../state';
import { readJSON, useStore, writeJSON } from '../state/store';
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

/** 練習底下的兩個頁面也算「練習」 */
function isPracticePath(path: string) {
  return path.startsWith('/practice') || path.startsWith('/writing');
}

function VoiceNote() {
  const sp = useSpeech();
  const [closed, setClosed] = useState(() => readJSON('nk.vnote') === true);
  if (closed || !sp.ready || (sp.supported && sp.hasJapanese)) return null;
  return (
    <div className="vnote-toast">
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

export function Layout() {
  const loc = useLocation();
  const stats = useStore(kanaStore);
  const settings = useStore(settingsStore);
  const mastered = countMastered(stats, HIRA_KEYS);

  // 換頁時回到頂端（同一頁內的錨點除外）
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

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
          <NavLink to="/" className="brand" aria-label="日文自學教室 首頁">
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

      <VoiceNote />

      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="site-foot">
        <div className="wrap">
          <p>
            日文自學教室 · 學習紀錄只存在這個瀏覽器，可在<NavLink to="/settings">設定</NavLink>匯出備份。筆順資料來自 KanjiVG（CC BY-SA 3.0）。
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
