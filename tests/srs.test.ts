import { describe, expect, it } from 'vitest';
import { buildQueue, deckStats, newCard, previewLabel, review, MIN_MS, MIN_EASE } from '../src/lib/srs';
import { studyDayStart, addDays } from '../src/lib/date';

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
    expect(s).toMatchObject({ total: 6, seen: 3, due: 2, unseen: 3 });
  });

  it('labels the next interval for each button', () => {
    const c = newCard(NOW);
    expect(previewLabel(c, 'again', NOW)).toBe('1 分鐘');
    expect(previewLabel(c, 'good', NOW)).toBe('10 分鐘');
    expect(previewLabel(c, 'easy', NOW)).toBe('4 天');
  });
});
