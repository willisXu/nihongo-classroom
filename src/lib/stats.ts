/**
 * 學習紀錄頁的統計：每天、每週的練習量，進步曲線，和目前的熟悉度。
 * 全部從瀏覽器裡的學習紀錄算出來；學習日從凌晨 4 點開始（見 date.ts）。
 */
import { SEION_CELLS } from '../data/kana';
import { DECK_META, metaItemIds, wordGroups } from '../data/vocab/meta';
import { kanaLevel, type Activity, type KanaDays, type KanaStats, type SrsData } from '../state';
import { addDays, studyDayKey, studyDayStart } from './date';
import type { CardState } from './srs';

/** 學習日代號（2026-10-13）→ 那個學習日的開始時間（凌晨 4 點） */
export function keyStart(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return studyDayStart(new Date(y, m - 1, d, 12).getTime());
}

export interface DayActivity {
  kana: number;
  review: number;
  writing: number;
  lesson: number;
  tutor: number;
  /** 全部加起來的練習次數 */
  total: number;
}

export function dayActivity(activity: Activity, key: string): DayActivity {
  const d = activity[key] ?? {};
  const kana = d.kana ?? 0;
  const review = d.review ?? 0;
  const writing = d.writing ?? 0;
  const lesson = d.lesson ?? 0;
  const tutor = d.tutor ?? 0;
  return { kana, review, writing, lesson, tutor, total: kana + review + writing + lesson + tutor };
}

/** 日曆格子的深淺：0 沒學；1–9、10–29、30–59、60 以上次練習分成 1～4 */
export const HEAT_LIMITS = [10, 30, 60] as const;
export type HeatLevel = 0 | 1 | 2 | 3 | 4;
export function heatLevel(total: number): HeatLevel {
  if (total <= 0) return 0;
  if (total < HEAT_LIMITS[0]) return 1;
  if (total < HEAT_LIMITS[1]) return 2;
  if (total < HEAT_LIMITS[2]) return 3;
  return 4;
}

export interface CalendarDay {
  key: string;
  /** 學習日開始時間 */
  date: number;
  /** 今天以後（還沒到） */
  future: boolean;
  act: DayActivity;
  level: HeatLevel;
}

/** 最近幾週的日曆：每一欄是一週（週日在最上面），最後一欄是這一週 */
export function calendar(activity: Activity, now: number, weeks: number): CalendarDay[][] {
  const today = studyDayStart(now);
  const start = addDays(today, -new Date(today).getDay() - (weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(start, w * 7 + d);
      const key = studyDayKey(date);
      const act = dayActivity(activity, key);
      const future = date > today;
      return { key, date, future, act, level: future ? 0 : heatLevel(act.total) };
    }),
  );
}

/** 有學習的天數、最長連續天數、第一天 */
export function studySummary(activity: Activity): { days: number; longest: number; first: string | null } {
  const keys = Object.keys(activity)
    .filter((k) => dayActivity(activity, k).total > 0)
    .sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of keys) {
    run = prev && studyDayKey(addDays(keyStart(prev), 1)) === k ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = k;
  }
  return { days: keys.length, longest, first: keys[0] ?? null };
}

export interface WeekTotal {
  /** 這一週第一天（週日）的學習日開始時間 */
  start: number;
  kana: number;
  review: number;
  writing: number;
}

/** 最近幾週每週的練習量（最後一週是這一週，算到今天） */
export function weeklyTotals(activity: Activity, now: number, weeks: number): WeekTotal[] {
  return calendar(activity, now, weeks).map((col) =>
    col.reduce<WeekTotal>(
      (w, d) => ({ ...w, kana: w.kana + d.act.kana, review: w.review + d.act.review, writing: w.writing + d.act.writing }),
      { start: col[0].date, kana: 0, review: 0, writing: 0 },
    ),
  );
}

export interface Point {
  key: string;
  date: number;
  value: number;
}

/** 曲線最多畫幾天（手機時間錯成很早的日期時，曲線還是畫到今天） */
const MAX_DAYS = 3660;

/** 從 firstKey 到今天的每一天（最多最近 MAX_DAYS 天） */
function eachDay(firstKey: string, now: number): { key: string; date: number }[] {
  const out: { key: string; date: number }[] = [];
  const today = studyDayStart(now);
  for (let date = Math.max(keyStart(firstKey), addDays(today, -(MAX_DAYS - 1))); date <= today; date = addDays(date, 1)) {
    out.push({ key: studyDayKey(date), date });
  }
  return out;
}

