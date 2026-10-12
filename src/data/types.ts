/** 'h' = 平假名，'k' = 片假名 */
export type Script = 'h' | 'k';

/** 一個假名格子：同時記錄平假名與片假名 */
export interface KanaCell {
  h: string;
  k: string;
  /** 羅馬拼音（平文式） */
  r: string;
  /** 最接近的注音（沒有對應時留空） */
  zy?: string;
  /** 平假名字源（日本字形），hoTc 為台灣字形（不同時才填） */
  ho?: string;
  hoTc?: string;
  /** 片假名字源，null 表示來源有多種說法 */
  ko?: string | null;
  koTc?: string;
  /** 發音提示（繁體中文） */
  tip?: string;
  /** 平假名例字 [假名, 中文]（羅馬拼音由程式產生） */
  ex?: [string, string];
  /** 片假名例字 [假名, 中文] */
  kx?: [string, string] | null;
}

export interface KanaRow {
  /** 行代號：a k s t n h m y r w nn / g z d b p */
  id: string;
  /** 平假名行名，例如「か行」 */
  label: string;
  /** 片假名行名，例如「カ行」 */
  kLabel: string;
  /** 依 a i u e o 排列，空位為 null */
  cells: (KanaCell | null)[];
  /** 整行的發音提示（濁音行用） */
  tip?: string;
}

/**
 * 課程內文的迷你標記：
 *   **粗體**
 *   [[かな]]          可點擊發音的日文
 *   [[表記|よみ]]     顯示表記、念讀音（例如 [[私|わたし]]）
 *   {{かな}}          日文字（不發音，只套日文字型）
 *   [文字](/路徑)      站內連結，例如 [練習](/practice)
 */
export type Inline = string;

/** 課程裡的一個練習詞 */
export interface LessonWord {
  /** 顯示用寫法（課程詞一律用已學過的假名） */
  ja: string;
  /** 對應漢字寫法（選填，只作參考） */
  kanji?: string;
  /** 羅馬拼音；省略時由程式從 ja 自動產生 */
  r?: string;
  /** 中文意思 */
  zh: string;
  note?: string;
}

export interface SentenceSegment {
  text: string;
  ruby?: string;
  kind: 'kanji' | 'hira' | 'kata' | 'plain';
}

export type LessonBlock =
  /** 一段說明文字 */
  | { type: 'p'; text: Inline }
  /** 假名練習格（含逐字說明），rows 為行代號 */
  | { type: 'kana'; rows: string[]; script: Script; title?: string }
  /** 提醒框：label 是紅色印章文字，例如「注意」「發音」 */
  | { type: 'callout'; label: string; items: Inline[] }
  /**
   * 可點擊發音的單字卡片。
   * variant 'loan'：先顯示中文（台灣常見的日語借詞用）。
   * free：不檢查是否只用已學過的假名（示範用，例如第 1 課的借詞）。
   * maskable：提供「遮住拼音」開關。
   */
  | { type: 'words'; title?: string; items: LessonWord[]; note?: Inline; maskable?: boolean; variant?: 'loan'; free?: boolean }
  /** 對照組（長短音、清濁音等），左右兩個詞 */
  | { type: 'pairs'; title?: string; items: { a: LessonWord; b: LessonWord; note?: Inline }[] }
  /** 標示文字種類的例句 */
  | { type: 'sentence'; segments: SentenceSegment[]; say: string; romaji: string; zh: string }
  /** 三種文字的介紹卡（第 1 課專用） */
  | { type: 'scripts' }
  /** 手寫與電腦字型對照 */
  | { type: 'fontcompare'; chars: string; caption?: Inline }
  /** 小表格 */
  | { type: 'table'; head: string[]; rows: Inline[][] };

export interface LessonSection {
  id: string;
  title: string;
  blocks: LessonBlock[];
}

export interface Lesson {
  id: number;
  /** 短標題，例如「た行・な行」 */
  title: string;
  /** 頁面大標 */
  headline: string;
  /** 導言 */
  summary: string;
  minutes: number;
  /**
   * 這一課新學的字元（含小字、長音符號）。
   * 課程裡 words / pairs 的 ja 只能用「到這一課為止學過的字元」，測試會檢查。
   */
  newKana: string[];
  /** 這一課練習頁的出題範圍 */
  quiz: { script: Script; rows: string[] };
  sections: LessonSection[];
  homework: Inline[];
  /** 下一課預告 */
  next?: Inline;
}

/* ---------------- 單字 ---------------- */

export type Pos =
  | 'noun'
  | 'verb'
  | 'i-adj'
  | 'na-adj'
  | 'adverb'
  | 'expression'
  | 'number'
  | 'pronoun'
  | 'counter'
  | 'particle'
  | 'conjunction'
  | 'interjection'
  | 'prefix'
  | 'suffix';

export interface VocabItem {
  /** 全部牌組唯一，例如 n5-0001、travel-0001 */
  id: string;
  /** 讀音（平假名；外來語用片假名） */
  kana: string;
  /** 常見漢字寫法（只有平時用漢字寫的詞才填） */
  kanji?: string;
  /** 繁體中文意思（台灣用語） */
  zh: string;
  pos: Pos;
  /** 動詞分類：1 = 五段，2 = 一段，3 = する・くる */
  verbGroup?: 1 | 2 | 3;
  /** 例句：ja 可含漢字，kana 為全假名讀音，zh 為中文翻譯 */
  ex?: { ja: string; kana: string; zh: string };
  /** 用法提醒（繁體中文），例如「口語」「對上司用」 */
  note?: string;
  /** 主題分類，例如「餐廳」「交通」 */
  topic?: string;
}

export type DeckId = 'n5' | 'travel' | 'business' | 'anime';

export interface Deck {
  id: DeckId;
  title: string;
  description: string;
  items: VocabItem[];
}
