import { Component, type ErrorInfo, type ReactNode } from 'react';

const RELOAD_KEY = 'nk-reload-at';

/**
 * 網站更新後，還開著的舊分頁要載入的程式檔已經換了名字（檔名含內容雜湊），會載入失敗。
 * 各家瀏覽器的訊息不同，這裡都認得。
 */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError/i.test(msg);
}

/** 重新整理一次拿新版；30 秒內不重複，避免真的載不到時一直重整。回傳是否已經重新整理 */
export function reloadOnce(): boolean {
  // 沒有網路時重新整理只會看到瀏覽器的離線畫面，交給錯誤畫面說明就好
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false; // 記不住重整過沒有，就不要自動重整
  }
  window.location.reload();
  return true;
}

interface State {
  error: unknown;
}

/** 頁面出錯時顯示說明和「重新整理」，不讓整個網站變成白畫面 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isChunkLoadError(error) && reloadOnce()) return;
    console.error(error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkLoadError(error);
    const offline = chunk && navigator.onLine === false;
    const updated = chunk && !offline;
    return (
      <div className="wrap">
        <header className="ph">
          <h1>{offline ? '目前沒有網路' : updated ? '網站剛更新了' : '這一頁出了點問題'}</h1>
          <p className="lede">
            {offline
              ? '這一頁第一次打開需要連上網路才能載入。連上網路後按「重新整理」。學習紀錄不受影響。'
              : updated
                ? '這個分頁還是舊版，重新整理就會換成新版。學習紀錄不受影響。'
                : '學習紀錄不受影響。重新整理通常就會恢復；如果一直發生，可以先回到首頁。'}
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              重新整理
            </button>
            <a className="btn" href="#/">
              回到今日
            </a>
          </div>
          {!chunk && error instanceof Error ? <p className="small err-detail">錯誤訊息：{error.message}</p> : null}
        </header>
      </div>
    );
  }
}
