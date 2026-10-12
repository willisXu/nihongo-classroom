import { useSyncExternalStore } from 'react';

/** localStorage 讀寫：私密視窗或封鎖網站資料時會丟例外，一律吞掉，頁面照常運作。 */
export function readJSON(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 存不進去就算了，資料仍在記憶體裡 */
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
      if (e.key !== key) return;
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
