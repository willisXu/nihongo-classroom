import { describe, expect, it } from 'vitest';
import { DECKS } from '../src/data/vocab';
import type { Pos } from '../src/data/types';

const POS: Pos[] = ['noun', 'verb', 'i-adj', 'na-adj', 'adverb', 'expression', 'number', 'pronoun', 'counter', 'particle', 'conjunction', 'interjection', 'prefix', 'suffix'];
const KANA_WORD = /^[ぁ-ゖァ-ヺー〜・、。？！]+$/;
const KANA_SENTENCE = /^[ぁ-ゖァ-ヺー〜・、。？！「」―　 ]+$/;
const HAS_KANJI = /[一-鿿々〆]/;
/** 常見的簡體字（繁體不用的寫法），中文欄位不該出現（日文的 kanji 欄位不檢查） */
const SIMPLIFIED = Array.from('们这个说时间车东门对过还进么吗习学会语话见电视书买卖钱饭馆开关问题长页热级岁乐发经现实动认识让应该从样处图国园远运边连医药业专务员户无为欢请谢给读写听讲课师网络机场铁线号码钥单厕闹惯价币银债贷费订顾');
const MIN_SIZE: Record<string, number> = { n5: 500, travel: 120, business: 100, anime: 80, course: 60 };

describe('vocab decks', () => {
  it('have globally unique ids with the deck prefix', () => {
    const seen = new Set<string>();
    for (const d of DECKS) for (const it of d.items) {
      expect(it.id.startsWith(d.id + '-'), `${it.id} 應以 ${d.id}- 開頭`).toBe(true);
      expect(seen.has(it.id), `id 重複：${it.id}`).toBe(false);
      seen.add(it.id);
    }
  });

  for (const deck of DECKS) {
    describe(deck.title, () => {
      it(`has at least ${MIN_SIZE[deck.id]} items`, () => {
        expect(deck.items.length).toBeGreaterThanOrEqual(MIN_SIZE[deck.id]);
      });

      it('items are well-formed', () => {
        for (const it of deck.items) {
          const tag = `${it.id}「${it.kana}」`;
          expect(KANA_WORD.test(it.kana), `${tag} 的 kana 只能有假名`).toBe(true);
          expect(it.zh.trim(), `${tag} 缺少中文`).toBeTruthy();
          expect(POS.includes(it.pos), `${tag} 的詞性 ${it.pos} 不在清單內`).toBe(true);
          if (it.kanji !== undefined) {
            expect(HAS_KANJI.test(it.kanji), `${tag} 的 kanji 欄位沒有漢字：${it.kanji}`).toBe(true);
            expect(it.kanji).not.toBe(it.kana);
          }
          if (it.pos === 'verb') expect([1, 2, 3].includes(it.verbGroup as number), `${tag} 是動詞，需要 verbGroup`).toBe(true);
          if (it.pos !== 'verb') expect(it.verbGroup, `${tag} 不是動詞，不應有 verbGroup`).toBeUndefined();
          if (it.ex) {
            expect(it.ex.ja.trim(), `${tag} 例句缺 ja`).toBeTruthy();
            expect(KANA_SENTENCE.test(it.ex.kana), `${tag} 例句的 kana 只能有假名和標點：${it.ex.kana}`).toBe(true);
            expect(it.ex.zh.trim(), `${tag} 例句缺中文`).toBeTruthy();
          }
          const zhText = [it.zh, it.ex?.zh ?? '', it.note ?? '', it.topic ?? ''].join('');
          const simp = SIMPLIFIED.filter((c) => zhText.includes(c));
          expect(simp, `${tag} 的中文欄位有簡體字：${simp.join(' ')}`).toEqual([]);
        }
      });

      it('has no duplicate words', () => {
        const keys = deck.items.map((i) => `${i.kana}|${i.kanji ?? ''}|${i.zh}`);
        const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
        expect(dup, `重複：${dup.join('、')}`).toEqual([]);
        const kk = deck.items.map((i) => `${i.kana}|${i.kanji ?? ''}`);
        const dup2 = kk.filter((k, i) => kk.indexOf(k) !== i);
        expect(dup2, `同一個詞出現兩次：${dup2.join('、')}`).toEqual([]);
      });
    });
  }
});
