import { useState, type ReactNode } from 'react';
import { isAppleMobile, promptInstall, usePwa, type OfflineState } from '../lib/pwa';

const OFFLINE_TEXT: Record<OfflineState, { tone: 'ok' | 'mark' | 'busy'; text: string }> = {
  ready: {
    tone: 'ok',
    text: '已經可以離線使用：課程、練習、五十音表和單字卡，沒有網路也打得開，學習紀錄照常儲存。AI 家教需要網路；離線時發音改用裝置內建的日文語音。',
  },
  preparing: { tone: 'busy', text: '正在背景下載離線要用的檔案（只需要一次），下載好之後沒有網路也能用。' },
  failed: { tone: 'mark', text: '離線檔案這次沒有下載完成（可能是網路不穩），下次開啟網站時會自動再試。' },
  unsupported: { tone: 'mark', text: '這個瀏覽器不支援離線使用，要有網路才能開啟。建議改用最新版的 Chrome、Edge 或 Safari。' },
  dev: { tone: 'busy', text: '開發模式不會啟用離線功能；用啟動檔（npm start）或線上版開啟才有。' },
};

const SAFARI_NOTE =
  '注意：用 Safari 加到主畫面（或 Mac 的 Dock）的 App，學習紀錄和 Safari 是分開存的。在 Safari 學過的話，先在這一頁「匯出備份」，再到 App 的設定頁「匯入備份」。';

/** 設定頁「App 與離線使用」：離線版本的狀態、安裝成 App 的按鈕或說明 */
export function AppInstall() {
  const pwa = usePwa();
  const [msg, setMsg] = useState<string | null>(null);
  const offline = OFFLINE_TEXT[pwa.offline];
  const apple = isAppleMobile();

  const install = async () => {
    const ok = await promptInstall();
    setMsg(ok ? null : '沒有安裝。之後想裝，可以從瀏覽器選單或網址列的安裝圖示安裝。');
  };

  let how: ReactNode;
  if (pwa.standalone) {
    how = (
      <p>
        你現在就是用安裝好的 App 開的。
        {apple ? '這個 App 的學習紀錄和 Safari 是分開的；要搬紀錄，用下面的匯出、匯入備份。' : ''}
      </p>
    );
  } else if (pwa.installed) {
    how = <p>安裝好了，之後可以從主畫面或應用程式清單直接開啟。</p>;
  } else if (pwa.canInstall) {
    how = (
      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={() => void install()}>
          安裝成 App
        </button>
        <span className="small">安裝後會出現在主畫面或開始選單，開起來是全螢幕，沒有網址列。</span>
      </div>
    );
  } else if (apple) {
    how = (
      <>
        <p>iPhone、iPad：在 Safari 點「分享」按鈕，選「加入主畫面」，就會像 App 一樣出現在主畫面。</p>
        <p className="small">{SAFARI_NOTE}</p>
      </>
    );
  } else {
    how = (
      <>
        <p>
          手機：用 Chrome 開啟，從選單選「加到主畫面」或「安裝應用程式」。電腦：用 Chrome 或 Edge 開啟，網址列右側會有「安裝」圖示；Mac 的
          Safari 可以從選單「檔案 → 加入 Dock」。
        </p>
        <p className="small">{SAFARI_NOTE}</p>
      </>
    );
  }

  return (
    <>
      <p className={`key-status tone-${offline.tone}`} role="status">
        {offline.text}
      </p>
      {how}
      {msg ? <p className="small">{msg}</p> : null}
    </>
  );
}
