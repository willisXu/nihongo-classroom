import { describe, expect, it } from 'vitest';
import { LESSONS } from '../src/data/lessons';
import { getStrokePaths } from '../src/lib/strokes';
import { EXTRA_CHARS, extraOf, lessonWriteRows, rowsFor, writingChars } from '../src/lib/writingScope';

describe('手寫描字的範圍', () => {
  it('每一課「去寫字」的範圍剛好是這一課新教的字（不會混進後面幾課的字）', () => {
    for (const l of LESSONS) {
      const chars = writingChars(lessonWriteRows(l.newKana), l.quiz.script);
      expect([...chars].sort(), `第 ${l.id} 課`).toEqual([...l.newKana].sort());
    }
  });

  it('小字分兩組：ャュョッー（第 7 課）和拼外國音的 ァィゥェォヴ（第 8 課）；平假名沒有後面這組', () => {
    expect(writingChars(['small'], 'h').join('')).toBe('ゃゅょっ');
    expect(writingChars(['small'], 'k').join('')).toBe('ャュョッー');
    expect(writingChars(['foreign'], 'k').join('')).toBe('ァィゥェォヴ');
    expect(writingChars(['foreign'], 'h')).toEqual([]);
    expect(rowsFor(['a', 'foreign'], 'h')).toEqual(['a']);
    expect(rowsFor(['a', 'foreign'], 'k')).toEqual(['a', 'foreign']);
    expect(extraOf('ヴ')).toEqual({ row: 'foreign', script: 'k' });
    expect(extraOf('っ')).toEqual({ row: 'small', script: 'h' });
    expect(extraOf('ー')).toEqual({ row: 'small', script: 'k' });
    expect(extraOf('あ')).toBeUndefined();
  });

  it('只有手寫才練的字都有筆順資料', () => {
    for (const [row, by] of Object.entries(EXTRA_CHARS)) {
      for (const ch of [...by.h, ...by.k]) expect(getStrokePaths(ch), `${row} ${ch}`).toBeTruthy();
    }
  });
});
