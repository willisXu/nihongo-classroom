import { describe, expect, it } from 'vitest';
import { fillBlank, orderCorrect, shuffled } from '../src/components/Drill';

/** 固定的亂數（測試每次結果一樣） */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe('課文練習題', () => {
  it('打亂的順序不會剛好是答案，也不會是另一種也對的順序', () => {
    const tiles = ['毎朝', 'コーヒーを', '飲みます'];
    const also = [['コーヒーを', '毎朝', '飲みます']];
    for (let seed = 1; seed < 200; seed++) {
      const idx = shuffled(tiles, seeded(seed), also);
      const seq = idx.map((i) => tiles[i]);
      expect([...idx].sort()).toEqual([0, 1, 2]);
      expect(seq).not.toEqual(tiles);
      expect(seq).not.toEqual(also[0]);
    }
    // 只有一塊：照舊
    expect(shuffled(['はい'])).toEqual([0]);
  });

  it('排列題：照答案或 also 的順序都算對；一樣的詞互換也算對', () => {
    const tiles = ['毎朝', 'コーヒーを', '飲みます'];
    expect(orderCorrect(tiles, [0, 1, 2])).toBe(true);
    expect(orderCorrect(tiles, [1, 0, 2])).toBe(false);
    expect(orderCorrect(tiles, [1, 0, 2], [['コーヒーを', '毎朝', '飲みます']])).toBe(true);
    expect(orderCorrect(tiles, [0, 1])).toBe(false);
    expect(orderCorrect(['と', 'ねこ', 'と', 'いぬ'], [2, 1, 0, 3])).toBe(true);
  });

  it('選擇題的題目句：＿＿ 換成答案', () => {
    expect(fillBlank('私《わたし》＿＿学生《がくせい》です。', 'は')).toBe('私《わたし》は学生《がくせい》です。');
    expect(fillBlank('これは＿＿＿ですか。', '何《なん》')).toBe('これは何《なん》ですか。');
  });
});
