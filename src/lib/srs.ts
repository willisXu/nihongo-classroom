/**
 * 間隔複習排程（SM-2 的變形，和 Anki 的預設行為相近）。
 * - 新卡先經過「學習步驟」：1 分鐘 → 10 分鐘，之後畢業成 1 天。
 * - 複習卡依「熟悉係數 ease」拉長間隔；忘記時間隔減半並重新學習。
 * - 複習卡的到期時間對齊學習日的開始（凌晨 4 點）。
 */
import { addDays, studyDayStart, DAY_MS } from './date';

export type Grade = 'again' | 'hard' | 'good' | 'easy';
export const GRADES: Grade[] = ['again', 'hard', 'good', 'easy'];

export interface CardState {
  /** 下次到期時間（ms） */
  due: number;
  /** 目前間隔（天）；還沒畢業的新卡是 0 */
  ivl: number;
  ease: number;
  reps: number;
  lapses: number;
  /** >= 0：在學習／重新學習的第幾步；-1：已畢業的複習卡 */
  step: number;
  /** 上次複習時間 */
  last: number;
}

export const MIN_MS = 60_000;
export const LEARN_STEPS = [1 * MIN_MS, 10 * MIN_MS];
export const RELEARN_STEPS = [10 * MIN_MS];
export const GRADUATE_IVL = 1;
export const EASY_IVL = 4;
export const START_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_IVL = 3650;

export function newCard(now: number): CardState {
  return { due: now, ivl: 0, ease: START_EASE, reps: 0, lapses: 0, step: 0, last: 0 };
}

export function isRelearning(c: CardState): boolean {
  return c.step >= 0 && c.lapses > 0 && c.ivl > 0;
}

/**
 * 分散的幅度（天），照 Anki 的算法：2.5 天以上才分散，每天加的幅度
 * 7 天以內 15%、7～20 天 10%、20 天以上 5%，基本 1 天。
 * 例：3 天 ±1、一週 ±2、一個月 ±3、一年約 ±20 天。
 */
export function fuzzRange(ivl: number): number {
  if (ivl < 2.5) return 0;
  const r = 1 + 0.15 * (Math.min(ivl, 7) - 2.5) + 0.1 * Math.max(0, Math.min(ivl, 20) - 7) + 0.05 * Math.max(0, ivl - 20);
  return Math.round(r);
}

/**
 * 間隔的小幅隨機分散：同一天學的卡，之後不會全部擠在同一天到期。
 * 用卡片 id 和複習次數決定（不是真的亂數），按鈕上預告的天數和實際排的一樣。
 */
export function fuzzDays(ivl: number, seed: string): number {
  const range = fuzzRange(ivl);
  if (!range) return ivl;
  // FNV-1a：同樣的 seed 一定得到同樣的結果
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const offset = (h % (2 * range + 1)) - range;
  return Math.max(1, ivl + offset);
}

/** seed：卡片 id。有給才分散間隔（見 fuzzDays） */
export function review(c: CardState, grade: Grade, now: number, seed?: string): CardState {
  const n: CardState = { ...c, reps: c.reps + 1, last: now };
  const today = studyDayStart(now);

  if (c.step >= 0) {
    const relearn = isRelearning(c);
    const steps = relearn ? RELEARN_STEPS : LEARN_STEPS;
    const cur = steps[Math.min(c.step, steps.length - 1)];
    switch (grade) {
      case 'again':
        n.step = 0;
        n.due = now + steps[0];
        return n;
      case 'hard': {
        const next = steps[c.step + 1] ?? cur * 1.5;
        n.due = now + Math.round((cur + next) / 2);
        return n;
      }
      case 'good':
        if (c.step + 1 < steps.length) {
          n.step = c.step + 1;
          n.due = now + steps[n.step];
          return n;
        }
        n.step = -1;
        n.ivl = relearn ? Math.max(1, c.ivl) : GRADUATE_IVL;
        n.due = addDays(today, n.ivl);
        return n;
      case 'easy':
        n.step = -1;
        n.ivl = relearn ? Math.max(1, c.ivl) + 1 : EASY_IVL;
        n.due = addDays(today, n.ivl);
        return n;
    }
  }

  // 已畢業的複習卡
  const lateDays = Math.max(0, Math.round((today - studyDayStart(c.due)) / DAY_MS));
  if (grade === 'again') {
    n.lapses = c.lapses + 1;
    n.ease = Math.max(MIN_EASE, c.ease - 0.2);
    n.ivl = Math.max(1, Math.round(c.ivl * 0.5));
    n.step = 0;
    n.due = now + RELEARN_STEPS[0];
    return n;
  }
  // 先分散、再套下限：「困難」至少比現在多 1 天，「普通」至少比「困難」多 1 天、「簡單」至少比「普通」多 1 天
  // （熟悉係數很低、或分散往下調時，算出來的間隔可能一樣或更短）
  const fz = (d: number, g: Grade) => (seed ? fuzzDays(d, `${seed}:${c.reps}:${g}`) : d);
  const hard = Math.max(c.ivl + 1, fz(Math.round(c.ivl * 1.2), 'hard'));
  const good = Math.max(hard + 1, fz(Math.round((c.ivl + lateDays / 2) * c.ease), 'good'));
  const easy = Math.max(good + 1, fz(Math.round((c.ivl + lateDays) * c.ease * 1.3), 'easy'));
  if (grade === 'hard') n.ease = Math.max(MIN_EASE, c.ease - 0.15);
  if (grade === 'easy') n.ease = c.ease + 0.15;
  n.ivl = Math.min(MAX_IVL, grade === 'hard' ? hard : grade === 'good' ? good : easy);
  n.due = addDays(today, n.ivl);
  return n;
}

