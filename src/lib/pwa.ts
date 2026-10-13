/**
 * 離線使用、安裝成 App
 * - 註冊 service worker（dist/sw.js 由 scripts/nk-pwa.mjs 產生；開發模式沒有，所以不註冊）
 * - 記下瀏覽器「可以安裝」的事件，給設定頁的「安裝成 App」按鈕用
 * - useOnline：現在有沒有網路（AI 家教用來提醒）
 */
import { useSyncExternalStore } from 'react';

export type OfflineState = 'unsupported' | 'dev' | 'preparing' | 'ready' | 'failed';

export interface PwaState {
  /** 離線版本的狀態 */
  offline: OfflineState;
  /** 瀏覽器可以跳出安裝視窗（Chrome、Edge、Android） */
  canInstall: boolean;
  /** 現在是用安裝好的 App 開的（不是瀏覽器分頁） */
  standalone: boolean;
  /** 剛剛在這個分頁裡安裝好 */
  installed: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let state: PwaState = { offline: 'preparing', canInstall: false, standalone: false, installed: false };
const listeners = new Set<() => void>();
function patch(next: Partial<PwaState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const getState = () => state;

export function usePwa(): PwaState {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone、iPad（iPadOS 的 Safari 會假裝成 Mac，用觸控點數分辨） */
export function isAppleMobile(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

/** 跳出瀏覽器的安裝視窗；回傳使用者有沒有按安裝 */
export async function promptInstall(): Promise<boolean> {
  const e = deferredPrompt;
  if (!e) return false;
  deferredPrompt = null;
  patch({ canInstall: false });
  await e.prompt();
  const { outcome } = await e.userChoice;
  // 按了安裝就先顯示「安裝好了」，不用等瀏覽器的 appinstalled 事件
  if (outcome === 'accepted') patch({ installed: true });
  return outcome === 'accepted';
}

const UPDATE_CHECK_MS = 6 * 60 * 60 * 1000;

function watch(reg: ServiceWorkerRegistration) {
  if (reg.active) patch({ offline: 'ready' });
  const track = (sw: ServiceWorker | null) => {
    sw?.addEventListener('statechange', () => {
      if (sw.state === 'activated') patch({ offline: 'ready' });
      // 新版下載失敗時，舊版還在就照樣能離線用
      else if (sw.state === 'redundant' && !reg.active) patch({ offline: 'failed' });
    });
  };
  track(reg.installing ?? reg.waiting);
  reg.addEventListener('updatefound', () => track(reg.installing));

  // 安裝成 App 後常常一開好幾天：回到前景時，超過 6 小時沒檢查就看看有沒有新版本
  let lastCheck = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastCheck < UPDATE_CHECK_MS) return;
    lastCheck = Date.now();
    reg.update().catch(() => undefined);
  });
}

/** 開站時呼叫一次 */
export function initPwa(): void {
  patch({ standalone: isStandalone() });
  window.addEventListener('beforeinstallprompt', (e) => {
    // 不攔下瀏覽器自己的安裝提示，只是記下來，設定頁的按鈕也能用
    deferredPrompt = e as BeforeInstallPromptEvent;
    patch({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    patch({ canInstall: false, installed: true });
  });

  if (!('serviceWorker' in navigator)) {
    patch({ offline: 'unsupported' });
    return;
  }
  if (!import.meta.env.PROD) {
    patch({ offline: 'dev' });
    return;
  }
  const register = () => {
    navigator.serviceWorker.register('./sw.js').then(
      // 有些環境（例如擋掉 service worker 的瀏覽器設定）會回傳空值
      (reg) => (reg ? watch(reg) : patch({ offline: 'unsupported' })),
      () => patch({ offline: 'failed' }),
    );
  };
  // 等頁面載完再註冊：背景下載離線檔案時，不和第一次開啟的畫面搶網路
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

/** 現在有沒有網路（瀏覽器判斷的連線狀態） */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}
