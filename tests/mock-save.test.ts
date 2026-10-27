/** 模擬考的作答存在瀏覽器裡：離開頁面再回來可以接著做（lib/mockSave.ts） */
import { describe, expect, it } from 'vitest';
import { mock } from '../src/data/mock/n4';
import type { MockTest } from '../src/data/types';
import { answeredCount, emptyMock, parseMockSaved, partKey, partSig, scoreMock, withPartAnswers } from '../src/lib/mockSave';

const first = mock.sections[0];
const part = first.parts[0];
const key = partKey(first.id, part.id);
const NOW = Date.UTC(2026, 9, 28, 4);

/** 照頁面的存法存一個題組（連同題目的指紋），再像打開頁面時一樣讀回來 */
const roundTrip = (answers: unknown[], extra: Record<string, unknown> = {}) =>
  parseMockSaved(mock, JSON.parse(JSON.stringify({ ...withPartAnswers(mock, emptyMock(mock), key, answers as never, NOW - 1000), ...extra })), NOW);

describe('模擬考的作答存起來', () => {
  it('讀回作答：別份考試、壞掉的資料不用，對不上題目的那一題當作沒答', () => {
    expect(answeredCount(parseMockSaved(mock, null))).toBe(0);
    expect(answeredCount(parseMockSaved(mock, 'x'))).toBe(0);
    expect(answeredCount(parseMockSaved(mock, { id: 'n3', answers: { [key]: [0] }, sigs: { [key]: partSig(part.items) } }))).toBe(0);
    const got = roundTrip([0, 99, 'x', 1, ...Array(part.items.length - 4).fill(null)]);
    expect(got.answers[key].slice(0, 4)).toEqual([0, null, null, 1]);
    expect(got.answers[key]).toHaveLength(part.items.length);
    expect(got.started).toBe(NOW - 1000);
    expect(answeredCount(got)).toBe(2);
  });

  it('題目改過（網站更新）：那個題組的作答不用，別的題組照舊', () => {
    const saved = withPartAnswers(mock, emptyMock(mock), key, part.items.map(() => 0), NOW);
    const second = partKey(first.id, first.parts[1].id);
    const both = withPartAnswers(mock, saved, second, first.parts[1].items.map(() => null).map((_, i) => (i === 0 ? 0 : null)), NOW);
    // 第一個題組的第一題換了選項順序
    const changed: MockTest = JSON.parse(JSON.stringify(mock));
    const q = changed.sections[0].parts[0].items[0];
    if (q.kind !== 'order') q.options.reverse();
    const got = parseMockSaved(changed, JSON.parse(JSON.stringify(both)), NOW);
    expect(got.answers[key]).toBeUndefined();
    expect(got.answers[second]?.[0]).toBe(0);
    // 只改說明不算改題目
    const why: MockTest = JSON.parse(JSON.stringify(mock));
    why.sections[0].parts[0].items[0].why = '新的說明';
    expect(parseMockSaved(why, JSON.parse(JSON.stringify(both)), NOW).answers[key]).toHaveLength(part.items.length);
    // 沒有指紋（舊版存的）也不用
    expect(parseMockSaved(mock, { ...both, sigs: undefined }, NOW).answers[key]).toBeUndefined();
  });

  it('開始時間壞掉（不是數字、比現在還晚）時當作現在開始', () => {
    for (const started of [1e20, Infinity, -5, 'x', null]) expect(roundTrip([0], { started }).started).toBe(NOW);
  });

  it('照科目算分：還沒答的不算，答錯的題目列出要複習的課', () => {
    const answers = part.items.map((it) => (it.kind === 'order' ? null : it.answer));
    // 第一題故意答錯
    const wrong = part.items[0];
    if (wrong.kind !== 'order') answers[0] = (wrong.answer + 1) % wrong.options.length;
    const { rows, review } = scoreMock(mock, roundTrip(answers));
    expect(rows[0].answered).toBe(part.items.filter((it) => it.kind !== 'order').length);
    expect(rows[0].right).toBe(rows[0].answered - 1);
    expect(rows.slice(1).every((r) => r.answered === 0)).toBe(true);
    expect(review).toEqual(wrong.lesson ? [wrong.lesson] : []);
  });
});
