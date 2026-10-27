import { describe, expect, it } from 'vitest';
import { buildQueue, deckStats, formatDays, fuzzDays, fuzzRange, newCard, previewLabel, review, MIN_MS, MIN_EASE, type CardState } from '../src/lib/srs';
import { studyDayStart, addDays, DAY_MS } from '../src/lib/date';

const NOW = new Date(2026, 9, 12, 10, 0, 0).getTime(); // 2026-10-12 10:00 local

describe('srs', () => {
  it('walks a new card through the learning steps', () => {
    let c = newCard(NOW);
    c = review(c, 'good', NOW);
    expect(c.step).toBe(1);
    expect(c.due - NOW).toBe(10 * MIN_MS);
    c = review(c, 'good', NOW + 10 * MIN_MS);
    expect(c.step).toBe(-1);
    expect(c.ivl).toBe(1);
    expect(c.due).toBe(addDays(studyDayStart(NOW), 1));
  });

  it('again resets to the first step, easy graduates to 4 days', () => {
    const c0 = newCard(NOW);
    const again = review(review(c0, 'good', NOW), 'again', NOW);
    expect(again.step).toBe(0);
    expect(again.due - NOW).toBe(1 * MIN_MS);
    const easy = review(c0, 'easy', NOW);
    expect(easy.step).toBe(-1);
    expect(easy.ivl).toBe(4);
  });

  it('grows intervals for review cards and lapses on again', () => {
    let c = review(newCard(NOW), 'easy', NOW); // 4 天
    const t2 = c.due + 3600_000;
    const good = review(c, 'good', t2);
    expect(good.ivl).toBe(10); // 4 × 2.5
    const hard = review(c, 'hard', t2);
    expect(hard.ivl).toBe(5);
    expect(hard.ease).toBeCloseTo(2.35);
    const easy = review(c, 'easy', t2);
    expect(easy.ivl).toBeGreaterThan(good.ivl);
    c = review(good, 'again', good.due);
    expect(c.lapses).toBe(1);
    expect(c.step).toBe(0);
    expect(c.ivl).toBe(5);
    expect(c.ease).toBeCloseTo(2.3);
    const back = review(c, 'good', c.due);
    expect(back.step).toBe(-1);
    expect(back.ivl).toBe(5);
  });

  it('always gives hard < good < easy for review cards, even with a very low ease', () => {
    for (const ease of [MIN_EASE, 1.5, 2.5, 3.2]) {
      for (const ivl of [1, 2, 3, 5, 8, 13, 40, 200]) {
        for (const late of [0, 1, 5]) {
          const due = addDays(studyDayStart(NOW), -late);
          const c = { due, ivl, ease, reps: 5, lapses: 0, step: -1, last: due - ivl * 86_400_000 };
          const [h, g, e] = (['hard', 'good', 'easy'] as const).map((grade) => review(c, grade, NOW).ivl);
          expect(h).toBeGreaterThan(ivl);
          expect(g).toBeGreaterThan(h);
          expect(e).toBeGreaterThan(g);
        }
      }
    }
    // 熟悉係數最低、間隔 2 天：以前「困難」和「普通」都是 3 天
    const low = { due: studyDayStart(NOW), ivl: 2, ease: MIN_EASE, reps: 5, lapses: 2, step: -1, last: 0 };
    expect(previewLabel(low, 'hard', NOW)).toBe('3 天');
    expect(previewLabel(low, 'good', NOW)).toBe('4 天');
    expect(previewLabel(low, 'easy', NOW)).toBe('5 天');
  });

  it('never lets ease drop below the minimum', () => {
    let c = review(newCard(NOW), 'easy', NOW);
    let t = c.due;
    for (let i = 0; i < 20; i++) {
      c = review(c, 'again', t);
      c = review(c, 'good', c.due);
      t = c.due;
    }
    expect(c.ease).toBeGreaterThanOrEqual(MIN_EASE);
  });

  it('builds a queue with learning, review and limited new cards', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const learning = review(newCard(NOW), 'good', NOW - 20 * MIN_MS); // 已到期
    const reviewCard = { ...review(newCard(NOW), 'easy', NOW), due: NOW - 1000 };
    const future = review(newCard(NOW), 'easy', NOW);
    const q = buildQueue({ a: learning, b: reviewCard, c: future }, ids, NOW, 2);
    expect(q.learning).toEqual(['a']);
    expect(q.review).toEqual(['b']);
    expect(q.fresh).toEqual(['d', 'e']);
    const s = deckStats({ a: learning, b: reviewCard, c: future }, ids, NOW);
    expect(s).toMatchObject({ total: 6, seen: 3, due: 2, unseen: 3, learning: 1 });
  });

  it('labels the next interval for each button', () => {
    const c = newCard(NOW);
    expect(previewLabel(c, 'again', NOW)).toBe('1 分鐘');
    expect(previewLabel(c, 'good', NOW)).toBe('10 分鐘');
    expect(previewLabel(c, 'easy', NOW)).toBe('4 天');
  });
});

