/** 模擬考的作答存在瀏覽器裡：離開頁面再回來可以接著做（lib/mockSave.ts） */
import { describe, expect, it } from 'vitest';
import { mock } from '../src/data/mock/n4';
import { answeredCount, parseMockSaved, partKey, scoreMock } from '../src/lib/mockSave';

describe('模擬考的作答存起來', () => {
  const first = mock.sections[0];
  const part = first.parts[0];
  const key = partKey(first.id, part.id);

  it('讀回作答：別份考試、壞掉的資料不用，對不上題目的那一題當作沒答', () => {
    expect(answeredCount(parseMockSaved(mock, null))).toBe(0);
    expect(answeredCount(parseMockSaved(mock, { id: 'n3', answers: { [key]: [0] } }))).toBe(0);
    const got = parseMockSaved(mock, { id: mock.id, started: 123, answers: { [key]: [0, 99, 'x', 1], 'nope/x': [0] } });
    expect(got.answers[key].slice(0, 4)).toEqual([0, null, null, 1]);
    expect(got.answers[key]).toHaveLength(part.items.length);
    expect(got.answers['nope/x']).toBeUndefined();
    expect(got.started).toBe(123);
    expect(answeredCount(got)).toBe(2);
  });

  it('照科目算分：還沒答的不算，答錯的題目列出要複習的課', () => {
    const answers = part.items.map((it) => (it.kind === 'order' ? null : it.answer));
    // 第一題故意答錯
    const wrong = part.items[0];
    if (wrong.kind !== 'order') answers[0] = (wrong.answer + 1) % wrong.options.length;
    const { rows, review } = scoreMock(mock, parseMockSaved(mock, { id: mock.id, answers: { [key]: answers } }));
    expect(rows[0].answered).toBe(part.items.length);
    expect(rows[0].right).toBe(part.items.length - 1);
    expect(rows.slice(1).every((r) => r.answered === 0)).toBe(true);
    expect(review).toEqual(wrong.lesson ? [wrong.lesson] : []);
  });
});
