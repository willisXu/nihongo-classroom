import { useSyncExternalStore } from 'react';

/** localStorage 讀寫：封鎖網站資料或空間已滿時會丟例外；讀取失敗當作沒有資料，寫入失敗會記下來提醒使用者。 */
export function readJSON(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

/* ---------- 存檔失敗偵測：封鎖網站資料、空間已滿等情況要讓使用者知道 ---------- */
let saveFailed = false;
const healthListeners = new Set<() => void>();
function markSaveFailed() {
  if (saveFailed) return;
  saveFailed = true;
  healthListeners.forEach((l) => l());
}

export const storageHealth = {
  /** 這次開啟網站後，有沒有存檔失敗過 */
  failed: (): boolean => saveFailed,
  subscribe(listener: () => void): () => void {
    healthListeners.add(listener);
    return () => healthListeners.delete(listener);
  },
  /** 開站時先試寫一次，及早發現存不進去的瀏覽器 */
  probe(): void {
    try {
      localStorage.setItem('nk.probe', '1');
      localStorage.removeItem('nk.probe');
    } catch {
      markSaveFailed();
    }
  },
};

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 頁面照常運作（資料仍在記憶體裡），但要提醒使用者重新整理後會不見
    markSaveFailed();
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export interface Store<T> {
  key: string;
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
  /** 從外部資料（匯入備份）重新載入 */
  load(raw: unknown): void;
  /** 把外部資料整理成正確形狀，但不載入（匯入前先看備份的內容） */
  parse(raw: unknown): T;
  reset(): void;
}

/**
 * 會自動存進 localStorage 的小型狀態。
 * normalize 負責把舊版或壞掉的資料修成正確形狀。
 */
export function createStore<T>(key: string, initial: () => T, normalize: (raw: unknown) => T): Store<T> {
  let state: T = normalize(readJSON(key));
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      // key 為 null 代表另一個分頁清空了整個 localStorage
      if (e.key !== key && e.key !== null) return;
      state = normalize(readJSON(key));
      emit();
    });
  }

  return {
    key,
    get: () => state,
    set(next) {
      state = typeof next === 'function' ? (next as (p: T) => T)(state) : next;
      writeJSON(key, state);
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load(raw) {
      state = normalize(raw);
      writeJSON(key, state);
      emit();
    },
    parse: normalize,
    reset() {
      state = initial();
      removeKey(key);
      emit();
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/* ---------- 形狀檢查小工具 ---------- */
export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const bool = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d);
export const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
export function oneOf<T extends string>(v: unknown, list: readonly T[], d: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d;
}
