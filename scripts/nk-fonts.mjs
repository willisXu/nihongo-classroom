/**
 * 字型瘦身（Vite 外掛）
 *
 * 網站的兩套字型（標題用的霞鶩文楷 LXGW WenKai TC、假名用的 Klee One）是很大的中日文字型，
 * Fontsource 把它們切成一百多片，瀏覽器看頁面上用到哪些字就下載哪幾片，但每一片都有幾百個字，
 * 一頁常常要下載 0.3～1 MB。這個外掛在建置時：
 *
 *   1. 掃描 src 找出會用到的字（標題字型：畫面文字和標題欄位；假名字型：日文片段，見 collectChars）
 *   2. 把用得到的每一片裁成只剩這些字（subset-font），另存成「NK Display」「NK Kana」兩套字型
 *   3. 產生 src/fonts/generated/nk-fonts.css（不進版控），unicode-range 只列出真的有的字
 *
 * 這樣每一頁只下載裁過的小檔。AI 家教回覆裡偶爾出現的其他漢字，會往下用原本完整的 Klee One
 * （tokens.css 的字型順序），字形一致。同一片內容沒變就沿用快取（node_modules/.cache/nk-fonts）。
 *
 * 另外把 Fontsource CSS 裡的 .woff 備援拿掉：現在的瀏覽器都支援 woff2，那些檔案只會占空間。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'src/fonts/generated');
const CACHE_DIR = join(ROOT, 'node_modules/.cache/nk-fonts');
const CACHE_VERSION = 'v1';

export const FAMILIES = [
  { family: 'NK Display', pkg: 'lxgw-wenkai-tc', css: '700.css', weight: 700, prefix: 'display', chars: 'display' },
  { family: 'NK Kana', pkg: 'klee-one', css: '600.css', weight: 600, prefix: 'kana', chars: 'ja' },
  // 單字卡背面的中文解釋：字很多，分開成一套，只有複習頁會下載（其他頁的標題字型不必跟著變大）
  { family: 'NK Meaning', pkg: 'lxgw-wenkai-tc', css: '700.css', weight: 700, prefix: 'meaning', chars: 'meaning' },
];

/** 資料檔裡會用標題字型顯示的欄位（h1–h3 標題、牌組主題、五十音表的字源） */
const DISPLAY_FIELDS = /\b(?:title|headline|topic|ho|ko): '([^']*)'/g;

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
 * 從原始碼找出會顯示的字。sources：[{ file, text }]
 * - display（標題字型）：畫面程式（.tsx）裡的字，加上資料裡當標題顯示的欄位；
 *   課文內文、單字解釋、家教提示詞用的是內文字型，不收。
 * - ja（假名字型）：含假名的一串日文（「は」念「わ」這種中文說明裡夾的「念」不算），加上 kanji 欄位。
 * 兩套都另外收英數字、全形標點和全部假名。
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
  for (const { file, text } of sources) {
    if (file.endsWith('.tsx')) {
      for (const ch of text) if (ch.codePointAt(0) >= 0x20) display.add(ch);
    }
    for (const m of text.matchAll(DISPLAY_FIELDS)) for (const ch of m[1]) display.add(ch);
    if (/[\\/]data[\\/]vocab[\\/]/.test(file)) for (const m of text.matchAll(/\bzh: '([^']+)'/g)) for (const ch of m[1]) meaning.add(ch);
    // 明確是日文的地方：kanji／ja／say 欄位、[[漢字|かな]] 和 {{かな}} 標記、標了讀音的課文片段
    const jaFields = [/\b(?:kanji|ja|say): '([^']+)'/g, /\[\[([^\]]+)\]\]/g, /\{\{([^}]+)\}\}/g, /text: '([^']+)', ruby: /g];
    for (const re of jaFields) {
      for (const m of text.matchAll(re)) for (const ch of m[1]) if (isJa(ch.codePointAt(0))) ja.add(ch);
    }
    // 一串連續的日文字裡有假名，才當成日文
    let run = [];
    const flush = () => {
      if (run.some((ch) => isKana(ch.codePointAt(0)))) for (const ch of run) ja.add(ch);
      run = [];
    };
    for (const ch of text) {
      if (isJa(ch.codePointAt(0))) run.push(ch);
      else flush();
    }
    flush();
  }
  // 標題字型已經有的字不重複放（單字卡的字型順序是 NK Display → NK Meaning）
  for (const ch of display) meaning.delete(ch);
  return { display, ja, meaning };
}

