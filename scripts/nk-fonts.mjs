/**
 * 字型瘦身（Vite 外掛）
 *
 * 標題用的霞鶩文楷（LXGW WenKai TC Bold）和假名用的 Klee One SemiBold 都是好幾 MB 的中日文字型。
 * 這個外掛在建置時，從完整字型檔（@expo-google-fonts 套件裡的 TTF）裁出網站用得到的字，
 * 再依「哪一頁會用到」分成很多小檔，配合 unicode-range，瀏覽器只下載這一頁需要的那幾個檔：
 *
 *   1. 收字（collectChars）：標題字型收畫面程式（.tsx）裡的字和資料的標題欄位；假名字型收日文片段；
 *      單字卡背面的中文解釋另外一套（NK Meaning）。英數、標點、假名整段都收，動態的數字和假名不會缺字。
 *   2. 分組（groupChars）：英數、假名照碼位分成幾組（BASE_GROUPS）；其他的字跟著用到它的檔案走——
 *      很多頁都有的字放「常用」一組（56 課的課文算同一頁），好幾課都有的字放「課文共用」組
 *      （照第一次出現的課排），其餘放到字最少的那個檔的組裡，照在檔案裡出現的順序排
 *      （同一課、同一段的字放在一起）。標題字型另外分辨哪些字真的出現在標題裡（displayHotChars：
 *      從 CSS 找出用標題字型的元素，再到 .tsx 裡找這些元素包住的文字，加上資料的標題欄位）；
 *      只是收著備用、畫面上其實用內文字型的字，放在「其餘」的組（檔名 display-rest-…），平常不會下載，
 *      離線版也不預先下載。
 *   3. 每組裁成一個 woff2，產生 src/fonts/generated/nk-fonts.css（不進版控）。
 *
 * 標題文字如果來自 .tsx 裡的陣列，請用 title: '…' 欄位（DISPLAY_FIELDS），字才會分到那一頁的組。
 * 分錯組不會缺字，只是那一頁要多下載一個檔。
 * AI 家教回覆裡出現的其他漢字，會往下用完整的 Klee One（tokens.css 的字型順序，Tutor 頁才載入）。
 * 同樣的字、字型和裁字工具版本，裁過的結果沿用快取（node_modules/.cache/nk-fonts）。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'src/fonts/generated');
const CACHE_DIR = join(ROOT, 'node_modules/.cache/nk-fonts');
const CACHE_VERSION = 'v2';

/**
 * core：幾頁都有的字算「常用」（課文 56 個檔算同一頁，見 pageOf）；chunk：每個檔最多幾個字。
 * lessonCore：不算常用、但好幾課都有的字，放進「課文共用」組（照第一次出現的課排，lessonChunk 個字一個檔）。
 * 這幾個數字是實際量過各頁的下載量後選的（常用組太大，每一頁都要多下載；太小，檔案數變多）。
 * NK Meaning 只在單字卡背面用，照牌組分，不設常用組。
 */
export const FAMILIES = [
  { family: 'NK Display', pkg: '@expo-google-fonts/lxgw-wenkai-tc', file: '700Bold/LXGWWenKaiTC_700Bold.ttf', weight: 700, prefix: 'display', chars: 'display', base: 'split', core: 5, chunk: 24, lessonCore: 5, lessonChunk: 60 },
  { family: 'NK Kana', pkg: '@expo-google-fonts/klee-one', file: '600SemiBold/KleeOne_600SemiBold.ttf', weight: 600, prefix: 'kana', chars: 'ja', base: 'whole', core: 8, chunk: 24, lessonCore: 5, lessonChunk: 60 },
  { family: 'NK Meaning', pkg: '@expo-google-fonts/lxgw-wenkai-tc', file: '700Bold/LXGWWenKaiTC_700Bold.ttf', weight: 700, prefix: 'meaning', chars: 'meaning', base: 'split', core: Infinity, chunk: 40 },
];

/**
 * 只留橫排文字會用到的 OpenType 功能。網站沒有直排，也沒有用 font-feature-settings；
 * Klee One 的 jp78、trad、aalt 這些異體字功能會把每個漢字的異體一起拉進來，檔案大好幾倍。
 */
const KEEP_FEATURES = ['ccmp', 'locl', 'liga', 'calt', 'kern'];

