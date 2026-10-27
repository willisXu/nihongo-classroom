// 單字複習的牌組：課程某一課的單字不受每天新卡上限限制、找不到的牌組
import { describe, expect, it } from 'vitest';
import { COURSE_LESSONS } from '../src/data/lessons/meta';
import { DECKS } from '../src/data/vocab';
import { buildSession, limitFresh } from '../src/lib/srs';
import { deckExists, deckItemIds, missingDeckNote, newCardLimit } from '../src/lib/vocab';

const NOW = new Date(2026, 9, 27, 12).getTime();

describe('課程某一課的單字（lesson-N）', () => {
  it('不受每天新卡上限限制：今天的新卡用完了，也能學這一課的字；其他牌組照每天的上限', () => {
    expect(newCardLimit('lesson-15', 10, 10)).toBe(Infinity);
    expect(newCardLimit('lesson-15', 0, 0)).toBe(Infinity);
    expect(newCardLimit('all', 10, 10)).toBe(0);
    expect(newCardLimit('n5', 10, 4)).toBe(6);
    expect(newCardLimit('n5', 0, 0)).toBe(0);
    const ids = deckItemIds('lesson-15');
    const s = buildSession({}, ids, NOW, newCardLimit('lesson-15', 10, 10));
    expect(s.main).toEqual(ids);
    // 另一個分頁也在學新卡時的整理（limitFresh）也照這個上限：一張都不拿掉
    expect(limitFresh(s.main, {}, newCardLimit('lesson-15', 10, 30))).toEqual(ids);
  });
});

describe('找不到的牌組', () => {
  it('五十音的課、不存在的課和牌組都算找不到；有的牌組和課都找得到', () => {
    for (const d of ['all', ...DECKS.map((x) => x.id), ...COURSE_LESSONS.map((l) => `lesson-${l.id}`)]) expect(deckExists(d), d).toBe(true);
    for (const d of ['lesson-5', 'lesson-0', 'lesson-99', 'nonexistent', 'lesson-', '']) expect(deckExists(d), d).toBe(false);
  });

  it('說明：五十音的課改練假名，其他說網址打錯', () => {
    expect(missingDeckNote('lesson-5')).toEqual({ text: '第 5 課是五十音課程，沒有單字卡。', practice: 5 });
    expect(missingDeckNote('lesson-99').text).toBe('沒有第 99 課。課程的單字卡從第 9 課到第 56 課。');
    expect(missingDeckNote('nonexistent')).toEqual({ text: '網址可能打錯了。' });
  });
});