describe('間隔分散', () => {
  const now = new Date(2026, 9, 15, 20, 0).getTime();
  const grown = (ivl: number, ease = 2.5): CardState => ({ due: now - 1000, ivl, ease, reps: 5, lapses: 0, step: -1, last: now - ivl * DAY_MS });

  it('同一個 seed 一定排同一天，按鈕預告的天數和實際一樣', () => {
    for (const g of ['hard', 'good', 'easy'] as const) {
      const a = review(grown(10), g, now, 'n5-0001');
      const b = review(grown(10), g, now, 'n5-0001');
      expect(a.due).toBe(b.due);
      expect(previewLabel(grown(10), g, now, 'n5-0001')).toBe(formatDays(a.ivl));
    }
  });

  it('同一天學、狀態一樣的卡，之後分散到不同天；差距在範圍內，困難＜普通＜簡單', () => {
    const goods = new Set<number>();
    for (let i = 1; i <= 40; i++) {
      const id = `n5-${String(i).padStart(4, '0')}`;
      const h = review(grown(10), 'hard', now, id).ivl;
      const g = review(grown(10), 'good', now, id).ivl;
      const e = review(grown(10), 'easy', now, id).ivl;
      expect(h).toBeLessThan(g);
      expect(g).toBeLessThan(e);
      expect(Math.abs(g - 25)).toBeLessThanOrEqual(3); // 10 × 2.5 = 25，約 ±10%
      goods.add(g);
    }
    expect(goods.size).toBeGreaterThanOrEqual(4);
  });

  it('3 天以下不分散；幅度照 Anki（一週 ±2、一個月 ±3、一年約 ±20）；沒有 seed 時照原本的算法', () => {
    expect(fuzzDays(1, 'x')).toBe(1);
    expect(fuzzDays(2, 'y')).toBe(2);
    expect([3, 7, 30, 365].map(fuzzRange)).toEqual([1, 2, 3, 20]);
    for (const seed of ['a', 'b', 'c', 'd', 'e']) expect(Math.abs(fuzzDays(5, seed) - 5)).toBeLessThanOrEqual(1);
    expect(review(grown(10), 'good', now).ivl).toBe(25);
  });

  it('分散之後仍然守住下限：困難至少比現在多 1 天，困難＜普通＜簡單（各種間隔、熟悉係數、776 張卡）', () => {
    const bad: string[] = [];
    for (const ease of [1.3, 1.7, 2.5, 3]) {
      for (let ivl = 1; ivl <= 40; ivl++) {
        for (let i = 1; i <= 776; i += 7) {
          const id = `n5-${String(i).padStart(4, '0')}`;
          const [h, g, e] = (['hard', 'good', 'easy'] as const).map((gr) => review(grown(ivl, ease), gr, now, id).ivl);
          if (!(h >= ivl + 1 && h < g && g < e)) bad.push(`ivl ${ivl} ease ${ease} ${id}: ${h}/${g}/${e}`);
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});