/** 資料檔裡會用標題字型顯示的欄位（h1–h3 標題、牌組主題、五十音表的字源）；課文提醒框的印章另外找（lessonBlocks） */
const DISPLAY_FIELDS = /\b(?:title|headline|topic|ho|ko): '([^']*)'/g;
/** 每一頁都會顯示的元件：它的標題字一律放進常用組 */
const EVERYWHERE = ['components/Layout.tsx'];

const isKana = (cp) => cp >= 0x3040 && cp <= 0x30ff;
/** 日文會出現的字：假名、漢字、々、〆 */
const isJa = (cp) => isKana(cp) || (cp >= 0x3400 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff) || cp === 0x3005 || cp === 0x3006;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return p === OUT_DIR ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

/**
 * 每個物件常值（{…}）第一層的文字：裡面的 {…}、[…] 拿掉，字串整段保留（字串裡的括號不算）。
 * 給課文資料用，例如 { type: 'callout', label: '注意', items: [...] } → " type: 'callout', label: '注意', items: , "
 */
export function objectTops(text) {
  const out = [];
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const frame = stack[stack.length - 1];
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
      if (frame) frame.top += text.slice(i, j + 1);
      i = j;
    } else if (c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      if (nl < 0) break;
      i = nl - 1; // 換行照常算進文字
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1;
      if (i <= 0) break;
    } else if (c === '{' || c === '[') stack.push({ open: c, top: '' });
    else if (c === '}' || c === ']') {
      const done = stack.pop();
      if (done?.open === '{') out.push(done.top);
    } else if (frame) frame.top += c;
  }
  return out;
}

/** 課程摘要（課名、文法名稱…，課程列表和首頁用） */
const isLessonMeta = (file) => /(^|[\\/])data[\\/]lessons[\\/]meta\.ts$/.test(file);

/** 課文資料（data/lessons）裡每個區塊第一層的文字；其他檔沒有 */
const lessonBlocks = (file, text) => (/(^|[\\/])data[\\/]lessons[\\/]/.test(file) ? objectTops(text) : []);
const fieldOf = (top, name) => new RegExp(`\\b${name}: '([^']*)'`).exec(top)?.[1] ?? '';

/** 資料檔裡用標題字型顯示的文字：標題欄位，加上課文提醒框的印章文字（callout 的 label，例如「注意」「技巧」） */
function displayFieldText(file, text) {
  let out = '';
  for (const m of text.matchAll(DISPLAY_FIELDS)) out += m[1];
  for (const top of lessonBlocks(file, text)) if (/\btype: 'callout'/.test(top)) out += fieldOf(top, 'label');
  return out;
}

/**
 * 從原始碼找出會顯示的字。sources：[{ file, text }]
 * - display（標題字型）：畫面程式（.tsx）裡的字，加上資料裡當標題顯示的欄位；
 *   課文內文、單字解釋、家教提示詞用的是內文字型，不收。
 * - ja（假名字型）：含假名的一串日文（「は」念「わ」這種中文說明裡夾的「念」不算），加上 kanji 欄位，
 *   和課文裡單字、對照、會話、短文區塊的小標題（.rowtitle 用假名字型，標題是中文也一樣）。
 *   課程摘要的文法名稱不收：只在課程列表顯示，用系統字型。
 * 兩套都另外收英數字、全形標點和全部假名；假名字型再加上刪節號（課程列表的假名太多時用「…」）。
 */
