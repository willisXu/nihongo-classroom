import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DECKS } from '../src/data/vocab';
import { deckItemIds, speechText } from '../src/lib/vocab';
import { voiceRank } from '../src/lib/speech';

const ALL = DECKS.flatMap((d) => d.items);
const HAS_KANJI = /[一-鿿々〆]/;

describe('單字發音', () => {
  it('一律念假名，不念「〜」', () => {
    for (const it of ALL) {
      const t = speechText(it);
      expect(t, it.id).not.toMatch(HAS_KANJI);
      expect(t, it.id).not.toMatch(/[〜～]/);
      expect(t.length, it.id).toBeGreaterThan(0);
    }
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

describe('全部牌組', () => {
  it('同一個字（假名＋漢字）只出現一次', () => {
    const ids = deckItemIds('all');
    const keys = ids.map((id) => {
      const it = ALL.find((x) => x.id === id)!;
      return `${it.kana}|${it.kanji ?? ''}`;
    });
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(ALL.map((it) => `${it.kana}|${it.kanji ?? ''}`)).size).toBe(ids.length);
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
