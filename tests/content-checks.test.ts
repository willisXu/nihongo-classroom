/**
 * 教材內容的交叉檢查（不需要網路、不用字典）：漢字區塊的例詞讀音、單字卡例句、模擬考標的課。
 * 念法（片假名讀音的詞、容易念錯的詞）的檢查在 spoken.test.ts。
 */
import { describe, expect, it } from 'vitest';
import { COURSE_LESSON_DATA } from './lessonData';
import { mock } from '../src/data/mock/n4';
import { DECKS } from '../src/data/vocab';
import { kanjiInfo } from '../src/data/kanji';
import type { DrillItem, VocabItem } from '../src/data/types';
import { jaPlain, jaReading } from '../src/lib/ja';
import { conjugate, type VerbForm } from '../src/lib/verbs';
import { toHiragana } from '../src/lib/romaji';

const ALL_CARDS: VocabItem[] = DECKS.flatMap((d) => d.items);

/* ---------------- 漢字區塊的例詞：讀音要能用 data/kanji.ts 的讀音拆出來 ---------------- */

const DAKU: Record<string, string> = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ', た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ' };
const HANDAKU: Record<string, string> = { は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ' };
const I_ROW: Record<string, string> = { う: 'い', く: 'き', ぐ: 'ぎ', す: 'し', つ: 'ち', ぬ: 'に', ぶ: 'び', む: 'み', る: 'り' };

/** 一個讀音在詞裡可能的樣子：連濁（か→が、は→ば・ぱ）、促音化（いち→いっ、がく→がっ） */
function soundChanges(r: string): string[] {
  const out = new Set([r]);
  const head = r[0];
  if (DAKU[head]) out.add(DAKU[head] + r.slice(1));
  if (HANDAKU[head]) out.add(HANDAKU[head] + r.slice(1));
  for (const x of [...out]) {
    if (x.length >= 2 && /[つちくき]$/.test(x)) out.add(x.slice(0, -1) + 'っ');
    if (x === 'じゅう') out.add('じゅっ');
  }
  return [...out];
}

/** 這個漢字可以有的讀音：音讀、訓讀（含送假名省略的名詞形，例如 引く → 割引《わりびき》、合う → 試合《しあい》） */
function readingsOf(ch: string): string[] {
  const info = kanjiInfo(ch);
  if (!info) return [];
  const base = new Set<string>(info.on.map(toHiragana));
  for (const k of info.kun) {
    const [stem, okuri = ''] = k.split('・');
    base.add(stem);
    if (!okuri) continue;
    base.add(stem + okuri);
    const last = okuri.slice(-1);
    if (I_ROW[last]) base.add(stem + okuri.slice(0, -1) + I_ROW[last]);
    if (last === 'る') base.add(stem + okuri.slice(0, -1));
  }
  return [...base].flatMap(soundChanges);
}

/** 讀音能不能拆成：目標漢字用它的讀音、其他漢字（和數字）至少一個假名、假名照寫 */
function splittable(word: string, reading: string, target: string): boolean {
  const chars = [...toHiragana(word)];
  const r = toHiragana(reading);
  const mine = readingsOf(target);
  const memo = new Map<string, boolean>();
  const go = (i: number, j: number): boolean => {
    const key = `${i},${j}`;
    if (memo.has(key)) return memo.get(key)!;
    let ok = false;
    if (i === chars.length) ok = j === r.length;
    else if (chars[i] === target) ok = mine.some((m) => r.startsWith(m, j) && go(i + 1, j + m.length));
    else if (/[\p{Script=Han}々0-9０-９]/u.test(chars[i])) {
      for (let k = j + 1; k <= r.length && !ok; k++) ok = go(i + 1, k);
    } else ok = r[j] === chars[i] && go(i + 1, j + 1);
    memo.set(key, ok);
    return ok;
  };
  return go(0, 0);
}

/** 特別的念法（熟字訓、當て字）：拆不出來是正常的。key 是「字：詞」 */
const SPECIAL_READINGS = new Set([
  '日：日本', '本：日本語', '人：日本人', '語：日本語', // にほん：日 念 に
  '二：二十歳', // はたち
  '八：八日', // ようか
  '時：時計', '計：時計', // とけい
  '今：今日', '今：今年', '年：今年', '朝：今朝', '明：明日', // きょう、ことし、けさ、あした
  '来：来ます', // 来る 的ます形念 き
  '百：八百屋', // やおや
  '千：千葉', // 地名 ちば
  '大：大人', // おとな
  '下：下手', '手：上手', // へた、じょうず
  '雨：梅雨', // つゆ
  '入：入口', '口：入口', // いりぐち
  '父：お父さん', '母：お母さん', '兄：お兄さん', '姉：お姉さん',
  '北：台北', // タイペイ
  '手：切手', '切：切手', // きって
  '夕：七夕', // たなばた
  '産：お土産', // おみやげ
  '田：田舎', // いなか
]);

describe('漢字區塊', () => {
  it('例詞的讀音能用這個字在 data/kanji.ts 的讀音拆出來（特別念法列在 SPECIAL_READINGS）', () => {
    const bad: string[] = [];
    const usedSpecial = new Set<string>();
    for (const l of COURSE_LESSON_DATA) {
      for (const s of l.sections) {
        for (const b of s.blocks) {
          if (b.type !== 'kanji') continue;
          for (const k of b.items) {
            for (const w of k.words) {
              const word = jaPlain(w.ja).replace(/[〜～]/g, '');
              const reading = jaReading(w.ja).replace(/[〜～]/g, '');
              const key = `${k.ch}：${word}`;
              if (SPECIAL_READINGS.has(key)) {
                usedSpecial.add(key);
                continue;
              }
              if (!splittable(word, reading, k.ch)) {
                bad.push(`第 ${l.id} 課 ${k.ch} 的例詞 ${word}《${reading}》：data/kanji.ts 的讀音（${[...kanjiInfo(k.ch)!.on, ...kanjiInfo(k.ch)!.kun].join('、')}）拆不出來`);
              }
            }
          }
        }
      }
    }
    expect(bad).toEqual([]);
    // 清單裡沒用到的（例詞改掉了）要拿掉
    expect([...SPECIAL_READINGS].filter((k) => !usedSpecial.has(k))).toEqual([]);
  });
});

/* ---------------- 單字卡的例句要用到這個字 ---------------- */

/** 單字卡的字在句子裡可能的樣子：辭書形、詞幹（動詞變化、形容詞變化） */
function cardForms(it: VocabItem): string[] {
  const out = new Set<string>();
  for (const w of [it.kanji, it.kana]) {
    if (!w) continue;
    const f = w.replace(/[〜～]/g, '');
    out.add(f);
    if (it.pos === 'verb' && it.verbGroup) {
      for (const form of ['masu', 'te', 'ta', 'nai', 'potential', 'passive', 'causative', 'volitional', 'ba'] as VerbForm[]) {
        try {
          out.add(conjugate(f, it.verbGroup, form).replace(/(ます|て|で|た|だ|ない|れる|られる|せる|させる|う|よう|ば)$/, ''));
        } catch {
          // ある 沒有可能形
        }
      }
      if (it.verbGroup === 3) out.add(f.replace(/(する|くる|来る)$/, ''));
    }
    if (it.pos === 'i-adj') out.add(f.replace(/い$/, ''));
  }
  return [...out].filter((x) => x.length > 0);
}

describe('單字卡的例句', () => {
  it('例句裡有這張卡的字（漢字寫法、假名，或動詞、形容詞的變化）', () => {
    const bad: string[] = [];
    for (const it of ALL_CARDS) {
      if (!it.ex) continue;
      const forms = cardForms(it);
      const kana = toHiragana(it.ex.kana);
      if (forms.some((f) => it.ex!.ja.includes(f) || kana.includes(toHiragana(f)))) continue;
      bad.push(`${it.id} ${it.kanji ?? it.kana}：例句「${it.ex.ja}」沒有用到這個字`);
    }
    expect(bad).toEqual([]);
  });
});

/* ---------------- 模擬考：文字・語彙的題目標的課，是教這個字的那一課 ---------------- */

/** 每張單字卡在哪一課的單字區塊（一張卡只在一課） */
function cardLessons(): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of COURSE_LESSON_DATA) {
    for (const s of l.sections) for (const b of s.blocks) if (b.type === 'vocab') for (const w of b.items) if (w.id) out.set(w.id, l.id);
  }
  return out;
}

