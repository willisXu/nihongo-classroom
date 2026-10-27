import type { VocabItem } from '../data/types';
import { DECKS, vocabById } from '../data/vocab';
import { learnedInOtherDeck, wordLearned } from '../data/vocab/meta';
import { courseLessonById } from '../data/lessons/meta';

// 只看一張卡片的函式（顯示、念法、搜尋）在 vocabItem.ts；從這裡 import 的地方照舊可以用
export * from './vocabItem';

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
 * 'all'、牌組代號或 lesson-N（初級課程某一課的單字）→ 卡片 id 清單。
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
    // 每個字留在清單裡的第一張卡（課程的字換成留下的那張用）
    const firstOfKey = new Map<string, string>();
    for (const d of DECKS) {
      for (const it of d.items) {
        const key = keyOf(it);
        if (!started(it)) {
          if (learnedKeys.has(key) || freshKeys.has(key)) continue;
          freshKeys.add(key);
        }
        ids.push(it.id);
        if (!firstOfKey.has(key)) firstOfKey.set(key, it.id);
      }
    }
    // 課程的字如果在別的牌組也有、這裡留的是別張：換成留下的那張
    // （用 Set、Map 查，不在清單裡逐一找：學過很多張、上了很多課時，每次開複習頁都要算）
    const inIds = new Set(ids);
    const sameWord = (id: string) => {
      const it = vocabById(id);
      if (!it || inIds.has(id)) return id;
      return firstOfKey.get(keyOf(it)) ?? id;
    };
    return courseFirst(ids, priority.map(sameWord));
  }
  const deck = DECKS.find((d) => d.id === deckId);
  return deck ? courseFirst(deck.items.filter((it) => !learnedInOtherDeck(cards, it.id)).map((it) => it.id), priority) : [];
}

/**
 * 這個牌組（或某一課）的字都學過了嗎：在別的牌組學過的同一個字也算（不會再當新卡）。
 * 找不到這個牌組、或裡面沒有字時是 false（複習頁照一般的說法）。
 */
export function deckAllLearned(deckId: string, cards: Record<string, { reps: number } | undefined>): boolean {
  const lessonId = lessonDeckId(deckId);
  const ids =
    lessonId !== null
      ? (courseLessonById(lessonId)?.words ?? []).filter((id) => vocabById(id))
      : deckId === 'all'
        ? DECKS.flatMap((d) => d.items.map((it) => it.id))
        : (DECKS.find((d) => d.id === deckId)?.items.map((it) => it.id) ?? []);
  return ids.length > 0 && ids.every((id) => wordLearned(cards, id));
}

export function deckTitle(deckId: string): string {
  const lessonId = lessonDeckId(deckId);
  if (lessonId !== null) return `第 ${lessonId} 課的單字`;
  if (deckId === 'all') return '全部牌組';
  return DECKS.find((d) => d.id === deckId)?.title ?? '牌組';
}
