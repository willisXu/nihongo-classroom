// 課程進度：現在上到哪一課、五十音課程算不算學完、程度和學習地圖的階段（課不照順序完成時也要合理）
import { describe, expect, it } from 'vitest';
import { COURSE_LESSONS, LESSON_META } from '../src/data/lessons/meta';
import {
  courseWords, kanaCourseDone, learnedGrammar, learnedKana, learnedKanji, nextCourseLesson, nextKanaLesson, nextLesson, studyPhase,
  suggestedLevel,
} from '../src/lib/progress';
import type { LessonProgress } from '../src/state';

const at = (ids: number[]): LessonProgress => ({ done: Object.fromEntries(ids.map((i) => [i, 1])), hw: {} });
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const LAST = LESSON_META[LESSON_META.length - 1].id;
const N5_LAST = COURSE_LESSONS.filter((l) => l.level === 'n5').pop()!.id;

describe('現在上到的課', () => {
  it('照順序上：第一個還沒完成的課；全部完成時沒有', () => {
    expect(nextLesson(at([]))?.id).toBe(1);
    expect(nextLesson(at(range(1, 12)))?.id).toBe(13);
    expect(nextLesson(at(range(1, LAST)))).toBeUndefined();
  });

  it('不照順序完成：從上到最遠的那一課接著上（前面漏按的課不拉回去）', () => {
    // 漏按第 7 課
    expect(nextLesson(at([1, 2, 3, 4, 5, 6, 8, ...range(9, 40)]))?.id).toBe(41);
    // 會假名，直接從第 9 課開始
    expect(nextLesson(at([9, 10]))?.id).toBe(11);
    // 第 20 課改回未完成、後面的課都上了
    expect(nextLesson(at([...range(1, 19), ...range(21, 50)]))?.id).toBe(51);
    // 改回未完成的是最後上的那一課：回到那一課
    expect(nextLesson(at(range(1, 20).filter((i) => i !== 20)))?.id).toBe(20);
  });

  it('後面都完成了、只剩前面漏掉的課：回頭指向第一個還沒完成的課', () => {
    expect(nextLesson(at(range(1, LAST).filter((i) => i !== 7)))?.id).toBe(7);
    expect(nextLesson(at(range(1, LAST).filter((i) => i !== 20)))?.id).toBe(20);
    // 初級課程的「這一課」照同樣的規則，只看初級課程的課
    expect(nextCourseLesson(at(range(1, LAST).filter((i) => i !== 7)))).toBeUndefined();
    expect(nextCourseLesson(at([...range(1, 19), ...range(21, LAST)]))?.id).toBe(20);
    expect(nextCourseLesson(at([1, 2, 3]))?.id).toBe(9);
  });
});

describe('五十音課程算學完了', () => {
  it('第 8 課或任何一課初級課程完成就算；不要求 8 課都按了完成', () => {
    expect(kanaCourseDone(at(range(1, 7)))).toBe(false);
    expect(kanaCourseDone(at(range(1, 8)))).toBe(true);
    expect(kanaCourseDone(at([1, 2, 3, 4, 5, 6, 8]))).toBe(true);
    expect(kanaCourseDone(at([9]))).toBe(true);
    expect(kanaCourseDone(at(range(1, LAST).filter((i) => i !== 7)))).toBe(true);
  });

  it('五十音的下一課、學過的假名：上初級課程以後全部假名都算學過', () => {
    expect(nextKanaLesson(at([1, 2, 4]))?.id).toBe(5);
    expect(nextKanaLesson(at([9]))).toBeUndefined();
    expect(nextKanaLesson(at(range(1, LAST).filter((i) => i !== 7)))).toBeUndefined();
    expect(learnedKana(at([9]))).toBe(learnedKana(at(range(1, 8))));
    expect(learnedKana(at([1, 2]))).toBe('あいうえおかきくけこさしすせそたちつてとなにぬねの');
  });

  it('直接從第 9 課開始：文法、單字照初級課程的進度算（加上正在上的那一課）', () => {
    const p = at([9]);
    expect(courseWords(p)).toEqual([...COURSE_LESSONS[0].words, ...COURSE_LESSONS[1].words]);
    expect(learnedGrammar(p, 'n5')).toEqual([...COURSE_LESSONS[0].grammar, ...COURSE_LESSONS[1].grammar]);
    expect(learnedKanji(p)).toBe(COURSE_LESSONS[0].kanji);
  });
});

describe('程度和學習地圖的階段', () => {
  it('還在學五十音 → 只用假名；開始上初級課程 → N5；N4 的課開始或 N5 都學完 → N4', () => {
    expect(suggestedLevel(at(range(1, 7)))).toBe('kana');
    expect(suggestedLevel(at(range(1, 8)))).toBe('n5');
    expect(suggestedLevel(at([9]))).toBe('n5');
    expect(suggestedLevel(at(range(1, N5_LAST)))).toBe('n4');
    // 漏按第 7 課，上到 N4
    expect(suggestedLevel(at([1, 2, 3, 4, 5, 6, 8, ...range(9, 50)]))).toBe('n4');
    // N5 漏了一課，但已經在上 N4
    expect(suggestedLevel(at([...range(1, 19), ...range(21, 40)]))).toBe('n4');
  });

  it('學習地圖：五十音 0、N5 1、N4 2、課程都學完 3', () => {
    expect(studyPhase(at([]))).toBe(0);
    expect(studyPhase(at(range(1, 7)))).toBe(0);
    expect(studyPhase(at([9, 10]))).toBe(1);
    expect(studyPhase(at([1, 2, 3, 4, 5, 6, 8, ...range(9, 50)]))).toBe(2);
    expect(studyPhase(at(range(1, LAST)))).toBe(3);
    expect(studyPhase(at(range(1, LAST).filter((i) => i !== 7)))).toBe(3);
    expect(studyPhase(at(range(1, LAST).filter((i) => i !== 20)))).toBe(3);
  });
});