export function collectChars(sources) {
  const display = new Set();
  const ja = new Set();
  const meaning = new Set();
  const addRange = (set, from, to) => {
    for (let c = from; c <= to; c++) set.add(String.fromCodePoint(c));
  };
  for (const set of [display, ja]) {
    addRange(set, 0x20, 0x7e); // 英數字、半形標點
    addRange(set, 0x3000, 0x30ff); // 全形標點、平假名、片假名
    addRange(set, 0xff01, 0xff5e); // 全形英數與標點
  }
  ja.add('…');
  for (const { file, text } of sources) {
    if (file.endsWith('.tsx')) {
      for (const ch of text) if (ch.codePointAt(0) >= 0x20) display.add(ch);
    }
    for (const ch of displayFieldText(file, text)) display.add(ch);
    for (const top of lessonBlocks(file, text)) {
      if (/\btype: '(?:words|pairs|vocab|examples|drill|dialog|reading)'/.test(top)) for (const ch of fieldOf(top, 'title')) ja.add(ch);
    }
    // 模擬考題組附的短文（reading: { title: '…' }）：標題也是 .rowtitle
    if (/(^|[\\/])data[\\/]mock[\\/]/.test(file)) for (const m of text.matchAll(/\breading: \{\s*title: '([^']*)'/g)) for (const ch of m[1]) ja.add(ch);
    if (/(^|[\\/])data[\\/]vocab[\\/]/.test(file)) for (const m of text.matchAll(/\bzh: '([^']+)'/g)) for (const ch of m[1]) meaning.add(ch);
    // 課程摘要的文法名稱（grammar: ['〜歳', '〜に住んでいます']）只在課程列表顯示，用系統字型（app.css 的 .sys-ja）：
    // 收假名字型的字時跳過，課程列表才不會為了這些字下載一堆字型檔
    const jaText = isLessonMeta(file) ? text.replace(/\bgrammar: \[[^\]]*\]/g, '') : text;
    // 明確是日文的地方：kanji／ja／say 欄位、[[漢字|かな]] 和 {{かな}} 標記、標了讀音的課文片段；
    // N5 課程的會話人名（who）、漢字（ch）、句型（form），和後面接《讀音》的漢字（見 src/lib/ja.ts）
    const jaFields = [
      /\b(?:kanji|ja|say|who|ch|form): '([^']+)'/g,
      /\[\[([^\]]+)\]\]/g,
      /\{\{([^}]+)\}\}/g,
      /text: '([^']+)', ruby: /g,
      /([\u3400-\u9fff\uf900-\ufaff々〆ヶ]+)《/g,
      // 考題要考的詞（⟦旅行⟧）：寫法題的選項只有漢字，也要收（不然那個選項會用別的字型，等於洩漏答案）
      /⟦([^⟧]+)⟧/g,
    ];
    // 日文欄位裡的符號也收（會話的「―」、說明表格的「→」…），不然那幾個字會掉到系統字型
    for (const re of jaFields) {
      for (const m of jaText.matchAll(re)) for (const ch of m[1]) if (ch.codePointAt(0) >= 0x20) ja.add(ch);
    }
    // 課名有假名的（「今、何時ですか」）在首頁、課文頁的上一課／下一課用假名字型顯示，課名裡的漢字也要收
    // （課程列表的課名用系統字型，見 .sys-ja）
    if (isLessonMeta(file)) {
      for (const m of text.matchAll(/\btitle: '([^']+)'/g)) {
        if (/[\u3041-\u3096\u30a1-\u30fa]/u.test(m[1])) for (const ch of m[1]) if (isJa(ch.codePointAt(0))) ja.add(ch);
      }
    }
    // 一串連續的日文字裡有假名，才當成日文
    let run = [];
    const flush = () => {
      if (run.some((ch) => isKana(ch.codePointAt(0)))) for (const ch of run) ja.add(ch);
      run = [];
    };
    for (const ch of jaText) {
      if (isJa(ch.codePointAt(0))) run.push(ch);
      else flush();
    }
    flush();
  }
  // 標題字型已經有的字不重複放（單字卡的字型順序是 NK Display → NK Meaning）
  for (const ch of display) meaning.delete(ch);
  return { display, ja, meaning };
}

/* ---------------- 哪些字真的用標題字型顯示 ---------------- */

/**
 * CSS 裡用到某個字型的選擇器。每個選擇器拆成一層一層的條件（標籤、class），
 * 例如 `.home-jlpt b` → [{ tag: null, classes: ['home-jlpt'] }, { tag: 'b', classes: [] }]。
 */
export function fontSelectors(css, test) {
  const out = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, sel, body] of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!test(body)) continue;
    for (const s of sel.split(',')) {
      const parts = s
        .trim()
        .split(/\s+/)
        .filter((p) => p && p !== '>');
      if (!parts.length || parts.some((p) => p.startsWith('@') || p.startsWith(':root'))) continue;
      out.push(parts.map((p) => ({ tag: /^[a-z][a-z0-9]*/.exec(p)?.[0] ?? null, classes: [...p.matchAll(/\.([\w-]+)/g)].map((x) => x[1]) })));
    }
  }
  return out;
}