/** 題目要考的詞：畫底線的詞（⟦⟧，選項有⟦⟧時用正確的選項）、用法題的 [[詞]]、填空題的正確選項 */
function mockTarget(d: Extract<DrillItem, { kind: 'choice' }>): string {
  const answer = d.options[d.answer];
  const under = (t: string) => /⟦([^⟧]+)⟧/.exec(t)?.[1];
  const raw = under(answer) ?? (d.ja ? under(d.ja) : undefined) ?? (d.q ? /\[\[([^\]|]+)/.exec(d.q)?.[1] : undefined) ?? answer;
  return jaPlain(raw);
}

describe('N4 模擬考', () => {
  it('文字・語彙：每一題標的課（lesson）是單字區塊教這個字的那一課', () => {
    const where = cardLessons();
    const bad: string[] = [];
    const vocab = mock.sections.find((s) => s.id === 'vocab')!;
    let checked = 0;
    for (const p of vocab.parts) {
      for (const d of p.items) {
        if (d.kind !== 'choice') continue;
        const target = mockTarget(d);
        // 對到的單字卡：考的詞以這張卡的某個形式開頭，取最長的那個
        let best: { id: string; len: number } | null = null;
        for (const it of ALL_CARDS) {
          if (!where.has(it.id)) continue;
          for (const f of cardForms(it)) {
            if (f.length >= 2 && target.startsWith(f) && (!best || f.length > best.len)) best = { id: it.id, len: f.length };
          }
        }
        if (!best) {
          bad.push(`${p.title}「${target}」：找不到教這個字的課`);
          continue;
        }
        checked++;
        const lesson = where.get(best.id);
        if (d.lesson !== lesson) bad.push(`${p.title}「${target}」（${best.id}）：標第 ${d.lesson} 課，單字區塊在第 ${lesson} 課`);
      }
    }
    expect(bad).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(15);
  });
});