/** 學過的單字（每天學的新卡累加），從第一次背單字那天到今天 */
export function vocabLearnedSeries(srs: SrsData, now: number): Point[] {
  const first = Object.keys(srs.days)
    .filter((k) => srs.days[k].fresh > 0)
    .sort()[0];
  if (!first) return [];
  const days = eachDay(first, now);
  // 紀錄全都在今天以後（手機時間曾經調快、往西跨時區）：沒有可以畫的日子
  if (!days.length) return [];
  // 畫不到的更早日子（超過 MAX_DAYS 天）也要算進累計
  let total = Object.keys(srs.days)
    .filter((k) => k < days[0].key)
    .reduce((sum, k) => sum + srs.days[k].fresh, 0);
  return days.map(({ key, date }) => {
    total += srs.days[key]?.fresh ?? 0;
    return { key, date, value: total };
  });
}

/** 熟悉的平假名、片假名（每天最後的數字；沒有練的那天沿用前一天），從開始記錄那天到今天 */
export function kanaMasterySeries(kanaDays: KanaDays, now: number): { h: Point[]; k: Point[] } {
  const first = Object.keys(kanaDays).sort()[0];
  if (!first) return { h: [], k: [] };
  const days = eachDay(first, now);
  if (!days.length) return { h: [], k: [] };
  // 畫不到的更早日子（超過 MAX_DAYS 天）：從那之前最後一筆接著畫
  const before = Object.keys(kanaDays)
    .filter((key) => key < days[0].key)
    .sort()
    .pop();
  let last = before ? kanaDays[before] : { h: 0, k: 0 };
  const h: Point[] = [];
  const k: Point[] = [];
  for (const { key, date } of days) {
    last = kanaDays[key] ?? last;
    h.push({ key, date, value: last.h });
    k.push({ key, date, value: last.k });
  }
  return { h, k };
}

/** 最近 days 天，到期複習時記得的比例（還沒有到期複習時 rate 是 null） */
export function retention(srs: SrsData, now: number, days: number): { rev: number; forgot: number; rate: number | null } {
  let rev = 0;
  let forgot = 0;
  const today = studyDayStart(now);
  for (let i = 0; i < days; i++) {
    const d = srs.days[studyDayKey(addDays(today, -i))];
    rev += d?.rev ?? 0;
    forgot += d?.forgot ?? 0;
  }
  return { rev, forgot, rate: rev ? (rev - forgot) / rev : null };
}

/**
 * 單字目前的狀態：熟卡（間隔 21 天以上）、複習中、學習中、還沒學。
 * 全部照「字」算：同一個字在好幾個牌組只算一次，看學得最熟的那一張
 * （「全部牌組」裡同一個字也只出一次；加起來就是全部的字數，不會因為在兩個牌組各學一次就變多）。
 */
export function cardStates(cards: Record<string, CardState | undefined>) {
  const out = { mature: 0, young: 0, learning: 0, unseen: 0 };
  for (const group of wordGroups()) {
    let best = 0; // 0 還沒學、1 學習中、2 複習中、3 熟卡
    for (const id of group) {
      const c = cards[id];
      if (!c || c.reps === 0) continue;
      best = Math.max(best, c.step >= 0 ? 1 : c.ivl >= 21 ? 3 : 2);
    }
    if (best === 3) out.mature++;
    else if (best === 2) out.young++;
    else if (best === 1) out.learning++;
    else out.unseen++;
  }
  return out;
}

/**
 * 學過幾張單字卡、其中幾張是熟卡。照卡片算，和「學過的單字」曲線（每天新學幾張）一致：
 * 同一個字在兩個牌組各學一次算兩張。
 */
export function cardCounts(cards: Record<string, CardState | undefined>): { learned: number; mature: number } {
  let learned = 0;
  let mature = 0;
  for (const d of DECK_META) {
    for (const id of metaItemIds(d)) {
      const c = cards[id];
      if (!c || c.reps === 0) continue;
      learned++;
      if (c.step < 0 && c.ivl >= 21) mature++;
    }
  }
  return { learned, mature };
}

/** 平假名或片假名（清音 46 個）：熟悉、練習中、還沒練 */
export function kanaStates(kana: KanaStats, script: 'h' | 'k') {
  const out = { mastered: 0, practicing: 0, none: 0 };
  for (const c of SEION_CELLS) {
    const lv = kanaLevel(kana, `${script}:${c[script]}`);
    if (lv === 2) out.mastered++;
    else if (lv === 1) out.practicing++;
    else out.none++;
  }
  return out;
}

/** y 軸的上限取整：讓刻度是好讀的數字（5、10、20、50、100…） */
export function niceMax(max: number): number {
  if (max <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}
