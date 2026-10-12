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

/** 'all' 或牌組代號 → 卡片 id 清單 */
export function deckItemIds(deckId: string): string[] {
  if (deckId === 'all') return DECKS.flatMap((d) => d.items.map((i) => i.id));
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