/** 讀 Fontsource 的 CSS：每一片的 woff2 檔名和 unicode-range */
export function parseFontsourceCss(css) {
  return [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => {
    const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(m[1])?.[1];
    const range = /unicode-range:\s*([^;}]+)/.exec(m[1])?.[1] ?? '';
    const ranges = range
      .split(',')
      .map((r) => r.trim().replace(/^U\+/i, ''))
      .filter(Boolean)
      .map((r) => {
        if (r.includes('?')) return [parseInt(r.replace(/\?/g, '0'), 16), parseInt(r.replace(/\?/g, 'F'), 16)];
        const [a, b = a] = r.split('-');
        return [parseInt(a, 16), parseInt(b, 16)];
      });
    return { file, ranges };
  });
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

async function subsetCached(subsetFont, source, text) {
  const key = createHash('sha256').update(CACHE_VERSION).update(source).update(text).digest('hex').slice(0, 32);
  const cached = join(CACHE_DIR, `${key}.woff2`);
  if (existsSync(cached)) return readFileSync(cached);
  const out = await subsetFont(source, text, { targetFormat: 'woff2' });
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cached, out);
  return out;
}

/** 產生裁過的字型和 CSS；回傳統計（給建置訊息用） */
export async function generateFonts() {
  const { default: subsetFont } = await import('subset-font');
  const sources = walk(join(ROOT, 'src')).map((file) => ({ file, text: readFileSync(file, 'utf8') }));
  const sets = collectChars(sources);
  const files = new Map();
  const rules = ['/* 由 scripts/nk-fonts.mjs 在建置時產生，不要手動修改 */'];
  const stats = [];
  for (const fam of FAMILIES) {
    const dir = join(ROOT, 'node_modules/@fontsource', fam.pkg);
    const chars = [...sets[fam.chars]];
    let bytes = 0;
    let n = 0;
    const faces = parseFontsourceCss(readFileSync(join(dir, fam.css), 'utf8'));
    for (const face of faces) {
      if (!face.file) continue;
      const cps = chars.map((c) => c.codePointAt(0)).filter((cp) => face.ranges.some(([a, b]) => cp >= a && cp <= b));
      if (!cps.length) continue;
      const out = await subsetCached(subsetFont, readFileSync(join(dir, 'files', face.file)), String.fromCodePoint(...cps));
      const name = `${fam.prefix}-${n++}.woff2`;
      files.set(name, out);
      bytes += out.length;
      rules.push(
        `@font-face{font-family:'${fam.family}';font-style:normal;font-display:swap;font-weight:${fam.weight};` +
          `src:url(./${name}) format('woff2');unicode-range:${toUnicodeRange(cps)}}`,
      );
    }
    stats.push(`${fam.family} ${n} 個檔、${Math.round(bytes / 1024)} kB`);
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
  return FAMILIES.map((f) => {
    const license = readFileSync(join(ROOT, 'node_modules/@fontsource', f.pkg, 'LICENSE'), 'utf8');
    return `${f.family}：由 @fontsource/${f.pkg} 的字型依網站用到的字裁切而成，沿用原授權。\n\n${license}`;
  }).join('\n\n----------------------------------------\n\n');
}

export function nkFonts() {
  return {
    name: 'nk-fonts',
    enforce: 'pre',
    async buildStart() {
      const stats = await generateFonts();
      this.info?.(`字型：${stats.join('；')}`);
    },
    transform(code, id) {
      if (!/[\\/]@fontsource[\\/][^\\/]+[\\/][^\\/]+\.css(\?|$)/.test(id)) return null;
      return { code: code.replace(/,\s*url\([^)]+\.woff\)\s*format\(['"]woff['"]\)/g, ''), map: null };
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'FONT-LICENSES.txt', source: fontLicenses() });
    },
  };
}
