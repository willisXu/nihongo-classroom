import { describe, expect, it } from 'vitest';
import { buildPool, makeOptions, normalizeRows, pickItem, ALL_ROW_IDS } from '../src/lib/kanaQuiz';
import { streak } from '../src/lib/progress';
import { studyDayKey, addDays, studyDayStart } from '../src/lib/date';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('kana quiz', () => {
  it('builds pools by row and script', () => {
    expect(buildPool(['a', 'k', 's'], 'h', 'see')).toHaveLength(15);
    expect(buildPool(['a'], 'mix', 'see')).toHaveLength(10);
    expect(buildPool(['w'], 'h', 'see').map((i) => i.ch)).toEqual(['わ', 'を', 'ん']);
    expect(buildPool(['w'], 'h', 'listen').map((i) => i.ch)).toEqual(['わ', 'ん']);
    expect(buildPool(['d'], 'h', 'see').map((i) => i.ch)).toEqual(['だ', 'で', 'ど']);
    expect(normalizeRows(['y', 'r', 'w', 'nn'])).toEqual(['y', 'r', 'w']);
  });

  it('always offers four distinct options with exactly one answer', () => {
    const rand = seeded(7);
    for (const mode of ['see', 'listen'] as const) {
      for (const script of ['h', 'k'] as const) {
        const pool = buildPool(ALL_ROW_IDS, script, mode);
        for (const item of pool) {
          const opts = makeOptions(item, pool, mode, rand);
          expect(opts).toHaveLength(4);
          expect(opts.filter((o) => o.ok)).toHaveLength(1);
          expect(new Set(opts.map((o) => o.r)).size).toBe(4);
          expect(new Set(opts.map((o) => o.ch)).size).toBe(4);
          for (const o of opts) expect(o.ch === 'ぢ' || o.ch === 'づ').toBe(false);
          if (mode === 'listen') expect(opts.some((o) => o.ch === 'を')).toBe(false);
        }
      }
    }
  });

  it('works with a tiny pool', () => {
    const pool = buildPool(['a'], 'h', 'see');
    const opts = makeOptions(pool[0], pool, 'see', seeded(1));
    expect(opts).toHaveLength(4);
  });

  it('prefers weak kana and avoids repeating the last one', () => {
    const pool = buildPool(['a'], 'h', 'see');
    const stats = { 'h:あ': { c: 0, w: 4, s: 0, t: 1 }, 'h:い': { c: 9, w: 0, s: 5, t: 1 } };
    const rand = seeded(3);
    const counts: Record<string, number> = {};
    let last: string | null = null;
    for (let i = 0; i < 2000; i++) {
      const it = pickItem(pool, stats, last, rand);
      expect(it.key).not.toBe(last);
      counts[it.ch] = (counts[it.ch] ?? 0) + 1;
      last = it.key;
    }
    expect(counts['あ']).toBeGreaterThan(counts['い']);
  });
});

describe('streak', () => {
  const now = new Date(2026, 9, 12, 21, 0).getTime();
  const day = (n: number) => studyDayKey(addDays(studyDayStart(now), n));
  it('counts consecutive study days', () => {
    expect(streak({}, now)).toBe(0);
    expect(streak({ [day(0)]: { kana: 3 }, [day(-1)]: { review: 1 }, [day(-3)]: { kana: 1 } }, now)).toBe(2);
    expect(streak({ [day(-1)]: { review: 1 }, [day(-2)]: { review: 1 } }, now)).toBe(2);
  });
});
