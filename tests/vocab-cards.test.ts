import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DECKS } from '../src/data/vocab';
import type { VocabItem } from '../src/data/types';
import { DUPLICATE_OF, isCardId, unseenWords, wordLearned } from '../src/data/vocab/meta';
import { courseLessonById } from '../src/data/lessons/meta';
import { deckAllLearned, deckItemIds, exampleSpeech, romajiOf, speechText, vocabSearchQuery, vocabSearchText } from '../src/lib/vocab';
import { romaji } from '../src/lib/romaji';
import { voiceRank } from '../src/lib/speech';

const ALL = DECKS.flatMap((d) => d.items);
const HAS_KANJI = /[一-鿿々〆]/;

describe('單字發音', () => {
  it('念假名（少數指定念法的字除外），不念「〜」', () => {
    // はち、はは 只有假名時，有些語音會把 は 當助詞念成 wa：改念只有一種讀音的漢字
    expect(ALL.filter((it) => it.say).map((it) => it.id).sort()).toEqual(['n5-0044', 'n5-0165']);
    for (const it of ALL) {
      const t = speechText(it);
      if (it.say) {
        const readings = new Set(ALL.filter((x) => x.kanji === it.say).map((x) => x.kana));
        expect([...readings], `${it.id} 指定念 ${it.say}`).toEqual([it.kana]);
      } else {
        expect(t, it.id).not.toMatch(HAS_KANJI);
      }
      expect(t, it.id).not.toMatch(/[〜～]/);
      expect(t.length, it.id).toBeGreaterThan(0);
    }
  });

  it('例句指定的念法（say）只把容易念錯的漢字換成假名，其他照原句', () => {
    const withSay = ALL.filter((it) => it.ex?.say);
    // N4 課程單字、N4 補充單字的例句是用課文的標記寫的，念法和課文一樣（何→なに、今→いま…，見 lib/ja.ts 的 jaSpeech）；
    // 其他牌組只有少數幾句：辛い、角、開く、降りる、何色，和 台北（念 タイペイ，語音引擎會念成 たいほく）
    expect(withSay.filter((it) => !/^n4(plus)?-/.test(it.id)).length).toBe(15);
    for (const it of withSay) {
      const ex = it.ex!;
      expect(exampleSpeech(ex), it.id).toBe(ex.say);
      // 換掉的部分要出現在全假名讀音裡：把 say 的漢字（和數字、英文字母）部分拿掉後，剩下的假名都依序出現在 kana 裡
      const kanaParts = ex.say!.split(/[一-鿿々〆0-9０-９,，A-Za-zＡ-Ｚａ-ｚ]+/).filter(Boolean);
      let at = 0;
      for (const part of kanaParts) {
        const i = ex.kana.indexOf(part, at);
        expect(i, `${it.id}：「${part}」不在讀音裡`).toBeGreaterThanOrEqual(0);
        at = i + part.length;
      }
    }
    for (const it of ALL) if (it.ex && !it.ex.say) expect(exampleSpeech(it.ex)).toBe(it.ex.ja);
  });

  it('同一個漢字、不同讀音的卡片，念出來的也不同', () => {
    const byKanji = new Map<string, Set<string>>();
    for (const it of ALL) {
      if (!it.kanji) continue;
      const set = byKanji.get(it.kanji) ?? byKanji.set(it.kanji, new Set()).get(it.kanji)!;
      set.add(it.kana);
    }
    const multi = [...byKanji.entries()].filter(([, readings]) => readings.size > 1);
    expect(multi.length).toBeGreaterThanOrEqual(8); // 四、七、九、十、一日、私、〜人、〜中…
    for (const [kanji, readings] of multi) {
      const spoken = ALL.filter((it) => it.kanji === kanji).map((it) => speechText(it));
      expect(new Set(spoken).size, kanji).toBe(readings.size);
    }
  });

  it('自動挑語音時，自然語音排在 Windows 舊語音前面', () => {
    const names = [
      'Microsoft Haruka - Japanese (Japan)',
      'Microsoft Nanami Online (Natural) - Japanese (Japan)',
      'Google 日本語',
      'Some Other Voice',
    ];
    const sorted = [...names].sort((a, b) => voiceRank(a) - voiceRank(b));
    expect(sorted).toEqual([names[1], names[2], names[0], names[3]]);
  });
});

