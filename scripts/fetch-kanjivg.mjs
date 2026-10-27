// 下載 KanjiVG 的筆順資料，產生 src/data/strokes.json（筆畫的 path）和 src/data/strokeCounts.ts（每個字幾畫）：
// 全部假名，加上初級課程（N5、N4）教的漢字（src/data/kanji.ts 的 ch 欄位）
// KanjiVG © Ulrich Apel, CC BY-SA 3.0  https://kanjivg.tagaini.net/
// 執行：npm run strokes（Node 22+；在需要代理的環境請加 NODE_USE_ENV_PROXY=1）
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/';
const ranges = [
  [0x3041, 0x3094], // ぁ..ゔ
  [0x30a1, 0x30f4], // ァ..ヴ
  [0x30fc, 0x30fc], // ー
];

/** 每個指令要幾個數字（KanjiVG 只用 M、C、c、S、s；L 是 M 後面多出來的座標） */
const ARITY = { M: 2, L: 2, C: 6, S: 4 };

/**
 * 座標只留 1 位小數：格子是 109 單位，差 0.05 畫面上看不出來，資料小約四分之一。
 * 相對座標（c、s）照「已經取整的目前位置」重新算再取整，誤差才不會一段一段累積：
 * 每個明寫的點（起點、控制點、終點）的絕對位置都在原本的 0.05 以內。
 */
export function roundPath(d) {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const r1 = (v) => Math.round(v * 10) / 10;
  const fmt = (v) => {
    const s = r1(v).toFixed(1).replace(/\.0$/, '');
    return s === '-0' ? '0' : s;
  };
  let out = '';
  let cmd = '';
  let args = [];
  // 原本的目前位置，和取整之後的目前位置
  let x = 0;
  let y = 0;
  let rx = 0;
  let ry = 0;
  let afterNumber = false;
  // 數字之間用逗號隔開；負號本身就能隔開（和 KanjiVG 的寫法一樣）
  const put = (s) => {
    out += afterNumber && !s.startsWith('-') ? `,${s}` : s;
    afterNumber = true;
  };
  for (const t of tokens) {
    if (/[A-Za-z]/.test(t)) {
      if (!(t.toUpperCase() in ARITY)) throw new Error(`不支援 ${t} 指令：${d}`);
      if (args.length) throw new Error(`參數不完整：${d}`);
      cmd = t;
      out += t;
      afterNumber = false;
      continue;
    }
    if (!cmd) throw new Error(`path 要以指令開頭：${d}`);
    args.push(Number(t));
    const abs = cmd.toUpperCase();
    if (args.length < ARITY[abs]) continue;
    const rel = cmd !== abs;
    for (let i = 0; i < args.length; i += 2) {
      const px = rel ? x + args[i] : args[i];
      const py = rel ? y + args[i + 1] : args[i + 1];
      const qx = rel ? r1(rx + r1(px - rx)) : r1(px);
      const qy = rel ? r1(ry + r1(py - ry)) : r1(py);
      put(fmt(rel ? qx - rx : qx));
      put(fmt(rel ? qy - ry : qy));
      // 這一段的最後一個點是新的目前位置（相對座標都從這一段開始的位置算）
      if (i === args.length - 2) {
        x = px;
        y = py;
        rx = qx;
        ry = qy;
      }
    }
    args = [];
    if (abs === 'M') cmd = rel ? 'l' : 'L';
  }
  if (args.length) throw new Error(`參數不完整：${d}`);
  return out;
}

async function main() {
  const chars = [];
  for (const [a, b] of ranges) for (let c = a; c <= b; c++) chars.push(c);
  // 課程的漢字：照 kanji.ts 的順序
  const kanjiSrc = await readFile(fileURLToPath(new URL('../src/data/kanji.ts', import.meta.url)), 'utf8');
  for (const m of kanjiSrc.matchAll(/\bch: '(.)'/gu)) chars.push(m[1].codePointAt(0));

  const out = {};
  // 下載失敗、少了筆畫、path 看不懂的字（有一個就不寫檔：不能讓 strokes.json 默默少了字）
  const failed = [];
  for (const cp of chars) {
    const hex = cp.toString(16).padStart(5, '0');
    const ch = String.fromCodePoint(cp);
    try {
      const res = await fetch(BASE + hex + '.svg');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const svg = await res.text();
      // 筆畫 path：id="kvg:03042-s1" d="..."
      const strokes = [];
      const re = /<path[^>]*id="kvg:[0-9a-f]+-s(\d+)"[^>]*d="([^"]+)"/g;
      let m;
      while ((m = re.exec(svg))) strokes[Number(m[1]) - 1] = roundPath(m[2].trim());
      // Array.from 才會把漏掉的筆畫（陣列的空洞）當成 undefined 檢查到
      if (!strokes.length || Array.from(strokes).some((s) => !s)) throw new Error('筆畫不完整');
      out[ch] = strokes;
    } catch (e) {
      failed.push(`${ch}（${e instanceof Error ? e.message : e}）`);
    }
  }
  if (failed.length) {
    console.error(`有 ${failed.length} 個字沒有拿到完整的筆順，沒有寫入 strokes.json、strokeCounts.ts：\n${failed.join('\n')}`);
    process.exitCode = 1;
    return;
  }

  const header = {
    _source: 'KanjiVG (https://kanjivg.tagaini.net/) © Ulrich Apel, CC BY-SA 3.0',
    _viewBox: '0 0 109 109',
  };
  const target = fileURLToPath(new URL('../src/data/strokes.json', import.meta.url));
  await writeFile(target, JSON.stringify({ ...header, strokes: out }) + '\n');

  // 只要畫數的頁面（課文、模擬考、五十音表）用這個小檔，不必載入整份筆順資料
  const counts = Object.entries(out)
    .map(([ch, s]) => ch + s.length)
    .join('');
  const countsTs = `// 由 scripts/fetch-kanjivg.mjs 產生（npm run strokes），不要手動修改。
// 每個字的筆畫數（KanjiVG © Ulrich Apel, CC BY-SA 3.0）：課文、模擬考、五十音表只要畫數，用這個小檔，不必載入整份 strokes.json。
// 格式：每個字後面接它的畫數，例如「あ3い2」。

const DATA = '${counts}';

let counts: ReadonlyMap<string, number> | undefined;

/** 這個字幾畫；沒有筆順資料的字回傳 undefined */
export function strokeCount(ch: string): number | undefined {
  counts ??= new Map(Array.from(DATA.matchAll(/(\\D)(\\d+)/gu), (m) => [m[1], Number(m[2])]));
  return counts.get(ch);
}
`;
  await writeFile(fileURLToPath(new URL('../src/data/strokeCounts.ts', import.meta.url)), countsTs);
  console.log(`寫入 ${Object.keys(out).length} 個字`);
}

// 測試只 import roundPath，不下載
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
