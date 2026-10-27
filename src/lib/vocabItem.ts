/**
 * 單字卡的顯示、念法、搜尋：只看一張卡片本身的資料，不需要整份單字資料（data/vocab）。
 * 牌組頁只載入那一副牌組（data/vocab/load.ts），用這裡的函式就好；要找別的牌組、算「全部牌組」的在 lib/vocab.ts。
 */
import type { Pos, VocabItem } from '../data/types';
import { conjugate } from './verbs';
import { romaji, toHiragana } from './romaji';

export const POS_LABEL: Record<Pos, string> = {
  noun: '名詞',
  verb: '動詞',
  'i-adj': 'い形容詞',
  'na-adj': 'な形容詞',
  adverb: '副詞',
  expression: '句子',
  number: '數字',
  pronoun: '代名詞',
  counter: '量詞',
  particle: '助詞',
  conjunction: '連接詞',
  interjection: '感嘆詞',
  prefix: '接頭詞',
  suffix: '接尾詞',
};

export const VERB_GROUP_LABEL: Record<1 | 2 | 3, string> = {
  1: '第一類（五段）',
  2: '第二類（一段）',
  3: '第三類（する・くる）',
};

/** 動詞的ます形（課程第 13–24 課都用ます形；單字卡存辭書形） */
export function masuForm(item: Pick<VocabItem, 'pos' | 'verbGroup' | 'kana' | 'kanji'>): string | null {
  if (item.pos !== 'verb' || !item.verbGroup) return null;
  try {
    return conjugate(item.kanji ?? item.kana, item.verbGroup, 'masu');
  } catch {
    return null;
  }
}

/** 卡片上的羅馬拼音：有助詞 は、へ 的說法和句子在資料裡寫好了（は 念 wa），其他從假名產生 */
export function romajiOf(item: Pick<VocabItem, 'kana' | 'r'>): string {
  return item.r ?? romaji(item.kana);
}

const PLAIN: Record<string, string> = { ā: 'a', ī: 'i', ū: 'u', ē: 'e', ō: 'o' };
/** 搜尋用的拼音寫法：kōhī、kohi、koohii 都算；句子不分詞也找得到（toire wa → toirewa） */
function romajiKeys(r: string): string[] {
  const lower = r.toLowerCase();
  const short = lower.replace(/[āīūēō]/g, (c) => PLAIN[c]);
  const long = lower.replace(/[āīūēō]/g, (c) => PLAIN[c] + PLAIN[c]);
  return [lower, short, long, short.replace(/[' -]/g, '')];
}

/**
 * 牌組頁搜尋：每個單字可以被搜尋到的文字（假名、漢字、中文、各種拼音；拼音也收自動產生的，
 * 照輸入法打 konnichiha 也找得到）。片假名一律轉成平假名，和 vocabSearchQuery 一起用：こーひー 也找得到 コーヒー。
 */
export function vocabSearchText(it: VocabItem): string {
  const keys = romajiKeys(romaji(it.kana));
  if (it.r) keys.push(...romajiKeys(it.r));
  return toHiragana([it.kana, it.kanji ?? '', it.zh.toLowerCase(), ...keys].join('\n'));
}

/** 搜尋的關鍵字：去掉前後空白、英文小寫、片假名轉平假名（和 vocabSearchText 一致） */
export function vocabSearchQuery(q: string): string {
  return toHiragana(q.trim().toLowerCase());
}

/**
 * 單字要念的文字：一律念假名。
 * 同一個漢字常有好幾種念法（四＝よん／し、一日＝いちにち／ついたち），
 * 單獨把漢字丟給語音引擎，念出來的不一定是這張卡要教的讀音。
 * 「〜にん」這類接尾詞的「〜」不念。
 */
export function speechText(item: Pick<VocabItem, 'kana' | 'say'>): string {
  return item.say ?? item.kana.replace(/[〜～]/g, '').trim();
}

/** 例句要念的文字：有指定念法（漢字容易念錯）就念那個 */
export function exampleSpeech(ex: NonNullable<VocabItem['ex']>): string {
  return ex.say ?? ex.ja;
}

/** 依主題分組，保持原本順序 */
export function groupByTopic(items: VocabItem[]): { topic: string; items: VocabItem[] }[] {
  const map = new Map<string, VocabItem[]>();
  for (const it of items) {
    const t = it.topic ?? '其他';
    if (!map.has(t)) map.set(t, []);
    map.get(t)!.push(it);
  }
  return [...map.entries()].map(([topic, list]) => ({ topic, items: list }));
}
