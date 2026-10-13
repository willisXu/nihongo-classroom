import { describe, expect, it } from 'vitest';
import { collectChars, displayHotChars, fontSelectors, groupChars, hotText, toUnicodeRange, type GroupFile } from '../scripts/nk-fonts.mjs';

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
    // 建置時傳進來的是相對於 src 的路徑
    expect([...collectChars([{ file: 'data/vocab/travel.ts', text: "{ zh: '機場' }" }]).meaning]).toEqual(['機', '場']);
  });

  it('從 CSS 找出用標題字型的元素', () => {
    const css = `
      /* 註解裡的 { 不算 */
      h1, h2 { font-family: var(--font-display); }
      .brand-name { display: block; font-family: var(--font-display); }
      .home-jlpt b { font-family: var(--font-display); }
      .lede { font-family: var(--font-body); }
      .f-zh { font-family: 'NK Display', 'NK Meaning', var(--font-display); }`;
    const sels = fontSelectors(css, (b) => /var\(--font-display\)|'NK Display'/.test(b));
    expect(sels).toEqual([
      [{ tag: 'h1', classes: [] }],
      [{ tag: 'h2', classes: [] }],
      [{ tag: null, classes: ['brand-name'] }],
      [{ tag: null, classes: ['home-jlpt'] }, { tag: 'b', classes: [] }],
      [{ tag: null, classes: ['f-zh'] }],
    ]);
  });

  it('只取被標題元素包住的文字（巢狀的同名元素、className 運算式、子元素都算）', () => {
    const sels = fontSelectors('h2 { font-family: var(--font-display) } .tips dt { font-family: var(--font-display) } .ok { font-family: var(--font-display) }', () => true);
    const src = `
      <section>
        <h2 id="x">學習<span lang="ja">日曆</span></h2>
        <p className="lede">內文不算</p>
        <dl className="tips"><div><dt>{t.title}標題</dt><dd>說明</dd></div></dl>
        <dt>外面的 dt 不算</dt>
        <span className={ok ? 'ok big' : 'no'}>正解</span>
        <div className="tooltip">提示</div>
      </section>`;
    const text = hotText(src, sels);
    for (const ch of '學習日曆標題正解') expect(text).toContain(ch);
    for (const ch of '內文說明外面提示') expect(text).not.toContain(ch);
    // 資料檔：標題欄位
    expect([...displayHotChars({ file: 'data/a.ts', text: "{ title: '旅遊', body: '說明' }" }, sels)].join('')).toBe('旅遊');
  });

  it('分組：英數、假名照碼位分段，常用的字一組，其餘跟著字最少的檔；同樣的輸入分組一樣', () => {
    const f = (file: string, text: string, hot = text): GroupFile => ({ file, text, chars: new Set(text), hot: new Set(hot) });
    const files = [
      f('components/Layout.tsx', '日文自學教室'),
      f('pages/A.tsx', '今天學習單字今天', '今天學習'),
      f('pages/B.tsx', '學習單字紀錄', '學習紀錄'),
      f('pages/C.tsx', '學習曆紀錄', '學習曆'),
      f('data/x.ts', '紀錄'),
    ];
    const chars = new Set([...'abc あぞたアンー', ...files.flatMap((x) => [...x.text])]);
    const groups = groupChars(chars, files, { core: 3, chunk: 2, restChunk: 10 });
    const byKey = (k: string) => groups.filter((g) => g.key === k).map((g) => g.chars.join(''));
    expect(byKey('digits')).toEqual([' ']);
    expect(byKey('latin')).toEqual(['abc']);
    expect(byKey('hira-1')).toEqual(['あぞ']); // あ～さ行
    expect(byKey('hira-2')).toEqual(['た']); // た～は行
    expect(byKey('kata-1')).toEqual(['ア']);
    expect(byKey('kata-3')).toEqual(['ンー']); // ま～わ行和長音符號
    // 常用：學（4 個檔的標題）、習（3 個）在前，Layout 的字每一頁都有也放進來（之後照碼位）
    expect(byKey('core')).toEqual(['學習室教文日自']);
    // 紀錄只在 B 和 x 的標題（不到 3 個檔）：放在標題字最少的檔（x）
    expect(byKey('hot:data/x.ts')).toEqual(['紀錄']);
    expect(byKey('hot:pages/A.tsx')).toEqual(['今天']);
    expect(byKey('hot:pages/C.tsx')).toEqual(['曆']);
    // 單字：A、B 都有但不在標題裡 → 其餘組，平常不會下載（兩個檔的字一樣多，照檔名）
    expect(byKey('rest:pages/A.tsx')).toEqual(['單字']);
    // 組的順序：英數、平假名、片假名、常用、各檔標題、其餘
    expect([...new Set(groups.map((g) => g.key))]).toEqual(['digits', 'latin', 'hira-1', 'hira-2', 'kata-1', 'kata-3', 'core', 'hot:data/x.ts', 'hot:pages/A.tsx', 'hot:pages/C.tsx', 'rest:pages/A.tsx']);
    // 假名字型：假名和全形標點同一組（字距微調才不會斷掉），英數一組
    const whole = groupChars(new Set([...'ab1 あぞたアンー、。！Ａ']), [], { base: 'whole' });
    expect(whole.map((g) => [g.key, g.chars.join('')])).toEqual([
      ['ascii', ' 1ab'],
      ['kana', '、。あぞたアンー！'],
      ['rest:~', 'Ａ'], // 全形英文字母不在任何檔裡：放在其餘組
    ]);
    expect(groups.flatMap((g) => g.chars).sort()).toEqual([...chars].sort()); // 每個字剛好一組
    // 檔案順序（Windows 和 Linux 列出資料夾的順序不同）、字的順序都不影響結果
    expect(groupChars(new Set([...chars].reverse()), [...files].reverse(), { core: 3, chunk: 2, restChunk: 10 })).toEqual(groups);
  });

  it('連續的字合成一段 unicode-range', () => {
    expect(toUnicodeRange([0x41, 0x42, 0x43, 0x45, 0x4e00, 0x41])).toBe('U+41-43,U+45,U+4E00');
  });
});