/** JSX 的開始標籤（屬性裡可以有 {…}、"…"、'…'） */
const OPEN_TAG = /<([a-zA-Z][\w.]*)((?:\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|'[^']*'|[^>"'{}])*)>/g;

/** src 的 [from, to) 範圍裡，符合 match 的元素：回傳每個元素內容的範圍（開始標籤之後到對應的結束標籤） */
function elementRanges(src, from, to, match) {
  const out = [];
  const open = new RegExp(OPEN_TAG.source, 'g');
  open.lastIndex = from;
  for (let m = open.exec(src); m && m.index < to; m = open.exec(src)) {
    const [whole, tag, attrs] = m;
    if (attrs.trimEnd().endsWith('/') || !match(tag, attrs)) continue;
    const start = m.index + whole.length;
    const same = new RegExp(`<(/?)${tag.replace(/\./g, '\\.')}(?=[\\s>/])`, 'g');
    same.lastIndex = start;
    let depth = 1;
    let end = to;
    for (let t = same.exec(src); t && t.index < to; t = same.exec(src)) {
      depth += t[1] ? -1 : 1;
      if (!depth) {
        end = t.index;
        break;
      }
    }
    out.push([start, end]);
  }
  return out;
}

const classNameOf = (attrs) => /className=(?:"([^"]*)"|\{([^}]*)\})/.exec(attrs)?.slice(1).find((x) => x !== undefined) ?? '';
const hasClass = (attrs, cls) => new RegExp(`(^|[\\s'"\`{])${cls}($|[\\s'"\`}])`).test(classNameOf(attrs));

/** 一個 .tsx 檔裡，被用標題字型的元素包住的文字（不分是文字還是程式，之後只取字型有收的字） */
export function hotText(src, selectors) {
  let text = '';
  for (const path of selectors) {
    let ranges = [[0, src.length]];
    for (const part of path) {
      ranges = ranges.flatMap(([a, b]) =>
        elementRanges(src, a, b, (tag, attrs) => (!part.tag || part.tag === tag) && part.classes.every((c) => hasClass(attrs, c))),
      );
      if (!ranges.length) break;
    }
    for (const [a, b] of ranges) text += src.slice(a, b) + '\n';
  }
  return text;
}

/** 標題字型：這個檔裡真的會用標題字型顯示的字（.tsx 的標題元素＋資料的標題欄位） */
export function displayHotChars({ file, text }, selectors) {
  const hot = (file.endsWith('.tsx') ? hotText(text, selectors) : '') + displayFieldText(file, text);
  return new Set(hot);
}

/* ---------------- 分組 ---------------- */

/**
 * 英數、假名這些「基本字」的分組（每頁幾乎都會用到，又小，不跟著檔案分）。
 * - split（標題字型、單字解釋）：英數分兩組（空白、標點、數字／英文字母），平假名、片假名各分三段
 *   （あ～さ行、た～は行、ま～わ行），只用到幾個數字或假名的頁面不必下載全部。霞鶩文楷沒有字距微調，分開不影響排版。
 * - whole（假名字型）：Klee One 有假名之間、假名和標點之間的字距微調（kern），只有同一個字型檔裡的字才調得到，
 *   所以假名、全形標點（和刪節號）放同一組，英數也是一組，排出來和完整字型一樣。
 */
export const BASE_GROUPS = {
  split: [
    ['digits', [[0x20, 0x40]]],
    ['latin', [[0x41, 0x7e]]],
    ['hira-1', [[0x3040, 0x305e]]],
    ['hira-2', [[0x305f, 0x307d]]],
    ['hira-3', [[0x307e, 0x309f]]],
    ['kata-1', [[0x30a0, 0x30be]]],
    ['kata-2', [[0x30bf, 0x30dd]]],
    ['kata-3', [[0x30de, 0x30ff]]],
  ],
  whole: [
    ['ascii', [[0x20, 0x7e]]],
    ['kana', [[0x2026, 0x2026], [0x3000, 0x30ff], [0xff01, 0xff0f], [0xff1a, 0xff20], [0xff3b, 0xff40], [0xff5b, 0xff5e]]],
  ],
};

