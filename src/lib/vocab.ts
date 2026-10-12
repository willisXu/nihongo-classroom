import type { Pos, VocabItem } from '../data/types';
import { DECKS } from '../data/vocab';

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

/** 卡片正面顯示的寫法：有漢字用漢字 */
export function displayForm(item: VocabItem): string {
  return item.kanji ?? item.kana;
}

/**
 * 單字要念的文字：一律念假名。
 * 同一個漢字常有好幾種念法（四＝よん／し、一日＝いちにち／ついたち），
 * 單獨把漢字丟給語音引擎，念出來的不一定是這張卡要教的讀音。
 * 「〜にん」這類接尾詞的「〜」不念。
 */
export function speechText(item: Pick<VocabItem, 'kana'>): string {
  return item.kana.replace(/[〜～]/g, '').trim();
}

/**
 * 'all' 或牌組代號 → 卡片 id 清單。
 * 「全部牌組」裡，同一個字（假名＋漢字相同）出現在好幾個牌組時只留第一張，不會同一個字複習兩次。
 */
export function deckItemIds(deckId: string): string[] {
  if (deckId === 'all') {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const d of DECKS) {
      for (const it of d.items) {
        const key = `${it.kana}|${it.kanji ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        ids.push(it.id);
      }
    }
    return ids;
  }
  return DECKS.find((d) => d.id === deckId)?.items.map((i) => i.id) ?? [];
}

export function deckTitle(deckId: string): string {
  if (deckId === 'all') return '全部牌組';
  return DECKS.find((d) => d.id === deckId)?.title ?? '牌組';
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
