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
  /** 片假名另外的提示（和平假名說法不同時才填，例如 ヲ） */
  tipK?: string;
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

/* ---------------- N5 課程（第 9 課起）的區塊 ---------------- */

/**
 * 日文句子：漢字後面用《》標讀音，例如「私《わたし》は台湾人《たいわんじん》です。」（格式見 lib/ja.ts）。
 * 課文裡的漢字一律標讀音，測試會檢查。
 */
export type JaText = string;

/** 例句 */
export interface Example {
  ja: JaText;
  zh: string;
  /** 語音要念的文字：漢字容易念錯時才填（沒填時見 lib/ja.ts 的 jaSpeech） */
  say?: string;
  /** 補充說明 */
  note?: Inline;
}

/** 會話的一句 */
export interface DialogLine {
  /** 說話的人（中文或日文名字） */
  who: string;
  ja: JaText;
  zh: string;
  say?: string;
}

/** 這一課的單字 */
export interface VocabEntry {
  /** 寫法和讀音，例如 '学生《がくせい》'、'コーヒー' */
  ja: JaText;
  zh: string;
  /**
   * 對應的單字卡（例如 n5-0123）：課程頁的「用單字卡練這一課的單字」會出這些卡。
   * 測試檢查卡片的讀音、寫法和這裡一樣。
   */
  id?: string;
  /** 用法提醒，例如「接在別人的姓後面」（可以用 [[ ]]、{{ }} 寫日文） */
  note?: Inline;
  /** 要念的文字（很少用；沒填時見 components/CourseBlocks.tsx 的 wordSay） */
  say?: string;
}

/**
 * N5 的一個漢字（data/kanji.ts）：課文的漢字區塊、手寫描字頁都從這裡取讀音和意思。
 * 讀音只列 N5 用得到的（不是字典上全部的念法）。
 */
export interface KanjiInfo {
  /** 日本的寫法 */
  ch: string;
  /** 台灣的寫法（和日本不同時才填），例如 学 → 學 */
  tc?: string;
  /** 中文意思 */
  zh: string;
  /** 音讀（片假名） */
  on: string[];
  /** 訓讀（平假名；送假名用「・」分開，例如 た・べる） */
  kun: string[];
}

/** 這一課的漢字（讀音和意思在 data/kanji.ts） */
export interface KanjiEntry {
  ch: string;
  /** 用到這個字的詞 */
  words: { ja: JaText; zh: string }[];
  /** 提醒（字形和中文不同、意思不同等） */
  note?: Inline;
}

/** 練習題 */
export type DrillItem =
  /**
   * 選擇題：ja 是題目句（要填的地方寫成 ＿＿），options 是選項；q 是中文的題目說明（沒有 ja 時必填）。
   * zh：題目句的中文意思。why：答完之後顯示的說明。
   */
  | { kind: 'choice'; q?: Inline; ja?: JaText; zh?: string; options: JaText[]; answer: number; why?: Inline }
  /**
   * 排列句子：tiles 照正確的順序寫，畫面上會打亂；zh 是句子的中文意思。
   * also：別的也自然的順序（同樣的詞塊換個順序，例如時間和地點對調），排成這些也算對。
   */
  | { kind: 'order'; zh: string; tiles: JaText[]; also?: JaText[][]; why?: Inline }
  /** 聽力：念 ja（不顯示），選出中文意思；答完才顯示句子 */
  | { kind: 'listen'; ja: JaText; say?: string; options: string[]; answer: number; why?: Inline };

export type DrillKind = DrillItem['kind'];

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
  /** labels：兩欄的說明（沒填時是「筆畫分開／常連成一筆」，只適合 き さ そ り 這種會連筆的字） */
  | { type: 'fontcompare'; chars: string; caption?: Inline; labels?: [string, string] }
  /** 小表格（格子裡的日文用 [[ ]] 或 {{ }} 包起來，可以標讀音） */
  | { type: 'table'; head: string[]; rows: Inline[][] }
  /* ----- 以下是 N5 課程用的區塊 ----- */
  /** 會話：scene 是情境說明 */
  | { type: 'dialog'; title?: string; scene?: Inline; lines: DialogLine[] }
  /** 文法：form 是句型（〔名詞〕是空格），points 是說明，examples 是例句 */
  | { type: 'grammar'; title: string; form: JaText; points: Inline[]; examples: Example[] }
  /** 例句 */
  | { type: 'examples'; title?: string; items: Example[] }
  /** 這一課的單字 */
  | { type: 'vocab'; title?: string; items: VocabEntry[]; note?: Inline }
  /** 這一課的漢字 */
  | { type: 'kanji'; items: KanjiEntry[] }
  /** 練習題 */
  | { type: 'drill'; title?: string; intro?: Inline; items: DrillItem[] };