/** 第幾課（課文檔 data/lessons/lessonN.ts）；不是課文檔的話 undefined */
const lessonNo = (file) => {
  const m = /(?:^|[\\/])data[\\/]lessons[\\/]lesson(\d+)\.ts$/.exec(file);
  return m ? Number(m[1]) : undefined;
};
/**
 * 算「幾頁都有」時的頁：課文 56 個檔都是課文頁，算同一頁。
 * 不然課程越多，越多課文的漢字被當成「常用」，首頁、複習這些頁也要下載。
 */
const pageOf = (file) => (lessonNo(file) === undefined ? file : 'data/lessons/lesson*');

/**
 * 把一套字型要收的字分組，每組之後裁成一個 woff2。
 * chars：要收的字；files：[{ file, text, chars（這個檔收到的字）, hot（這個檔裡用這套字型顯示的字） }]
 * - core 頁以上都有的字（或每一頁都有的 everywhere）：「常用」組，越多頁用到的越前面。課文 56 個檔算同一頁。
 * - 不是常用、但 lessonCore 課以上都有的字：「課文共用」組，照第一次出現的課排，
 *   上到前面幾課只要下載前面幾個檔（不然這些字會被當成常用，每一頁都要下載）。
 * - 其餘的字有好幾個檔用到時，放在字最少的那個檔的組：小頁面（一課）只要下載自己的小檔，
 *   大頁面（整副單字牌組）本來就要下載很多組，多幾個小組影響不大。
 * 同樣的輸入一定得到同樣的分組（檔名跟著順序編號，內容沒變，瀏覽器和離線快取就沿用舊檔）。
 */
export function groupChars(
  chars,
  files,
  { core = 3, chunk = 24, coreChunk = 120, restChunk = 80, lessonCore = Infinity, lessonChunk = 60, base = 'split', everywhere = EVERYWHERE } = {},
) {
  const baseGroups = BASE_GROUPS[base];
  // 每個檔裡每個字第一次出現的位置
  const firstAt = new Map(
    files.map((f) => {
      const m = new Map();
      let i = 0;
      for (const ch of f.text) if (!m.has(ch)) m.set(ch, i++);
      return [f.file, m];
    }),
  );
  const first = (file, ch) => firstAt.get(file)?.get(ch) ?? Infinity;
  // 字最少的那個檔（標題字看標題字的數量；一樣多就照檔名）
  const pick = (list, size) => list.slice().sort((a, b) => size(a) - size(b) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))[0].file;

  const groups = new Map();
  const add = (key, ch) => {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ch);
  };
  const hotCount = new Map();
  /** 課文共用組的字：第一次出現在第幾課 */
  const firstLesson = new Map();
  for (const ch of chars) {
    const cp = ch.codePointAt(0);
    const inBase = baseGroups.find(([, ranges]) => ranges.some(([from, to]) => cp >= from && cp <= to));
    if (inBase) {
      add(inBase[0], ch);
      continue;
    }
    const hot = files.filter((f) => f.hot.has(ch));
    const pages = new Set(hot.map((f) => pageOf(f.file))).size;
    const lessons = hot.map((f) => lessonNo(f.file)).filter((n) => n !== undefined);
    hotCount.set(ch, pages);
    if (pages >= core || hot.some((f) => everywhere.includes(f.file))) add('core', ch);
    else if (lessons.length >= lessonCore) {
      // 好幾課都有的字：照第一次出現的課排，前面幾課只要下載前面幾個檔
      add('lessons', ch);
      hotCount.set(ch, lessons.length);
      firstLesson.set(ch, Math.min(...lessons));
    } else if (hot.length) add(`hot:${pick(hot, (f) => f.hot.size)}`, ch);
    else {
      const own = files.filter((f) => f.chars.has(ch));
      add(`rest:${own.length ? pick(own, (f) => f.chars.size) : '~'}`, ch);
    }
  }

  const rank = (key) => baseGroups.findIndex(([k]) => k === key) + 1 || (key === 'core' ? 10 : key === 'lessons' ? 15 : key.startsWith('hot:') ? 20 : 30);
  const keys = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  const out = [];
  for (const key of keys) {
    const list = groups.get(key);
    const cpOf = (ch) => ch.codePointAt(0);
    let size = Infinity;
    if (key === 'core') {
      // 越多頁用到的字越前面
      list.sort((a, b) => hotCount.get(b) - hotCount.get(a) || cpOf(a) - cpOf(b));
      size = coreChunk;
    } else if (key === 'lessons') {
      // 照第一次出現的課排（同一課的照用到的課數，多的在前）
      list.sort((a, b) => firstLesson.get(a) - firstLesson.get(b) || hotCount.get(b) - hotCount.get(a) || cpOf(a) - cpOf(b));
      size = lessonChunk;
    } else if (key.includes(':')) {
      const file = key.slice(key.indexOf(':') + 1);
      list.sort((a, b) => first(file, a) - first(file, b) || cpOf(a) - cpOf(b));
      size = key.startsWith('hot:') ? chunk : restChunk;
    } else list.sort((a, b) => cpOf(a) - cpOf(b));
    for (let i = 0; i < list.length; i += size) out.push({ key, chars: list.slice(i, i + size) });
  }
  return out;
}

