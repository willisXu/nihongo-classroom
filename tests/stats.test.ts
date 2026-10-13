// 學習紀錄頁的統計
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calendar, cardStates, heatLevel, kanaMasterySeries, kanaStates, keyStart, niceMax, retention, studySummary, vocabLearnedSeries, weeklyTotals,
} from '../src/lib/stats';
import { studyDayKey, DAY_MS } from '../src/lib/date';
import type { CardState } from '../src/lib/srs';
import { activityStore, kanaDaysStore, kanaStore, missStore, recordKana, snapshotKana, type SrsData } from '../src/state';

const NOW = new Date(2026, 9, 13, 12, 0).getTime(); // 2026-10-13（週二）中午
const key = (daysAgo: number) => studyDayKey(NOW - daysAgo * DAY_MS);
const day = (fresh = 0, rev = 0, forgot = 0) => ({ reviews: fresh + rev, fresh, rev, forgot });

describe('學習紀錄', () => {
  it('日曆：每欄一週、週日在最上面，最後一欄是這一週，今天以後不算', () => {
    const cal = calendar({ [key(0)]: { kana: 25 }, [key(2)]: { writing: 3 } }, NOW, 4);
    expect(cal).toHaveLength(4);
    expect(cal.every((col) => col.length === 7)).toBe(true);
    expect(new Date(cal[3][0].date).getDay()).toBe(0); // 週日
    expect(cal[3][0].key).toBe('2026-10-11');
    const today = cal[3][2];
    expect(today.key).toBe('2026-10-13');
    expect(today.level).toBe(2);
    expect(cal[3][3].future).toBe(true);
    expect(cal[3][0].level).toBe(1); // 10/11 手寫 3 字
  });

  it('深淺分級：沒學、1–9、10–29、30–59、60 以上', () => {
    expect([0, 1, 9, 10, 29, 30, 59, 60, 500].map(heatLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('學習天數和最長連續天數（中間斷一天就重算）', () => {
    const a = { [key(9)]: { kana: 1 }, [key(8)]: { kana: 1 }, [key(7)]: { kana: 1 }, [key(5)]: { review: 2 }, [key(4)]: { kana: 0 }, [key(1)]: { writing: 1 }, [key(0)]: { kana: 3 } };
    expect(studySummary(a)).toEqual({ days: 6, longest: 3, first: key(9) });
    expect(studySummary({})).toEqual({ days: 0, longest: 0, first: null });
  });

  it('每週練習量：照週加總，最後一週是這一週', () => {
    const w = weeklyTotals({ [key(0)]: { kana: 20, writing: 5 }, [key(3)]: { review: 7 }, [key(9)]: { kana: 4 } }, NOW, 4);
    expect(w).toHaveLength(4);
    expect(w[3]).toMatchObject({ kana: 20, review: 0, writing: 5 }); // 10/11–10/13
    expect(w[2]).toMatchObject({ kana: 4, review: 7, writing: 0 }); // 10/4–10/10
  });

  it('學過的單字：每天的新卡累加到今天', () => {
    const srs: SrsData = { cards: {}, days: { [key(3)]: day(10), [key(1)]: day(5) } };
    expect(vocabLearnedSeries(srs, NOW).map((p) => p.value)).toEqual([10, 10, 15, 15]);
    expect(vocabLearnedSeries({ cards: {}, days: {} }, NOW)).toEqual([]);
  });

  it('熟悉的假名：沒練的那天沿用前一天', () => {
    const s = kanaMasterySeries({ [key(2)]: { h: 5, k: 0 }, [key(0)]: { h: 9, k: 2 } }, NOW);
    expect(s.h.map((p) => p.value)).toEqual([5, 5, 9]);
    expect(s.k.map((p) => p.value)).toEqual([0, 0, 2]);
    expect(s.h[0].key).toBe(key(2));
  });

  it('記得的比例：只算最近 30 天的到期複習', () => {
    const srs: SrsData = { cards: {}, days: { [key(0)]: day(0, 10, 1), [key(10)]: day(0, 10, 3), [key(40)]: day(0, 100, 100) } };
    expect(retention(srs, NOW, 30)).toEqual({ rev: 20, forgot: 4, rate: 0.8 });
    expect(retention({ cards: {}, days: {} }, NOW, 30).rate).toBeNull();
  });

  it('單字卡狀態、假名熟悉度', () => {
    const c = (p: Partial<CardState>): CardState => ({ due: NOW, ivl: 0, ease: 2.5, reps: 1, lapses: 0, step: -1, last: NOW, ...p });
    const s = cardStates({ 'n5-0001': c({ ivl: 30 }), 'n5-0002': c({ ivl: 3 }), 'n5-0003': c({ step: 0 }), 'n5-0004': c({ reps: 0 }) });
    expect(s.mature).toBe(1);
    expect(s.young).toBe(1);
    expect(s.learning).toBe(1);
    expect(s.mature + s.young + s.learning + s.unseen).toBe(776 + 226 + 127 + 128);
    expect(kanaStates({ 'h:あ': { c: 3, w: 0, s: 3, t: 1 }, 'h:い': { c: 1, w: 1, s: 0, t: 1 }, 'k:ア': { c: 3, w: 0, s: 3, t: 1 } }, 'h')).toEqual({
      mastered: 1,
      practicing: 1,
      none: 44,
    });
  });

  it('刻度上限取好讀的數字；學習日代號換回時間', () => {
    expect([0, 3, 7, 12, 46, 120, 777].map(niceMax)).toEqual([5, 5, 10, 20, 50, 200, 1000]);
    expect(studyDayKey(keyStart('2026-10-13'))).toBe('2026-10-13');
    expect(new Date(keyStart('2026-10-13')).getHours()).toBe(4);
  });
});

describe('每天的假名熟悉度紀錄', () => {
  afterEach(() => {
    vi.useRealTimers();
    for (const st of [kanaStore, kanaDaysStore, activityStore, missStore]) st.reset();
  });

  it('作答後記下當天的數字：同一天以最後一次為準，隔天另記一筆', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 12, 21, 0));
    for (let i = 0; i < 3; i++) recordKana('h:あ', true);
    recordKana('k:ア', true);
    expect(kanaDaysStore.get()).toEqual({ '2026-10-12': { h: 1, k: 0 } });
    vi.setSystemTime(new Date(2026, 9, 13, 9, 0));
    recordKana('h:あ', false); // 答錯，連對中斷：不算熟悉了
    expect(kanaDaysStore.get()).toEqual({ '2026-10-12': { h: 1, k: 0 }, '2026-10-13': { h: 0, k: 0 } });
  });

  it('打開學習紀錄頁時補記今天；還沒練過假名就不記', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 13, 9, 0));
    snapshotKana();
    expect(kanaDaysStore.get()).toEqual({});
    kanaStore.set({ 'h:い': { c: 3, w: 0, s: 3, t: 1 }, 'k:イ': { c: 4, w: 0, s: 4, t: 1 } });
    snapshotKana();
    expect(kanaDaysStore.get()).toEqual({ '2026-10-13': { h: 1, k: 1 } });
  });
});
