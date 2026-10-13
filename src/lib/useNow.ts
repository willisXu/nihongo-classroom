import { useEffect, useState } from 'react';
import { addDays, studyDayStart } from './date';

/**
 * 現在時間（給首頁的今天任務、學習紀錄頁這種「今天」的畫面）。
 * App 開著過夜時畫面不會自己重畫：回到這個分頁、視窗拿回焦點、從上一頁回來，
 * 或是過了凌晨 4 點換日，都重新取一次時間。
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    // 下一次換日（多等 1 秒，確定已經過了凌晨 4 點）
    const wait = addDays(studyDayStart(now), 1) - Date.now() + 1000;
    const timer = window.setTimeout(refresh, Math.max(1000, Math.min(wait, 2 ** 31 - 1)));
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      window.clearTimeout(timer);
    };
  }, [now]);
  return now;
}
