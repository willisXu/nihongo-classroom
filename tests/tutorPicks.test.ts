import { describe, expect, it } from 'vitest';
import { homeScenarios, N4_ONLY_SCENARIOS } from '../src/lib/tutorPicks';
import { SCENARIOS } from '../src/data/scenarios';
import { COURSE_LESSONS, LESSON_META } from '../src/data/lessons/meta';

/** 第 1 課到第 n 課都完成 */
const upTo = (n: number) => ({ done: Object.fromEntries(LESSON_META.filter((l) => l.id <= n).map((l) => [l.id, 1])), hw: {} });
/** 從 2026 年 10 月 1 日起的第 i 天中午 */
const day = (i: number) => new Date(2026, 9, 1 + i, 12).getTime();
const ids = (list: { id: string }[]) => list.map((s) => s.id);

describe('首頁推薦的 AI 家教情境', () => {
  it('只出現在 N4 課程的情境：N5 的課都沒有連到', () => {
    expect(N4_ONLY_SCENARIOS.size).toBe(15);
    for (const id of N4_ONLY_SCENARIOS) {
      expect(COURSE_LESSONS.some((l) => l.level === 'n5' && l.tutor === id), id).toBe(false);
      expect(COURSE_LESSONS.some((l) => l.level === 'n4' && l.tutor === id), id).toBe(true);
    }
  });

  it('先推薦這一課搭配的情境，三個不重複', () => {
    // 正在上第 32 課（常體，作業是 KTV）
    for (let i = 0; i < 30; i++) {
      const picks = homeScenarios(upTo(31), day(i));
      expect(picks).toHaveLength(3);
      expect(picks[0].id).toBe('karaoke');
      expect(new Set(ids(picks)).size).toBe(3);
    }
    // 正在上第 41 課（N4）
    expect(homeScenarios(upTo(40), day(0))[0].id).toBe('festival');
    // 還在學五十音：沒有搭配的情境
    expect(homeScenarios(upTo(3), day(0))).toHaveLength(3);
  });

  it('五十音、N5 不推薦 N4 課程的情境；每天換一批，幾週內輪到全部', () => {
    // [進度, 是不是 N4, 這一課搭配的情境]
    const cases = [[upTo(0), false, ''], [upTo(20), false, 'room-search'], [upTo(40), true, 'festival'], [upTo(56), true, '']] as const;
    for (const [progress, n4, current] of cases) {
      const seen = new Set<string>();
      let prev: string[] = [];
      for (let i = 0; i < 40; i++) {
        const picks = ids(homeScenarios(progress, day(i)));
        expect(new Set(picks).size).toBe(3);
        if (current) expect(picks[0]).toBe(current);
        for (const id of picks) {
          seen.add(id);
          if (!n4) expect(N4_ONLY_SCENARIOS.has(id), id).toBe(false);
        }
        // 這一課的情境以外，隔天推薦的都換掉
        const rotating = picks.filter((id) => id !== current);
        expect(rotating.filter((id) => prev.includes(id))).toEqual([]);
        prev = rotating;
      }
      expect(seen.size).toBe(SCENARIOS.filter((s) => n4 || !N4_ONLY_SCENARIOS.has(s.id)).length);
    }
  });
});
