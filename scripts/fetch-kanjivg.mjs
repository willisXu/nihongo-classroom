// 下載 KanjiVG 的筆順資料，產生 src/data/strokes.json：全部假名，加上 N5 課程教的漢字（src/data/kanji.ts 的 ch 欄位）
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
const chars = [];
for (const [a, b] of ranges) for (let c = a; c <= b; c++) chars.push(c);
// N5 的漢字：照 kanji.ts 的順序
const kanjiSrc = await readFile(fileURLToPath(new URL('../src/data/kanji.ts', import.meta.url)), 'utf8');
for (const m of kanjiSrc.matchAll(/\bch: '(.)'/gu)) chars.push(m[1].codePointAt(0));

const out = {};
const missing = [];
for (const cp of chars) {
  const hex = cp.toString(16).padStart(5, '0');
  const ch = String.fromCodePoint(cp);
  const res = await fetch(BASE + hex + '.svg');
  if (!res.ok) { missing.push(ch); continue; }
  const svg = await res.text();
  // 筆畫 path：id="kvg:03042-s1" d="..."
  const strokes = [];
  const re = /<path[^>]*id="kvg:[0-9a-f]+-s(\d+)"[^>]*d="([^"]+)"/g;
  let m;
  while ((m = re.exec(svg))) strokes[Number(m[1]) - 1] = m[2].trim();
  if (!strokes.length || strokes.some((s) => !s)) { missing.push(ch); continue; }
  out[ch] = strokes;
}

const header = {
  _source: 'KanjiVG (https://kanjivg.tagaini.net/) © Ulrich Apel, CC BY-SA 3.0',
  _viewBox: '0 0 109 109',
};
const target = fileURLToPath(new URL('../src/data/strokes.json', import.meta.url));
await writeFile(target, JSON.stringify({ ...header, strokes: out }) + '\n');
console.log(`寫入 ${Object.keys(out).length} 個字；缺少：${missing.join(' ') || '無'}`);