describe('羅馬拼音', () => {
  /** 只寫假名、は 是詞的一部分（不是助詞）的詞：詞首的 は（はい、はじめまして）另外不算 */
  const HA_IN_WORD = new Set(['おはよう', 'おはようございます', 'やはり']);
  const AFTER_PUNCT = /[、。？！「」・\s　]/;

  /**
   * 卡片的假名裡有幾個助詞 は、へ（新加的卡片也會自動檢查到）：
   * 有漢字寫法時，詞都寫成漢字，漢字寫法裡留下來的 は、へ 就是助詞（実は、袋は大丈夫です）；
   * 只有假名時，不在開頭、也不在標點後面的 は、へ 算助詞（こんにちは、トイレはどこですか），HA_IN_WORD 除外。
   */
  function particles(it: VocabItem): number {
    if (it.kanji) return [...it.kanji].filter((ch) => ch === 'は' || ch === 'へ').length;
    if (HA_IN_WORD.has(it.kana)) return 0;
    const chars = [...it.kana];
    return chars.filter((ch, i) => (ch === 'は' || ch === 'へ') && i > 0 && !AFTER_PUNCT.test(chars[i - 1])).length;
  }

  /**
   * r 和假名對得上嗎：不算空格，除了助詞 は 寫 wa、へ 寫 e，其他都要和自動產生的拼音一樣。
   * 對得上就回傳寫成 wa、e 的助詞有幾個，對不上回傳 null。
   */
  function particleReadings(r: string, kana: string): number | null {
    const a = romaji(kana).replace(/\s+/g, '');
    const b = r.replace(/\s+/g, '');
    let i = 0;
    let j = 0;
    let n = 0;
    while (i < a.length && j < b.length) {
      if (a.startsWith('ha', i) && b.startsWith('wa', j)) {
        i += 2;
        j += 2;
        n++;
      } else if (a.startsWith('he', i) && b[j] === 'e') {
        i += 2;
        j += 1;
        n++;
      } else if (a[i] === b[j]) {
        i++;
        j++;
      } else return null;
    }
    return i === a.length && j === b.length ? n : null;
  }

  it('有助詞 は、へ 的卡片都寫了拼音 r，助詞念 wa、e（不會變成 konnichiha、toire ha）', () => {
    const need = ALL.filter((it) => particles(it) > 0);
    expect(need.length).toBeGreaterThanOrEqual(20);
    const bad = need.filter((it) => !it.r || particleReadings(it.r, it.kana) !== particles(it)).map((it) => `${it.id} ${it.kana} → ${it.r ?? romaji(it.kana)}`);
    expect(bad).toEqual([]);
  });

  it('寫了 r 的卡片：除了助詞，拼音和假名一致（照 lib/romaji 的規則，長音 ū、ō）', () => {
    for (const it of ALL.filter((x) => x.r)) {
      expect(particleReadings(it.r!, it.kana), `${it.id} ${it.kana} → ${it.r}`).toBe(particles(it));
      expect(it.r, it.id).toBe(it.r!.trim());
      expect(it.r, it.id).not.toMatch(/\s{2}/);
    }
  });

  it('卡片顯示的拼音：有 r 用 r，其他從假名產生', () => {
    const byId = (id: string) => ALL.find((it) => it.id === id)!;
    expect(romajiOf(byId('n5-0002'))).toBe('konnichiwa');
    expect(romajiOf(byId('travel-0129'))).toBe('toire wa doko desu ka');
    expect(romajiOf(byId('travel-0130'))).toBe('~ e wa dou yatte ikeba ii desu ka');
    expect(romajiOf(byId('n5-0001'))).toBe('ohayougozaimasu');
    expect(romajiOf(byId('n5-0011'))).toBe('hajimemashite');
  });
});

