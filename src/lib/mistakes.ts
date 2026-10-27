/**
 * 錯題本：答錯過的假名、常忘的單字、寫錯的字。
 * 練熟了就自動拿掉：假名連對 3 次、單字在錯題本按「記住了」或變成熟卡、手寫再寫一次沒有錯。
 */
import type { CardState } from './srs';
import type { KanaStats, VocabMisses, WritingStats } from '../state';
import { isCardId } from '../data/vocab/meta';

/** 熟卡：間隔 21 天以上（和單字牌組的統計一致） */
const MATURE_IVL = 21;

/** 答錯過、還沒連對 3 次的假名 key（h:あ、k:ア），錯越多越前面 */
export function weakKanaKeys(stats: KanaStats): string[] {
  return Object.entries(stats)
    .filter(([, e]) => e.w > 0 && e.s < 3)
    .sort((a, b) => b[1].w - b[1].c * 0.25 - (a[1].w - a[1].c * 0.25))
    .map(([k]) => k);
}

export interface VocabMistake {
  id: string;
  /** 忘記幾次 */
  n: number;
  /** 最後一次忘記的時間 */
  t: number;
}

/**
 * 常忘的單字：複習時按過「忘記了」、之後還沒在錯題本按「記住了」的卡片。
 * 錯題本出現之前就忘記過的卡片（沒有紀錄，但有 lapses）也算。卡片已經變成熟卡就不算。
 * 這個版本不認得的卡片（比較新版匯出的備份）不算：錯題本頁列不出來，首頁的題數也不能算它。
 */
export function vocabMistakes(misses: VocabMisses, cards: Record<string, CardState | undefined>): VocabMistake[] {
  const mature = (c: CardState | undefined, since: number) => !!c && c.step === -1 && c.ivl >= MATURE_IVL && c.last > since;
  const out: VocabMistake[] = [];
  for (const [id, m] of Object.entries(misses)) {
    if (m.n > 0 && m.t > m.ok && !mature(cards[id], m.t) && isCardId(id)) out.push({ id, n: m.n, t: m.t });
  }
  for (const [id, c] of Object.entries(cards)) {
    if (c && c.lapses > 0 && !misses[id] && !mature(c, 0) && isCardId(id)) out.push({ id, n: c.lapses, t: c.last });
  }
  return out.sort((a, b) => b.n - a.n || b.t - a.t);
}

export interface WritingMistake {
  ch: string;
  /** 最近一次寫錯幾筆 */
  strokes: number;
  t: number;
}

/** 最近一次寫的時候有錯的字（再寫一次沒有錯就拿掉），最近寫的在前面 */
export function writingMistakes(writing: WritingStats): WritingMistake[] {
  return Object.entries(writing)
    .filter(([, w]) => w.lastMistakes > 0)
    .map(([ch, w]) => ({ ch, strokes: w.lastMistakes, t: w.t }))
    .sort((a, b) => b.t - a.t);
}

/** 錯題本裡的題數（首頁提示用） */
export function mistakeCount(kana: KanaStats, misses: VocabMisses, cards: Record<string, CardState | undefined>, writing: WritingStats): number {
  return weakKanaKeys(kana).length + vocabMistakes(misses, cards).length + writingMistakes(writing).length;
}
