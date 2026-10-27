import { describe, expect, it } from 'vitest';
import { fillBlank, fillTarget, grade, optionOrder, orderCorrect, shuffled, talkPitch, validAnswer, withAnswer } from '../src/components/Drill';
import type { DrillItem } from '../src/data/types';
import { parseJa } from '../src/lib/ja';

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

  it('⟦⟧ 題答完：送假名不標讀音（振假名只標在漢字上）', () => {
    expect(fillTarget('この図書館《としょかん》は、⟦たてられました⟧。', '⟦建てられました⟧')).toBe('この図書館《としょかん》は、｜建《た》てられました。');
    expect(fillTarget('この帽子《ぼうし》は⟦かるい⟧ので', '⟦軽い⟧')).toBe('この帽子《ぼうし》は｜軽《かる》いので');
    expect(fillTarget('⟦たのしかった⟧です', '⟦楽しかった⟧')).toBe('｜楽《たの》しかったです');
    expect(fillTarget('荷物《にもつ》を⟦届けます⟧', 'とどけます')).toBe('荷物《にもつ》を｜届《とど》けます');
    // 沒有共同的假名結尾：整個詞標讀音
    expect(fillTarget('⟦かぞく⟧と', '⟦家族⟧')).toBe('｜家族《かぞく》と');
    expect(parseJa(fillTarget('⟦かよって⟧います', '⟦通って⟧'))).toEqual([{ t: '通', r: 'かよ' }, { t: 'っています' }]);
  });

  it('模擬考只算第一次作答；課文的練習題重做時改成新的作答', () => {
    const start = [null, null, null];
    const first = withAnswer(start, 1, [2, 1, 0], true);
    expect(first).toEqual([null, [2, 1, 0], null]);
    // 模擬考：看過答案再排一次也不會變（同一個陣列，不必重畫）
    expect(withAnswer(first, 1, [0, 1, 2], true)).toBe(first);
    expect(withAnswer(first, 2, 0, true)).toEqual([null, [2, 1, 0], 0]);
    // 課文：再排一次就照新的排法算
    expect(withAnswer(first, 1, [0, 1, 2])).toEqual([null, [0, 1, 2], null]);
  });

  it('作答的對錯：選擇題比對原本的選項編號，排列題比對排出來的句子（含另一種也對的順序）', () => {
    const choice: DrillItem = { kind: 'choice', q: '？', options: ['あ', 'い', 'う'], answer: 1 };
    const order: DrillItem = { kind: 'order', zh: '', tiles: ['A', 'B', 'C'], also: [['B', 'A', 'C']] };
    expect(grade(choice, null)).toBe(null);
    expect(grade(choice, 1)).toBe(true);
    expect(grade(choice, 0)).toBe(false);
    expect(grade(order, [0, 1, 2])).toBe(true);
    expect(grade(order, [1, 0, 2])).toBe(true);
    expect(grade(order, [2, 1, 0])).toBe(false);
    // 形狀不對的作答不算答了
    expect(grade(choice, [0])).toBe(null);
    expect(grade(order, 1)).toBe(null);
    // 從瀏覽器讀回來的作答要對得上題目
    expect(validAnswer(choice, 2)).toBe(true);
    expect(validAnswer(choice, 3)).toBe(false);
    expect(validAnswer(choice, 1.5)).toBe(false);
    expect(validAnswer(choice, '1')).toBe(false);
    expect(validAnswer(order, [2, 0, 1])).toBe(true);
    expect(validAnswer(order, [0, 0, 1])).toBe(false);
    expect(validAnswer(order, [0, 1])).toBe(false);
    expect(validAnswer(order, [0, 1, 3])).toBe(false);
  });

  it('選擇題的題目句：＿＿ 換成答案', () => {
    expect(fillBlank('私《わたし》＿＿学生《がくせい》です。', 'は')).toBe('私《わたし》は学生《がくせい》です。');
    expect(fillBlank('これは＿＿＿ですか。', '何《なん》')).toBe('これは何《なん》ですか。');
  });
});
