import type { DeckId, DeckMeta } from '../types';

/**
 * 牌組摘要。首頁和牌組列表只載入這個小檔案，完整單字等進入牌組或複習時才載入。
 * 新增單字時記得更新 count（測試會檢查）。
 */
export const DECK_META: DeckMeta[] = [
  { id: 'n5', title: 'JLPT N5 核心單字', description: '檢定 N5 範圍的常用詞，從招呼語、數字、時間到基本動詞和形容詞。', count: 776 },
  { id: 'n4', title: 'N4 課程單字', description: 'N4 課程（第 33–56 課）每一課的新單字，照課次排：JLPT N4 範圍的常用詞為主，加上課文情境用到的生活、職場用語。', count: 336 },
  { id: 'n4plus', title: 'JLPT N4 補充單字', description: 'JLPT N4 範圍裡、N5 和 N4 課程都沒有教到的常用詞（副詞、動詞、形容詞和各主題的名詞），照詞性和主題排，每張附例句。', count: 369 },
  { id: 'travel', title: '旅遊與日常', description: '點餐、購物、交通、住宿、問路，到日本自助旅行最常用到的詞和句子。', count: 226 },
  { id: 'business', title: '職場與商務', description: '自我介紹、公司用語、電話和會議的基本說法，以及職場最常聽到的客套話。', count: 127 },
  { id: 'anime', title: '日劇・動畫・音樂', description: '追劇和看動畫最常聽到的詞和口頭禪，附上語氣和使用場合。', count: 128 },
  { id: 'course', title: 'N5 課程補充單字', description: 'N5 課程（第 9–32 課）課文裡用到、其他牌組沒有的詞：生活用語、外來語、口語，和一些 N4 程度的常用詞，照課次排。', count: 70 },
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

const DECK_COUNT = new Map<string, number>(DECK_META.map((d) => [d.id, d.count]));
/**
 * 這個版本的網站認得的卡片 id（看字首和編號，不用載入單字資料）。
 * 比較新版的網站匯出的備份可能有這裡還沒有的牌組、卡片：紀錄照樣留著，但不算進錯題數、匯入前的比較。
 */
export function isCardId(id: string): boolean {
  const m = /^([a-z0-9]+)-(\d{4,})$/.exec(id);
  if (!m) return false;
  const n = Number(m[2]);
  return n >= 1 && n <= (DECK_COUNT.get(m[1]) ?? 0);
}

/**
 * 同一個字（假名＋漢字都一樣）出現在好幾個牌組時：後面那幾張卡片 → 最前面那張的 id（牌組順序 n5、旅遊、職場、動畫）。
 * 「全部牌組」把它們當成同一個字（見 lib/vocab.ts 的 deckItemIds），算「還有幾個字沒學」時也要合併。
 * 新增單字時測試會檢查這份清單和單字資料一致（tests/vocab-cards.test.ts）。
 */
export const DUPLICATE_OF: Record<string, string> = {
  'travel-0002': 'n5-0370', 'travel-0006': 'n5-0454', 'travel-0016': 'n5-0366', 'travel-0017': 'n5-0367', 'travel-0019': 'n5-0368',
  'travel-0020': 'n5-0369', 'travel-0024': 'n5-0615', 'travel-0025': 'n5-0556', 'travel-0028': 'n5-0365', 'travel-0031': 'n5-0371',
  'travel-0032': 'n5-0372', 'travel-0052': 'n5-0352', 'travel-0059': 'n5-0281', 'travel-0066': 'n5-0301', 'travel-0068': 'n5-0261',
  'travel-0070': 'n5-0032', 'travel-0080': 'n5-0273', 'travel-0082': 'n5-0009', 'travel-0083': 'n5-0010', 'travel-0084': 'n5-0665',
  'travel-0085': 'n5-0671', 'travel-0097': 'n5-0379', 'travel-0104': 'n5-0259', 'travel-0121': 'n5-0680', 'travel-0122': 'n5-0704',
  'travel-0127': 'n5-0007', 'travel-0134': 'n5-0479', 'travel-0135': 'n5-0480', 'travel-0136': 'n5-0751', 'travel-0137': 'n5-0628',
  'travel-0138': 'n5-0360', 'travel-0140': 'n5-0683', 'travel-0141': 'n5-0687', 'travel-0142': 'n5-0541', 'travel-0143': 'n5-0456',
  'travel-0144': 'n5-0477', 'travel-0146': 'n5-0357', 'travel-0147': 'n5-0356', 'travel-0156': 'n5-0158', 'travel-0157': 'n5-0608',
  'travel-0175': 'n5-0457', 'travel-0176': 'n5-0604', 'travel-0184': 'n5-0344', 'travel-0185': 'n5-0229', 'travel-0187': 'n5-0662',
  'travel-0190': 'n5-0228', 'travel-0194': 'n5-0354', 'travel-0198': 'n5-0658', 'travel-0200': 'n5-0384', 'travel-0202': 'n5-0387',
  'travel-0203': 'n5-0439', 'travel-0204': 'n5-0388', 'travel-0205': 'n5-0676', 'travel-0206': 'n5-0655', 'travel-0207': 'n5-0678',
  'travel-0208': 'n5-0409', 'travel-0209': 'n5-0416', 'travel-0210': 'n5-0611', 'travel-0211': 'n5-0570', 'travel-0212': 'n5-0617', 'travel-0219': 'n5-0458',
  'travel-0220': 'n5-0776', 'travel-0225': 'n5-0274', 'travel-0226': 'n5-0358', 'business-0001': 'n5-0011', 'business-0014': 'n5-0342',
  'business-0015': 'n5-0197', 'business-0030': 'n5-0213', 'business-0031': 'n5-0620', 'business-0039': 'n5-0332', 'business-0041': 'n5-0448',
  'business-0046': 'n5-0325', 'business-0068': 'n5-0026', 'business-0100': 'n5-0018', 'anime-0005': 'n5-0774', 'anime-0017': 'n5-0732',
  'anime-0019': 'n5-0673', 'anime-0021': 'n5-0664', 'anime-0024': 'n5-0681', 'anime-0031': 'n5-0717', 'anime-0032': 'n5-0719',
  'anime-0033': 'n5-0718', 'anime-0034': 'n5-0722', 'anime-0036': 'n5-0721', 'anime-0042': 'n5-0008', 'anime-0043': 'n5-0016',
  'anime-0045': 'n5-0014', 'anime-0046': 'n5-0015', 'anime-0048': 'n5-0030', 'anime-0054': 'business-0028', 'anime-0056': 'n5-0190',
  'anime-0057': 'n5-0203', 'anime-0059': 'n5-0204', 'anime-0060': 'business-0086', 'anime-0061': 'n5-0207', 'anime-0062': 'n5-0209',
  'anime-0067': 'n5-0210', 'anime-0069': 'n5-0200', 'anime-0073': 'n5-0189', 'anime-0097': 'n5-0462', 'anime-0098': 'n5-0547',
  'anime-0101': 'n5-0226', 'anime-0104': 'n5-0390', 'anime-0127': 'n5-0358',
};

let groupsCache: string[][] | null = null;
/** 每個字（同一個字在好幾個牌組只算一次）的所有卡片 id */
export function wordGroups(): string[][] {
  if (!groupsCache) {
    const groups = new Map<string, string[]>();
    for (const d of DECK_META) {
      for (const id of metaItemIds(d)) {
        const head = DUPLICATE_OF[id] ?? id;
        const g = groups.get(head);
        if (g) g.push(id);
        else groups.set(head, [id]);
      }
    }
    groupsCache = [...groups.values()];
  }
  return groupsCache;
}

let groupOfCache: Map<string, string[]> | null = null;
/** 這張卡片所屬的字的所有卡片 id（包含自己） */
export function wordGroupOf(id: string): string[] {
  if (!groupOfCache) {
    groupOfCache = new Map();
    for (const g of wordGroups()) for (const x of g) groupOfCache.set(x, g);
  }
  return groupOfCache.get(id) ?? [id];
}

/** 這張卡片還沒學，但同一個字已經在別的牌組學過 */
export function learnedInOtherDeck(cards: Record<string, { reps: number } | undefined>, id: string): boolean {
  if ((cards[id]?.reps ?? 0) > 0) return false;
  return wordGroupOf(id).some((x) => x !== id && (cards[x]?.reps ?? 0) > 0);
}

/**
 * 這個字學過了：這張卡片學過，或同一個字在別的牌組學過（那就不會再當新卡出現）。
 * 「還有幾個沒學」「已經學過幾個」要用這個算，數字才和實際出的新卡一致。
 */
export function wordLearned(cards: Record<string, { reps: number } | undefined>, id: string): boolean {
  return (cards[id]?.reps ?? 0) > 0 || learnedInOtherDeck(cards, id);
}

/** 還沒學過的字有幾個：同一個字在好幾個牌組只算一次，任何一張學過就不算 */
export function unseenWords(cards: Record<string, { reps: number } | undefined>): number {
  return wordGroups().filter((g) => g.every((id) => !cards[id] || cards[id]!.reps === 0)).length;
}