/** 按鈕上顯示的「下次見面」時間（seed 和實際評分時一樣，天數才對得上） */
export function previewLabel(c: CardState, grade: Grade, now: number, seed?: string): string {
  const r = review(c, grade, now, seed);
  if (r.step >= 0) return formatMinutes(r.due - now);
  return formatDays(r.ivl);
}

export function formatMinutes(ms: number): string {
  const m = Math.max(1, Math.round(ms / MIN_MS));
  if (m < 60) return `${m} 分鐘`;
  return `${Math.round(m / 60)} 小時`;
}

export function formatDays(days: number): string {
  if (days < 30) return `${days} 天`;
  if (days < 365) return `${Math.round((days / 30) * 10) / 10} 個月`;
  return `${Math.round((days / 365) * 10) / 10} 年`;
}

export interface Queue {
  /** 已到期的學習中卡片（含忘記後重新學習） */
  learning: string[];
  /** 已到期的複習卡 */
  review: string[];
  /** 今天還能學的新卡 */
  fresh: string[];
}

export function buildQueue(
  cards: Record<string, CardState | undefined>,
  ids: string[],
  now: number,
  newLimit: number,
): Queue {
  const learning: [string, number][] = [];
  const reviewDue: [string, number][] = [];
  const fresh: string[] = [];
  for (const id of ids) {
    const c = cards[id];
    if (!c || c.reps === 0) {
      if (fresh.length < newLimit) fresh.push(id);
      continue;
    }
    if (c.due > now) continue;
    if (c.step >= 0) learning.push([id, c.due]);
    else reviewDue.push([id, c.due]);
  }
  learning.sort((a, b) => a[1] - b[1]);
  reviewDue.sort((a, b) => a[1] - b[1]);
  return { learning: learning.map((x) => x[0]), review: reviewDue.map((x) => x[0]), fresh };
}

/** 牌組統計 */
/* ---------------- 一輪複習 ---------------- */

/** 學習中的卡片若在這段時間內到期，就留在這一輪（可以提早看） */
export const LEARN_AHEAD_MS = 20 * MIN_MS;

export interface Pending {
  id: string;
  due: number;
}

export interface Session {
  /** 到期的複習卡和今天還能學的新卡，依序出現 */
  main: string[];
  /** 學習中、已到期或很快就到期的卡片 */
  learning: Pending[];
  /** 第一張要看的卡片；null 代表這一輪沒有卡片 */
  first: string | null;
}

/** 下一張：已到期的學習中卡片優先，其次是複習卡和新卡，最後才提早看快到期的學習中卡片 */
export function pickNext(main: string[], learning: Pending[], now: number): string | null {
  const dueL = learning.filter((p) => p.due <= now).sort((a, b) => a.due - b.due)[0];
  if (dueL) return dueL.id;
  if (main.length) return main[0];
  const ahead = learning.filter((p) => p.due <= now + LEARN_AHEAD_MS).sort((a, b) => a.due - b.due)[0];
  return ahead?.id ?? null;
}

/** 開一輪複習要看的卡片 */
export function buildSession(cards: Record<string, CardState | undefined>, ids: string[], now: number, newLimit: number): Session {
  const q = buildQueue(cards, ids, now, newLimit);
  const learning: Pending[] = [];
  for (const id of ids) {
    const c = cards[id];
    if (c && c.reps > 0 && c.step >= 0 && c.due <= now + LEARN_AHEAD_MS) learning.push({ id, due: c.due });
  }
  const main = [...q.review, ...q.fresh];
  return { main, learning, first: pickNext(main, learning, now) };
}

export function deckStats(cards: Record<string, CardState | undefined>, ids: string[], now: number) {
  let seen = 0;
  let due = 0;
  let mature = 0;
  for (const id of ids) {
    const c = cards[id];
    if (!c || c.reps === 0) continue;
    seen++;
    if (c.due <= now) due++;
    if (c.step === -1 && c.ivl >= 21) mature++;
  }
  return { total: ids.length, seen, due, mature, unseen: ids.length - seen };
}
