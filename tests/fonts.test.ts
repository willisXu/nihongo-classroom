import { describe, expect, it } from 'vitest';
import { collectChars, displayHotChars, fontSelectors, groupChars, hotText, objectTops, toUnicodeRange, type GroupFile } from '../scripts/nk-fonts.mjs';

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

  it('課文：單字、對照區塊的小標題收進假名字型，提醒框的印章收進標題字型', () => {
    const text = `export const lesson = {
      title: '單字練習',
      blocks: [
        { type: 'callout', label: '技巧', items: ['先數拍 [[切手|きって]]'] },
        { type: 'pairs', title: '有沒有拉長', items: [{ a: { ja: 'おばさん', zh: '阿姨' }, b: { ja: 'おばあさん', zh: '奶奶' } }] },
        // 標題寫在 items 後面也算；字串裡的括號不影響
        { type: 'words', items: [{ ja: 'きって', kanji: '切手', zh: '郵票 [1]' }], title: '看清楚、聽清楚' },
        { type: 'p', text: '說明裡的「讀」不算' },
      ],
    };`;
    const { display, ja } = collectChars([{ file: 'data/lessons/lesson9.ts', text }]);
    for (const ch of '有沒拉長看清楚聽') expect(ja.has(ch)).toBe(true); // .rowtitle 用假名字型
    for (const ch of '練讀數') expect(ja.has(ch)).toBe(false); // 段落標題、內文
    expect(ja.has('…')).toBe(true); // 課程列表的「…」
    expect(display.has('技')).toBe(true); // 印章
    const hot = displayHotChars({ file: 'data/lessons/lesson9.ts', text }, []);
    for (const ch of '技巧單字練習') expect(hot.has(ch)).toBe(true);
    expect(hot.has('讀')).toBe(false);
    // 短文區塊（課文）和模擬考題組的短文，標題也是 .rowtitle
    expect(collectChars([{ file: 'data/lessons/lesson47.ts', text: "{ type: 'reading', title: '洗衣店的價目和須知', lines: [] }" }]).ja.has('須')).toBe(true);
    expect(collectChars([{ file: 'data/mock/n4.ts', text: "{ id: 'a', title: '問題 1', reading: { title: '桌上的便條', lines: [] } }" }]).ja.has('桌')).toBe(true);
    // 其他資料檔的 label（例如五十音的行名）不是印章
    expect(collectChars([{ file: 'data/kana.ts', text: "{ type: 'callout', label: '假的' }" }]).display.has('假')).toBe(false);
    expect(objectTops("{ a: '{x}', b: [1, { c: 2 }], d: 'e' }")).toEqual([' c: 2 ', " a: '{x}', b: , d: 'e' "]);
  });

  it('N5 課程：《》前面的漢字、會話人名、漢字欄位收進假名字型；說明裡的中文不收', () => {
    const text = `{ type: 'dialog', lines: [{ who: '田中《たなか》', ja: '私《わたし》は学生《がくせい》です。', zh: '我是學生。' }] },
      { type: 'kanji', items: [{ ch: '日', zh: '太陽' }] },
      { type: 'drill', items: [{ kind: 'choice', options: ['先生《せんせい》', '学校《がっこう》'] }] },
      { type: 'grammar', title: '說明', form: '〔名詞〕は〔名詞〕です', points: ['「先生」在中文是'] }`;
    const { ja } = collectChars([{ file: 'data/lessons/lesson9.ts', text }]);
    for (const ch of '田中私学生日先校') expect(ja.has(ch), ch).toBe(true);
    for (const ch of '太陽在文是我') expect(ja.has(ch), ch).toBe(false);
    // 寫法題的選項（⟦旅族⟧）只有漢字，也要收
    expect(collectChars([{ file: 'data/lessons/lesson36.ts', text: "{ kind: 'choice', options: ['⟦旅族⟧', '⟦家族⟧'] }" }]).ja.has('旅')).toBe(true);
    // 日文欄位裡的符號（會話的「―」、表格裡的「→」）也收
    const marks = collectChars([{ file: 'data/lessons/lesson20.ts', text: "{ ja: '元気《げんき》ですか。―はい。', note: '{{楽《たの》しい → 楽《たの》しかった}}' }" }]);
    for (const ch of '―→') expect(marks.ja.has(ch), ch).toBe(true);
    // 課程摘要的文法名稱只在課程列表顯示，用系統字型（app.css 的 .sys-ja）：假名字型不收（有假名的也不收）
    const meta = collectChars([{ file: 'data/lessons/meta.ts', text: "{ kind: 'course', grammar: ['〜歳', '数字', '家族の言い方'], headline: '說明' }" }]);
    for (const ch of '歳数字家族言方說') expect(meta.ja.has(ch), ch).toBe(false);
    // 別的檔的 grammar 欄位（例如 AI 家教的提示）照一般規則收
    expect(collectChars([{ file: 'data/tutor.ts', text: "{ grammar: ['家族の言い方'] }" }]).ja.has('族')).toBe(true);
    // 課名是日文時（有假名），裡面單獨的漢字也收；中文課名不收
    const titles = collectChars([{ file: 'data/lessons/meta.ts', text: "{ title: '今、何時ですか' }, { title: '片假名（一）' }" }]);
    expect(titles.ja.has('今')).toBe(true);
    expect(titles.ja.has('片')).toBe(false);
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
    const whole = groupChars(new Set([...'ab1 あぞたアンー、。！…Ａ']), [], { base: 'whole' });
    expect(whole.map((g) => [g.key, g.chars.join('')])).toEqual([
      ['ascii', ' 1ab'],
      ['kana', '…、。あぞたアンー！'],
      ['rest:~', 'Ａ'], // 全形英文字母不在任何檔裡：放在其餘組
    ]);
    expect(groups.flatMap((g) => g.chars).sort()).toEqual([...chars].sort()); // 每個字剛好一組
    // 檔案順序（Windows 和 Linux 列出資料夾的順序不同）、字的順序都不影響結果
    expect(groupChars(new Set([...chars].reverse()), [...files].reverse(), { core: 3, chunk: 2, restChunk: 10 })).toEqual(groups);
  });

  it('分組：課文 56 個檔算同一頁；好幾課都有的字放「課文共用」組，照第一次出現的課排', () => {
    const f = (file: string, text: string): GroupFile => ({ file, text, chars: new Set(text), hot: new Set(text) });
    const files = [
      f('data/lessons/lesson9.ts', '甲乙'),
      f('data/lessons/lesson10.ts', '甲乙丙'),
      f('data/lessons/lesson11.ts', '甲乙丙'),
      f('data/lessons/lesson12.ts', '丙丁'),
      f('data/lessons/lesson2.ts', '乙丙'),
      f('pages/A.tsx', '戊丁'),
      f('pages/B.tsx', '戊'),
    ];
    const groups = groupChars(new Set('甲乙丙丁戊'), files, { core: 2, lessonCore: 3, lessonChunk: 2 });
    const byKey = (k: string) => groups.filter((g) => g.key === k).map((g) => g.chars.join(''));
    // 戊：兩頁（A、B）→ 常用；丁：課文和 A 兩頁 → 常用。乙、丙出現在好幾課，但只算課文一頁，不是常用
    expect(byKey('core')).toEqual(['丁戊']);
    // 丙、乙（都是第 2 課起、4 課，一樣的照碼位）、甲（第 9 課起，3 課）：照第一次出現的課排，2 個字一個檔
    expect(byKey('lessons')).toEqual(['丙乙', '甲']);
    // 沒有設 lessonCore 時不分課文共用組（照舊放在字最少的那個檔）
    expect(groupChars(new Set('甲'), files, { core: 2 }).map((g) => g.key)).toEqual(['hot:data/lessons/lesson9.ts']);
  });

  it('連續的字合成一段 unicode-range', () => {
    expect(toUnicodeRange([0x41, 0x42, 0x43, 0x45, 0x4e00, 0x41])).toBe('U+41-43,U+45,U+4E00');
  });
});