describe('牌組頁的搜尋', () => {
  const find = (q: string) => ALL.filter((it) => vocabSearchText(it).includes(vocabSearchQuery(q))).map((it) => it.id);

  it('助詞 は 寫成 wa 的拼音找得到，照輸入法打的 ha 也找得到；句子不分詞也可以', () => {
    expect(find('konnichiwa')).toContain('n5-0002');
    expect(find('konnichiha')).toContain('n5-0002');
    expect(find('Toire wa doko')).toContain('travel-0129');
    expect(find('toirewadoko')).toContain('travel-0129');
    expect(find('menyu wa')).toContain('travel-0074');
  });

  it('片假名、平假名都找得到（こーひー 找得到 コーヒー）；拼音的長音寫法都算', () => {
    const coffee = ALL.find((it) => it.kana === 'コーヒー')!.id;
    for (const q of ['コーヒー', 'こーひー', ' こーひー ', 'kōhī', 'kohi', 'koohii']) expect(find(q), q).toContain(coffee);
    expect(find('てれび')).toContain(ALL.find((it) => it.kana === 'テレビ')!.id);
    // 漢字寫法裡的片假名也一樣（中国語のメニューはありますか）
    expect(find('めにゅーは')).toContain('travel-0074');
    expect(find('食べ')).toContain(ALL.find((it) => it.kanji === '食べる')!.id);
    expect(find('咖啡')).toContain(coffee);
  });
});

describe('單一牌組', () => {
  it('在別的牌組學過的同一個字不再當新卡；這個牌組自己學過的照常複習', () => {
    const travel = DECKS.find((d) => d.id === 'travel')!;
    const dupIds = travel.items.filter((it) => DUPLICATE_OF[it.id]?.startsWith('n5-')).map((it) => it.id);
    expect(dupIds.length).toBeGreaterThan(50);
    // 學完 N5 的對應單字
    const cards: Record<string, { reps: number }> = {};
    for (const id of dupIds) cards[DUPLICATE_OF[id]] = { reps: 3 };
    const ids = deckItemIds('travel', cards);
    expect(ids.length).toBe(travel.items.length - dupIds.length);
    for (const id of dupIds) expect(ids).not.toContain(id);
    // 旅遊牌組自己學過的卡片，即使 N5 也學過，照常留著複習
    cards[dupIds[0]] = { reps: 1 };
    expect(deckItemIds('travel', cards)).toContain(dupIds[0]);
    // 沒學過別的牌組時，整個牌組都在
    expect(deckItemIds('travel')).toHaveLength(travel.items.length);
  });

  it('はく（N5 只寫假名、旅遊原本寫 履く）當成同一個字', () => {
    expect(DUPLICATE_OF['travel-0212']).toBe('n5-0617');
    expect(deckItemIds('travel', { 'n5-0617': { reps: 2 } })).not.toContain('travel-0212');
  });
});

