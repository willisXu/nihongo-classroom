import { useEffect } from 'react';

const SITE = '日文自學教室';

/** 設定分頁標題（「頁名 · 日文自學教室」），讓瀏覽器分頁和讀屏軟體知道換頁了 */
export function usePageTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE}` : SITE;
  }, [title]);
}
