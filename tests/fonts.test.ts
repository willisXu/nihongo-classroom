import { describe, expect, it } from 'vitest';
import { collectChars, parseFontsourceCss, toUnicodeRange } from '../scripts/nk-fonts.mjs';

describe('字型瘦身', () => {
  it('標題字型收畫面程式和標題欄位的字，假名字型只收日文片段', () => {
    const { display, ja } = collectChars([
      { file: 'src/pages/A.tsx', text: '<h1>今天的學習</h1>' },
      { file: 'src/data/vocab/n5.ts', text: "{ id: 'n5-0001', kana: 'えき', kanji: '駅', zh: '車站', topic: '交通' }" },
      { file: 'src/data/lessons/lesson1.ts', text: "{ title: '三套文字', text: '最後的「は」念「わ」；私はがくせいです' }" },
    ]);
    expect(display.has('今')).toBe(true); // .tsx 裡的字
    expect(display.has('交')).toBe(true); // topic 欄位
    expect(display.has('套')).toBe(true); // title 欄位
    expect(display.has('車')).toBe(false); // 單字解釋用內文字型
    expect(display.has('あ')).toBe(true); // 全部假名
    expect(ja.has('駅')).toBe(true); // kanji 欄位
    expect(ja.has('私')).toBe(true); // 和假名連在一起
    expect(ja.has('念')).toBe(false); // 中文說明裡夾的漢字不收
    expect(ja.has('a')).toBe(true); // 英數字都收
    const { meaning } = collectChars([
      { file: 'src/pages/A.tsx', text: '<h1>車</h1>' },
      { file: 'src/data/vocab/n5.ts', text: "{ zh: '車站' }" },
    ]);
    expect([...meaning]).toEqual(['站']); // 單字解釋的字，標題字型已經有的不重複
  });

  it('連續的字合成一段 unicode-range', () => {
    expect(toUnicodeRange([0x41, 0x42, 0x43, 0x45, 0x4e00, 0x41])).toBe('U+41-43,U+45,U+4E00');
  });

  it('讀得懂 Fontsource 的 CSS（最後一行沒有分號也可以）', () => {
    const css = `@font-face {
  font-family: 'X';
  src: url(./files/x-0-700-normal.woff2) format('woff2'), url(./files/x-0-700-normal.woff) format('woff');
  unicode-range: U+4e00-4e02,U+4e09
}`;
    expect(parseFontsourceCss(css)).toEqual([{ file: 'x-0-700-normal.woff2', ranges: [[0x4e00, 0x4e02], [0x4e09, 0x4e09]] }]);
  });
});
