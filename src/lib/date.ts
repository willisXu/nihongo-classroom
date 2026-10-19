/** 一個「學習日」從凌晨 4 點開始，熬夜複習仍算前一天。 */
export const DAY_MS = 86_400_000;
export const DAY_START_HOUR = 4;

export function studyDayStart(ts: number): number {
  const d = new Date(ts);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAY_START_HOUR, 0, 0, 0);
  if (d.getTime() < start.getTime()) start.setDate(start.getDate() - 1);
  return start.getTime();
}

export function addDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 學習日的代號，例如 2026-10-12 */
export function studyDayKey(ts: number): string {
  const s = new Date(studyDayStart(ts));
  return `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`;
}

/** 兩個學習日之間差幾天 */
export function daysBetween(a: number, b: number): number {
  return Math.round((studyDayStart(b) - studyDayStart(a)) / DAY_MS);
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
/** 10 月 12 日（週一） */
export function formatDateZh(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日（週${WEEK[d.getDay()]}）`;
}

/** 10 月 12 日 21:30；不是今年就加上年份（2025 年 10 月 12 日 21:30） */
export function formatDateTimeZh(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const year = d.getFullYear() === new Date(now).getFullYear() ? '' : `${d.getFullYear()} 年 `;
  return `${year}${d.getMonth() + 1} 月 ${d.getDate()} 日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
