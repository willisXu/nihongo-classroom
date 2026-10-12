import type { DeckId, DeckMeta } from '../types';

/**
 * 牌組摘要。首頁和牌組列表只載入這個小檔案，完整單字等進入牌組或複習時才載入。
 * 新增單字時記得更新 count（測試會檢查）。
 */
export const DECK_META: DeckMeta[] = [
  { id: 'n5', title: 'JLPT N5 核心單字', description: '檢定 N5 範圍的常用詞，從招呼語、數字、時間到基本動詞和形容詞。', count: 776 },
  { id: 'travel', title: '旅遊與日常', description: '點餐、購物、交通、住宿、問路，到日本自助旅行最常用到的詞和句子。', count: 226 },
  { id: 'business', title: '職場與商務', description: '自我介紹、公司用語、電話和會議的基本說法，以及職場最常聽到的客套話。', count: 127 },
  { id: 'anime', title: '日劇・動畫・音樂', description: '追劇和看動畫最常聽到的詞和口頭禪，附上語氣和使用場合。', count: 128 },
];

/** 牌組檔案用：牌組的代號、名稱和說明（不重複寫在兩個地方） */
export function deckHead(id: DeckId): Omit<DeckMeta, 'count'> {
  const m = DECK_META.find((d) => d.id === id);
  if (!m) throw new Error(`找不到牌組 ${id}`);
  return { id: m.id, title: m.title, description: m.description };
}

/** 牌組裡所有卡片的 id（依序編號），不用載入單字資料就能算複習進度 */
export function metaItemIds(m: DeckMeta): string[] {
  return Array.from({ length: m.count }, (_, i) => `${m.id}-${String(i + 1).padStart(4, '0')}`);
}
