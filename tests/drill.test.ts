import { describe, expect, it } from 'vitest';
import { fillBlank, fillTarget, optionOrder, orderCorrect, shuffled, talkPitch } from '../src/components/Drill';

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

  it('選擇題、聽力題的選項每次打亂：正確答案（課文常寫在第一個）不會總是在同一個位置', () => {
    const where = new Set<number>();
    for (let seed = 1; seed < 60; seed++) {
      const order = optionOrder(3, seeded(seed));
      expect([...order].sort()).toEqual([0, 1, 2]);
      where.add(order.indexOf(0));
    }
    expect([...where].sort()).toEqual([0, 1, 2]);
    expect(optionOrder(1)).toEqual([0]);
  });

  it('對話聽力：男的低一點、女的高一點，其他人照順序輪流', () => {
    expect(talkPitch([{ who: '男《おとこ》の人《ひと》' }, { who: '女《おんな》の人《ひと》' }, { who: '男《おとこ》の人《ひと》' }])).toEqual([0.8, 1.15, 0.8]);
    // 課程角色照性別：リン 是女生，第一個說話也是高的
    expect(talkPitch([{ who: 'リン' }, { who: '田中《たなか》' }])).toEqual([1.15, 0.8]);
    const p = talkPitch([{ who: '店員《てんいん》' }, { who: '客《きゃく》' }, { who: '店員《てんいん》' }]);
    expect(p[0]).toBe(p[2]);
    expect(p[0]).not.toBe(p[1]);
  });

  it('⟦⟧ 題答完：念法題、寫法題把要考的詞換成「漢字《讀音》」，換句話說照原句', () => {
    expect(fillTarget('駅《えき》で⟦切符⟧を買《か》いました。', 'きっぷ')).toBe('駅《えき》で｜切符《きっぷ》を買《か》いました。');
    expect(fillTarget('⟦りょこう⟧の計画《けいかく》', '⟦旅行⟧')).toBe('｜旅行《りょこう》の計画《けいかく》');
    expect(fillTarget('この部屋《へや》は⟦暗《くら》い⟧です。', '電気《でんき》がついていません')).toBe('この部屋《へや》は⟦暗《くら》い⟧です。');
  });

  it('選擇題的題目句：＿＿ 換成答案', () => {
    expect(fillBlank('私《わたし》＿＿学生《がくせい》です。', 'は')).toBe('私《わたし》は学生《がくせい》です。');
    expect(fillBlank('これは＿＿＿ですか。', '何《なん》')).toBe('これは何《なん》ですか。');
  });
});
