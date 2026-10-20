import type { Pos, VocabItem } from '../data/types';
import { DECKS, vocabById } from '../data/vocab';
import { learnedInOtherDeck } from '../data/vocab/meta';
import { courseLessonById } from '../data/lessons/meta';
import { conjugate } from './verbs';

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
export function speechText(item: Pick<VocabItem, 'kana' | 'say'>): string {
  return item.say ?? item.kana.replace(/[〜～]/g, '').trim();
}

/** 例句要念的文字：有指定念法（漢字容易念錯）就念那個 */
export function exampleSpeech(ex: NonNullable<VocabItem['ex']>): string {
  return ex.say ?? ex.ja;
}

/** 課程單字的「牌組」代號：lesson-9 → 9（不是的話 null） */
export function lessonDeckId(deckId: string): number | null {
  const m = /^lesson-(\d+)$/.exec(deckId);
  return m ? Number(m[1]) : null;
}

/**
 * 新卡的順序：先學課程教過的字（priority，照課的順序），其他的照牌組原本的順序。
 * 已經學過的卡不受影響（複習照到期時間排）。
 */
export function courseFirst(ids: string[], priority: string[]): string[] {
  if (!priority.length) return ids;
  const inDeck = new Set(ids);
  const first = [...new Set(priority)].filter((id) => inDeck.has(id));
  const firstSet = new Set(first);
  return [...first, ...ids.filter((id) => !firstSet.has(id))];
}

/**
 * 'all'、牌組代號或 lesson-N（N5 課程某一課的單字）→ 卡片 id 清單。
 * priority：課程教過的字，排在新卡的最前面（見 courseFirst）。
 * 「全部牌組」裡，同一個字（假名＋漢字相同）出現在好幾個牌組時：學過的卡片照常複習（各自有排程，
 * 到期數才對得上）；還沒學過的只留一張當新卡，而且已經在別的牌組學過的字不再當新卡出現。
 * 單一牌組也一樣：已經在別的牌組學過的字不再當新卡（例如學完 N5 再背旅遊牌組，不會重教 63 個字）。
 */
export function deckItemIds(deckId: string, cards: Record<string, { reps: number } | undefined> = {}, priority: string[] = []): string[] {
  const lessonId = lessonDeckId(deckId);
  if (lessonId !== null) {
    const words = courseLessonById(lessonId)?.words ?? [];
    return words.filter((id) => vocabById(id) && !learnedInOtherDeck(cards, id));
  }
  if (deckId === 'all') {
    const keyOf = (it: VocabItem) => `${it.kana}|${it.kanji ?? ''}`;
    const started = (it: VocabItem) => (cards[it.id]?.reps ?? 0) > 0;
    const learnedKeys = new Set(DECKS.flatMap((d) => d.items.filter(started).map(keyOf)));
    const freshKeys = new Set<string>();
    const ids: string[] = [];
    for (const d of DECKS) {
      for (const it of d.items) {
        if (started(it)) {
          ids.push(it.id);
          continue;
        }
        const key = keyOf(it);
        if (learnedKeys.has(key) || freshKeys.has(key)) continue;
        freshKeys.add(key);
        ids.push(it.id);
      }
    }
    // 課程的字如果在別的牌組也有、這裡留的是別張：換成留下的那張
    return courseFirst(ids, priority.map((id) => sameWordIn(ids, id)));
  }
  const deck = DECKS.find((d) => d.id === deckId);
  return deck ? courseFirst(deck.items.filter((it) => !learnedInOtherDeck(cards, it.id)).map((it) => it.id), priority) : [];
}

/** 同一個字在 ids 裡的那張卡（全部牌組裡同一個字只留一張新卡） */
function sameWordIn(ids: string[], id: string): string {
  const it = vocabById(id);
  if (!it || ids.includes(id)) return id;
  const key = `${it.kana}|${it.kanji ?? ''}`;
  return ids.find((x) => {
    const o = vocabById(x);
    return o && `${o.kana}|${o.kanji ?? ''}` === key;
  }) ?? id;
}

export function deckTitle(deckId: string): string {
  const lessonId = lessonDeckId(deckId);
  if (lessonId !== null) return `第 ${lessonId} 課的單字`;
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