/** 碼位清單 → 精簡的 unicode-range（連續的合成一段） */
export function toUnicodeRange(codePoints) {
  const cps = [...new Set(codePoints)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < cps.length; i++) {
    let j = i;
    while (j + 1 < cps.length && cps[j + 1] === cps[j] + 1) j++;
    const a = cps[i].toString(16).toUpperCase();
    const b = cps[j].toString(16).toUpperCase();
    parts.push(i === j ? `U+${a}` : `U+${a}-${b}`);
    i = j;
  }
  return parts.join(',');
}

/* ---------------- 產生字型檔 ---------------- */

const fontPath = (fam) => join(ROOT, 'node_modules', fam.pkg, fam.file);

/** 套件的 package.json（有些套件不能直接 require 它的 package.json，所以從進入點往上找） */
function packageOf(req, name) {
  for (let dir = dirname(req.resolve(name)); ; dir = dirname(dir)) {
    const file = join(dir, 'package.json');
    if (existsSync(file)) {
      const pkg = JSON.parse(readFileSync(file, 'utf8'));
      if (pkg.name === name) return { file, version: pkg.version };
    }
    if (dirname(dir) === dir) throw new Error(`找不到 ${name} 的 package.json`);
  }
}

/** 裁字工具（subset-font 和它用的 HarfBuzz）的版本：工具更新後，快取裡的舊結果就不再沿用 */
function toolVersions() {
  const subset = packageOf(createRequire(import.meta.url), 'subset-font');
  const harfbuzz = packageOf(createRequire(subset.file), 'harfbuzzjs');
  return `subset-font@${subset.version} harfbuzzjs@${harfbuzz.version}`;
}

async function subsetCached(subsetFont, tools, font, fontHash, text) {
  const key = createHash('sha256').update(CACHE_VERSION).update(tools).update(fontHash).update(KEEP_FEATURES.join()).update(text).digest('hex').slice(0, 32);
  const cached = join(CACHE_DIR, `${key}.woff2`);
  if (existsSync(cached)) return readFileSync(cached);
  const out = await subsetFont(font, text, { targetFormat: 'woff2', keepFeatures: KEEP_FEATURES });
  // 先寫到暫存檔再改名：同時有兩個建置、或寫到一半被中斷，都不會留下不完整的快取。
  // 快取只是加速，寫不進去（例如 Windows 的防毒軟體剛好鎖住檔案）就算了，不要讓建置失敗
  const tmp = `${cached}.${process.pid}.tmp`;
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(tmp, out);
    renameSync(tmp, cached);
  } catch {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // 暫存檔刪不掉也沒關係
    }
  }
  return out;
}

