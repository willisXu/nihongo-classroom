/**
 * 背景預載中的課文檔案數（index.ts 的 preloadLesson）。
 * 預載失敗時 Vite 也會發出 vite:preloadError；main.tsx 看到有預載在進行就不重新整理：
 * 失敗的是使用者還沒打開的下一課，真的打開那一課時，課文頁的錯誤處理（ErrorBoundary）會接手。
 */
let pending = 0;

/** 現在有沒有課文在背景預載 */
export const preloading = (): boolean => pending > 0;

/** 把這次下載算成背景預載，直到下載完（成功或失敗） */
export function asPreload<T>(load: Promise<T>): Promise<T> {
  pending++;
  return load.finally(() => {
    pending--;
  });
}