export interface LessonSection {
  id: string;
  title: string;
  blocks: LessonBlock[];
}

interface LessonBase {
  id: number;
  /** 短標題，例如「た行・な行」「はじめまして」 */
  title: string;
  /** 頁面大標 */
  headline: string;
  /** 導言 */
  summary: string;
  minutes: number;
  sections: LessonSection[];
  homework: Inline[];
  /** 下一課預告 */
  next?: Inline;
}

/** 五十音課程（第 1–8 課） */
export interface KanaLesson extends LessonBase {
  kind: 'kana';
  /**
   * 這一課新學的字元（含小字、長音符號）。
   * 課程裡 words / pairs 的 ja 只能用「到這一課為止學過的字元」，測試會檢查。
   */
  newKana: string[];
  /** 這一課練習頁的出題範圍 */
  quiz: { script: Script; rows: string[] };
}

/** N5 課程（第 9 課起） */
export interface CourseLesson extends LessonBase {
  kind: 'n5';
  /** 第幾單元（課程列表照單元分組，見 lessons/meta.ts 的 UNITS） */
  unit: number;
  /** 學完能做到的事（Can-do） */
  goals: Inline[];
  /** 這一課的文法重點（短的句型名稱，例如「〜は〜です」）：課程列表、AI 家教用 */
  grammar: string[];
  /** 這一課新教的漢字（測試檢查和課文的漢字區塊一樣） */
  kanji: string;
  /** 這一課的單字卡 id（測試檢查和課文的單字區塊一樣） */
  words: string[];
  /** 搭配的 AI 家教情境（data/scenarios.ts 的 id） */
  tutor?: string;
  /** 可以搭配的教材（例如「《いろどり》入門 第 3 課」），列在作業後面 */
  companion?: Inline[];
}

export type Lesson = KanaLesson | CourseLesson;

/** 一課的摘要：列表頁、首頁和練習頁只需要這些欄位 */
export type KanaLessonMeta = Pick<KanaLesson, 'kind' | 'id' | 'title' | 'headline' | 'minutes' | 'newKana' | 'quiz'>;
export type CourseLessonMeta = Pick<CourseLesson, 'kind' | 'id' | 'title' | 'headline' | 'minutes' | 'unit' | 'grammar' | 'kanji' | 'words' | 'tutor'>;
export type LessonMeta = KanaLessonMeta | CourseLessonMeta;

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
  /**
   * 要念的寫法（很少用）：只有假名時語音容易念錯才填。例如 はち 有些語音會把 は 當助詞念成 wa，改念 八。
   * 沒填就念 kana（見 lib/vocab.ts 的 speechText）。
   */
  say?: string;
  /**
   * 例句：ja 可含漢字，kana 為全假名讀音，zh 為中文翻譯。
   * say：漢字有好幾種念法、語音容易念錯時才填（例如 辛い 可能念成 つらい），播放例句時念這個。
   */
  ex?: { ja: string; kana: string; zh: string; say?: string };
  /** 用法提醒（繁體中文），例如「口語」「對上司用」 */
  note?: string;
  /** 主題分類，例如「餐廳」「交通」 */
  topic?: string;
}

export type DeckId = 'n5' | 'travel' | 'business' | 'anime' | 'course';

export interface Deck {
  id: DeckId;
  title: string;
  description: string;
  items: VocabItem[];
}

/** 牌組摘要：首頁和牌組列表只需要這些，不用載入全部單字 */
export interface DeckMeta {
  id: DeckId;
  title: string;
  description: string;
  /** 單字數；卡片 id 依序是 n5-0001、n5-0002…，測試會檢查和實際資料一致 */
  count: number;
}