/** 產生裁過的字型和 CSS；回傳統計（給建置訊息用） */
export async function generateFonts() {
  const { default: subsetFont } = await import('subset-font');
  const tools = toolVersions();
  const srcDir = join(ROOT, 'src');
  const sources = walk(srcDir).map((p) => ({ file: relative(srcDir, p).split(sep).join('/'), text: readFileSync(p, 'utf8') }));
  const sets = collectChars(sources);
  const perFile = sources.map((s) => ({ ...s, sets: collectChars([s]) }));
  const selectors = fontSelectors(readFileSync(join(srcDir, 'styles/app.css'), 'utf8'), (body) => /var\(--font-display\)|'NK Display'/.test(body));
  const fonts = new Map();
  const files = new Map();
  const rules = ['/* 由 scripts/nk-fonts.mjs 在建置時產生，不要手動修改 */'];
  const stats = [];
  for (const fam of FAMILIES) {
    if (!fonts.has(fam.pkg + fam.file)) {
      const buf = readFileSync(fontPath(fam));
      fonts.set(fam.pkg + fam.file, { buf, hash: createHash('sha256').update(buf).digest('hex') });
    }
    const font = fonts.get(fam.pkg + fam.file);
    const famFiles = perFile.map((f) => {
      // 收字時每個檔都加上整段的英數、標點、假名；分組只看檔案裡真的有的字
      const inText = new Set(f.text);
      const chars = new Set([...f.sets[fam.chars]].filter((ch) => inText.has(ch)));
      const hot = fam.chars === 'display' ? new Set([...displayHotChars(f, selectors)].filter((ch) => chars.has(ch))) : chars;
      return { file: f.file, text: f.text, chars, hot };
    });
    const groups = groupChars(sets[fam.chars], famFiles, fam);
    let bytes = 0;
    for (const [n, g] of groups.entries()) {
      const cps = g.chars.map((ch) => ch.codePointAt(0));
      const out = await subsetCached(subsetFont, tools, font.buf, font.hash, String.fromCodePoint(...cps));
      // 「其餘」組（收著備用、畫面上其實用內文字型的字）檔名加上 rest：離線版不預先下載（scripts/nk-pwa.mjs）
      const name = g.key.startsWith('rest:') ? `${fam.prefix}-rest-${n}.woff2` : `${fam.prefix}-${n}.woff2`;
      files.set(name, out);
      bytes += out.length;
      rules.push(
        `/* ${g.key}（${g.chars.length} 字） */\n` +
          `@font-face{font-family:'${fam.family}';font-style:normal;font-display:swap;font-weight:${fam.weight};` +
          `src:url(./${name}) format('woff2');unicode-range:${toUnicodeRange(cps)}}`,
      );
    }
    stats.push(`${fam.family} ${groups.length} 個檔、${Math.round(bytes / 1024)} kB`);
  }
  const css = rules.join('\n') + '\n';
  // 內容沒變就不重寫，開發伺服器才不會無故重新整理
  const cssPath = join(OUT_DIR, 'nk-fonts.css');
  const same =
    existsSync(cssPath) &&
    readFileSync(cssPath, 'utf8') === css &&
    [...files].every(([name, buf]) => existsSync(join(OUT_DIR, name)) && readFileSync(join(OUT_DIR, name)).equals(buf));
  if (!same) {
    rmSync(OUT_DIR, { recursive: true, force: true });
    mkdirSync(OUT_DIR, { recursive: true });
    for (const [name, buf] of files) writeFileSync(join(OUT_DIR, name), buf);
    writeFileSync(cssPath, css);
  }
  return stats;
}

/** 字型授權（SIL OFL 1.1）跟著字型檔一起發布 */
function fontLicenses() {
  const byPkg = new Map();
  for (const f of FAMILIES) byPkg.set(f.pkg, [...(byPkg.get(f.pkg) ?? []), f.family]);
  return [...byPkg]
    .map(([pkg, families]) => {
      const license = readFileSync(join(ROOT, 'node_modules', pkg, 'LICENSE_FONT'), 'utf8');
      return `${families.join('、')}：由 ${pkg} 的字型檔依網站用到的字裁切而成，沿用原授權。\n\n${license}`;
    })
    .join('\n\n----------------------------------------\n\n');
}

export function nkFonts() {
  return {
    name: 'nk-fonts',
    enforce: 'pre',
    async buildStart() {
      const stats = await generateFonts();
      this.info?.(`字型：${stats.join('；')}`);
    },
    // AI 家教頁的完整 Klee One（Fontsource）：拿掉 .woff 備援，現在的瀏覽器都支援 woff2，那些檔案只會占空間
    transform(code, id) {
      if (!/[\\/]@fontsource[\\/][^\\/]+[\\/][^\\/]+\.css(\?|$)/.test(id)) return null;
      return { code: code.replace(/,\s*url\([^)]+\.woff\)\s*format\(['"]woff['"]\)/g, ''), map: null };
    },
    generateBundle() {
      // 開頭加 BOM：本機版（vite preview）送出 .txt 時沒有標明編碼，瀏覽器才不會把中文當成別的編碼顯示成亂碼
      this.emitFile({ type: 'asset', fileName: 'FONT-LICENSES.txt', source: `\uFEFF${fontLicenses()}` });
    },
  };
}