describe('全部牌組', () => {
  it('還沒學過的同一個字（假名＋漢字）只出現一次', () => {
    const ids = deckItemIds('all');
    const keys = ids.map((id) => {
      const it = ALL.find((x) => x.id === id)!;
      return `${it.kana}|${it.kanji ?? ''}`;
    });
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(ALL.map((it) => `${it.kana}|${it.kanji ?? ''}`)).size).toBe(ids.length);
  });

  it('另一個牌組裡已經學過的同一個字照常出現', () => {
    const dup = ALL.find((it) => it.id.startsWith('travel-') && ALL.some((o) => o.id.startsWith('n5-') && o.kana === it.kana && o.kanji === it.kanji))!;
    const twin = ALL.find((o) => o.id.startsWith('n5-') && o.kana === dup.kana && o.kanji === dup.kanji)!;
    expect(deckItemIds('all')).not.toContain(dup.id);
    const withProgress = deckItemIds('all', { [dup.id]: { reps: 2 } });
    expect(withProgress).toContain(dup.id);
    expect(withProgress, '已經學過的字不再當新卡').not.toContain(twin.id);
  });

  it('重複字清單（首頁、學習紀錄不載入單字資料也能合併計算）和單字資料一致', () => {
    const first = new Map<string, string>();
    const expected: Record<string, string> = {};
    for (const it of ALL) {
      const key = `${it.kana}|${it.kanji ?? ''}`;
      const head = first.get(key);
      if (head) expected[it.id] = head;
      else first.set(key, it.id);
    }
    expect(DUPLICATE_OF).toEqual(expected);
    // 「全部牌組」能學的新字數，和合併後還沒學的字數一樣
    expect(unseenWords({})).toBe(deckItemIds('all').length);
    const dup = Object.keys(DUPLICATE_OF)[0];
    const progress = { [dup]: { reps: 1 } };
    expect(unseenWords(progress)).toBe(deckItemIds('all', progress).filter((id) => id !== dup).length);
  });

  it('課程的字排在新卡最前面；課程的字在別的牌組學過時，換成清單裡同一個字的那張（和逐一找的結果一樣）', async () => {
    const { LESSON_META } = await import('../src/data/lessons/meta');
    const { courseWords } = await import('../src/lib/progress');
    const priority = courseWords({ done: Object.fromEntries(LESSON_META.map((l) => [l.id, 1])), hw: {} });
    // 以前的寫法：在清單裡逐一找同一個字的卡
    const key = (id: string) => {
      const it = ALL.find((x) => x.id === id)!;
      return `${it.kana}|${it.kanji ?? ''}`;
    };
    const reference = (cards: Record<string, { reps: number }>) => {
      const ids = deckItemIds('all', cards);
      const same = (id: string) => (ids.includes(id) ? id : (ids.find((x) => key(x) === key(id)) ?? id));
      const first = [...new Set(priority.map(same))].filter((id) => ids.includes(id));
      return [...first, ...ids.filter((id) => !first.includes(id))];
    };
    const otherDecks = Object.fromEntries(ALL.filter((it) => /^(travel|business|anime)-/.test(it.id)).map((it) => [it.id, { reps: 2 }]));
    const someN5 = Object.fromEntries(ALL.filter((it) => it.id.startsWith('n5-')).slice(0, 300).map((it) => [it.id, { reps: 2 }]));
    for (const cards of [{}, otherDecks, someN5]) expect(deckItemIds('all', cards, priority)).toEqual(reference(cards));
    // 先背了旅遊牌組：課程裡的 n5-0458（旅遊牌組也有）換成學過的 travel-0219
    expect(deckItemIds('all', otherDecks, priority).slice(0, 200)).toContain('travel-0219');
    expect(deckItemIds('all', otherDecks, priority)).not.toContain('n5-0458');
  });

  it('同一個字在不同牌組的寫法一致（假名和中文都相同時，漢字欄位也要相同）', () => {
    const seen = new Map<string, { id: string; kanji?: string }>();
    for (const it of ALL) {
      const key = `${it.kana}|${it.zh}`;
      const prev = seen.get(key);
      if (prev) expect(it.kanji, `${it.id} 和 ${prev.id} 寫法不一致`).toBe(prev.kanji);
      else seen.set(key, { id: it.id, kanji: it.kanji });
    }
  });
});

