import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LEARN_AHEAD_MS, MAX_IVL, MIN_MS, buildSession, newCard, pickNext, review, type CardState,
} from '../src/lib/srs';
import { addDays, studyDayStart } from '../src/lib/date';
import { saveCard, srsStore } from '../src/state';

const NOW = new Date(2026, 9, 12, 10, 0, 0).getTime(); // 2026-10-12 10:00（本地時間）
const DAY = 86_400_000;

/** 已畢業、間隔 ivl 天、到期日是 due 的複習卡 */
function reviewCard(ivl: number, due: number, ease = 2.5): CardState {
  return { due, ivl, ease, reps: 5, lapses: 0, step: -1, last: due - ivl * DAY };
}

describe('srs 邊界情況', () => {
  it('凌晨 4 點前畢業：到期日算在「學習日」的隔天，也就是當天早上 4 點', () => {
    const early = new Date(2026, 9, 12, 2, 30).getTime(); // 還算 10/11 的學習日
    let c = review(newCard(early), 'good', early);
    c = review(c, 'good', early + 10 * MIN_MS);
    expect(c.step).toBe(-1);
    expect(c.due).toBe(new Date(2026, 9, 12, 4, 0).getTime());
  });

  it('逾期才複習：記得時把逾期的天數算一半進去，很簡單時全算', () => {
    const due = studyDayStart(NOW);
    const late = addDays(due, 6) + 3600_000; // 晚 6 天
    const good = review(reviewCard(10, due), 'good', late);
    expect(good.ivl).toBe(33); // (10 + 6/2) × 2.5 = 32.5 → 33
    const easy = review(reviewCard(10, due), 'easy', late);
    expect(easy.ivl).toBe(52); // (10 + 6) × 2.5 × 1.3
    expect(easy.ease).toBeCloseTo(2.65);
  });

  it('重新學習中按「有點難」留在原步驟，按「很簡單」直接畢業並多一天', () => {
    const lapsed = review(reviewCard(10, NOW), 'again', NOW); // 間隔減半成 5 天，進入重新學習
    expect(lapsed.ivl).toBe(5);
    const hard = review(lapsed, 'hard', NOW + 10 * MIN_MS);
    expect(hard.step).toBe(0);
    expect(hard.due - (NOW + 10 * MIN_MS)).toBe(12.5 * MIN_MS);
    const easy = review(lapsed, 'easy', NOW + 10 * MIN_MS);
    expect(easy.step).toBe(-1);
    expect(easy.ivl).toBe(6);
  });

  it('間隔不會超過上限', () => {
    const c = review(reviewCard(3000, NOW), 'good', NOW);
    expect(c.ivl).toBe(MAX_IVL);
  });
});

describe('一輪複習', () => {
  const learning = (due: number): CardState => ({ ...review(newCard(NOW), 'good', NOW - 20 * MIN_MS), due });
  const cards: Record<string, CardState> = {
    a: learning(NOW - MIN_MS), // 學習中，已到期
    b: learning(NOW + 5 * MIN_MS), // 學習中，5 分鐘後到期（可以提早看）
    c: learning(NOW + LEARN_AHEAD_MS + MIN_MS), // 學習中，超過提早的範圍
    d: reviewCard(4, NOW - 3600_000), // 到期的複習卡
    f: reviewCard(4, NOW + 2 * DAY), // 還沒到期
  };
  const ids = ['a', 'b', 'c', 'd', 'e', 'f']; // e 是新卡

  it('放進到期的、快到期的學習中卡片，以及複習卡和新卡', () => {
    const s = buildSession(cards, ids, NOW, 5);
    expect(s.learning.map((p) => p.id)).toEqual(['a', 'b']);
    expect(s.main).toEqual(['d', 'e']);
    expect(s.first).toBe('a');
  });

  it('新卡數量照今天剩下的額度', () => {
    expect(buildSession(cards, ids, NOW, 0).main).toEqual(['d']);
  });

  it('下一張：已到期的學習中卡片 → 複習與新卡 → 提早看快到期的', () => {
    const b = { id: 'b', due: NOW + 5 * MIN_MS };
    expect(pickNext(['d'], [{ id: 'a', due: NOW - 1 }, b], NOW)).toBe('a');
    expect(pickNext(['d'], [b], NOW)).toBe('d');
    expect(pickNext([], [b], NOW)).toBe('b');
    expect(pickNext([], [{ id: 'c', due: NOW + LEARN_AHEAD_MS + 1 }], NOW)).toBeNull();
  });
});

describe('每天新卡的計數', () => {
  afterEach(() => {
    vi.useRealTimers();
    srsStore.reset();
  });

  it('同一個學習日（凌晨 4 點換日）累加，換日後重新計算', () => {
    vi.useFakeTimers();
    srsStore.reset();
    const card = review(newCard(NOW), 'good', NOW);
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0));
    saveCard('x', card, true);
    saveCard('x', card, false); // 同一張卡再複習不算新卡
    saveCard('y', card, true);
    vi.setSystemTime(new Date(2026, 9, 13, 3, 30)); // 還是 10/12 的學習日
    saveCard('z', card, true);
    expect(srsStore.get().days['2026-10-12']).toEqual({ reviews: 4, fresh: 3 });
    vi.setSystemTime(new Date(2026, 9, 13, 4, 30));
    saveCard('w', card, true);
    expect(srsStore.get().days['2026-10-13']).toEqual({ reviews: 1, fresh: 1 });
  });
});
