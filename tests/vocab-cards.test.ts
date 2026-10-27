import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DECKS } from '../src/data/vocab';
import { DUPLICATE_OF, unseenWords } from '../src/data/vocab/meta';
import { deckItemIds, exampleSpeech, speechText } from '../src/lib/vocab';
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
    // N4 課程單字、N4 補充單字的例句是用課文的標記寫的，念法和課文一樣（何→なに、今→いま…，見 lib/ja.ts 的 jaSpeech）；其他牌組只有少數幾句
    expect(withSay.filter((it) => !/^n4(plus)?-/.test(it.id)).length).toBe(7);
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

describe('單字 id', () => {
  // 複習紀錄是用 id 記的：舊的 id 不能改成別的字，也不能刪掉重排（新字只能接在後面）
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/vocab-ids.json', import.meta.url), 'utf8')) as Record<string, string>;

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