describe('學過的字（在別的牌組學過也算）', () => {
  // 先背完旅遊、職場、動畫牌組，再上課：課文的字有些在那幾組學過了
  const learnedOthers: Record<string, { reps: number }> = {};
  for (const d of DECKS.filter((x) => ['travel', 'business', 'anime'].includes(x.id))) for (const it of d.items) learnedOthers[it.id] = { reps: 3 };

  it('wordLearned：這張學過、或同一個字在別的牌組學過；課文單字區塊的「已經學過」和這一課實際的新卡加起來是全部', () => {
    expect(wordLearned({ 'n5-0370': { reps: 1 } }, 'n5-0370')).toBe(true);
    expect(wordLearned({ 'travel-0002': { reps: 1 } }, 'n5-0370')).toBe(true); // 同一個字（DUPLICATE_OF）
    expect(wordLearned({ 'travel-0002': { reps: 0 } }, 'n5-0370')).toBe(false);
    for (const lesson of [10, 14, 17]) {
      const words = courseLessonById(lesson)!.words;
      const learned = words.filter((id) => wordLearned(learnedOthers, id)).length;
      const fresh = deckItemIds(`lesson-${lesson}`, learnedOthers).filter((id) => !learnedOthers[id]).length;
      expect(learned + fresh, `第 ${lesson} 課`).toBe(words.length);
    }
    // 第 14 課有一半的字在旅遊牌組學過（以前顯示「已經學過 0 個」）
    expect(courseLessonById(14)!.words.filter((id) => wordLearned(learnedOthers, id)).length).toBeGreaterThan(5);
  });

  it('deckAllLearned：整組（或整課）的字都學過才算，在別的牌組學過的也算；找不到的牌組不算', () => {
    const course = DECKS.find((d) => d.id === 'course')!;
    const all = Object.fromEntries(course.items.map((it) => [it.id, { reps: 2 }]));
    expect(deckAllLearned('course', all)).toBe(true);
    const { [course.items[5].id]: _skip, ...missing } = all;
    expect(deckAllLearned('course', missing)).toBe(false);
    expect(deckAllLearned('travel', learnedOthers)).toBe(true);
    expect(deckAllLearned('n5', learnedOthers)).toBe(false);
    // 第 9 課的字都學過了（第 10 課還沒）
    const l9 = Object.fromEntries(courseLessonById(9)!.words.map((id) => [id, { reps: 1 }]));
    expect(deckAllLearned('lesson-9', l9)).toBe(true);
    expect(deckAllLearned('lesson-10', l9)).toBe(false);
    expect(deckAllLearned('all', Object.fromEntries(ALL.map((it) => [it.id, { reps: 1 }])))).toBe(true);
    expect(deckAllLearned('all', learnedOthers)).toBe(false);
    expect(deckAllLearned('nope', all)).toBe(false);
    expect(deckAllLearned('lesson-999', all)).toBe(false);
  });
});

describe('單字 id', () => {
  // 複習紀錄是用 id 記的：舊的 id 不能改成別的字，也不能刪掉重排（新字只能接在後面）
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/vocab-ids.json', import.meta.url), 'utf8')) as Record<string, string>;

  it('isCardId：照牌組摘要的字首和數量判斷（不用載入單字資料），比較新版才有的卡片不認得', () => {
    expect(ALL.every((it) => isCardId(it.id))).toBe(true);
    for (const id of ['n4plus-0370', 'n5-0777', 'course-0071', 'n6-0001', 'n5-0000', 'n5-1', 'n5-0001x', 'N5-0001', '', 'xx-0001']) {
      expect(isCardId(id), id).toBe(false);
    }
  });

  it('既有的 id 都還在，而且還是同一個字', () => {
    const byId = new Map(ALL.map((it) => [it.id, it.kana]));
    for (const [id, kana] of Object.entries(fixture)) {
      expect(byId.has(id), `${id} 不見了`).toBe(true);
      expect(byId.get(id), `${id} 變成別的字了`).toBe(kana);
    }
  });
});

describe('牌組與課程摘要', () => {
  it('牌組摘要和實際單字一致（數量、名稱、依序編號的 id）', async () => {
    const { DECK_META, metaItemIds } = await import('../src/data/vocab/meta');
    expect(DECK_META.map((m) => m.id)).toEqual(DECKS.map((d) => d.id));
    for (const m of DECK_META) {
      const deck = DECKS.find((d) => d.id === m.id)!;
      expect(m.count, `${m.id} 的 count`).toBe(deck.items.length);
      expect(m.title).toBe(deck.title);
      expect(metaItemIds(m)).toEqual(deck.items.map((it) => it.id));
    }
  });

  it('課程摘要和課文一致', async () => {
    const { LESSON_META } = await import('../src/data/lessons/meta');
    const { LESSONS } = await import('./lessonData');
    expect(LESSON_META.map((l) => l.id)).toEqual(LESSONS.map((l) => l.id));
    for (const l of LESSONS) {
      const m = LESSON_META.find((x) => x.id === l.id)!;
      // 課文檔案把摘要整個展開（...kanaMeta(1)），摘要的每個欄位都要一樣
      for (const [k, v] of Object.entries(m)) expect((l as unknown as Record<string, unknown>)[k], `第 ${l.id} 課的 ${k}`).toEqual(v);
    }
  });
});
