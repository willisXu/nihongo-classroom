/**
 * 離線使用、加到主畫面（Vite 外掛）
 *
 * 建置完成後，從 dist 列出要預先下載的檔案，產生 dist/sw.js（service worker）。
 * service worker 的程式在 scripts/sw-template.js；這裡只在最前面加上兩個常數：
 *   VERSION   這一版的代號：預先下載檔案的內容雜湊。內容沒變就不會變，瀏覽器不會重新下載
 *   PRECACHE  要預先下載的檔案（相對於網站根目錄）
 *
 * 預先下載：index.html、全部的程式和樣式、裁切過的字型、圖示和 manifest（約 2 MB，傳輸時壓縮後更小）。
 * 不預先下載：完整的 Klee One（約 3.4 MB，只有 AI 家教頁用來補罕用字，而 AI 家教本來就要網路）、授權全文。
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAMILIES } from './nk-fonts.mjs';

const TEMPLATE = fileURLToPath(new URL('./sw-template.js', import.meta.url));
/** nk-fonts 裁出來的字型（display-…、kana-…、meaning-…） */
const SUBSET_FONT = new RegExp(`^assets/(?:${FAMILIES.map((f) => f.prefix).join('|')})-[^/]+\\.woff2$`);

/** 從 dist 的檔案（相對路徑，用 / 分隔）挑出要預先下載的 */
export function precacheList(files) {
  return files
    .filter(
      (f) =>
        f === 'index.html' ||
        f === 'manifest.webmanifest' ||
        /^[^/]+\.svg$/.test(f) ||
        /^icons\/[^/]+\.png$/.test(f) ||
        /^assets\/[^/]+\.(?:js|css)$/.test(f) ||
        SUBSET_FONT.test(f),
    )
    .sort();
}

/**
 * 產生 sw.js。files：dist 裡的檔案 [{ path, content }]
 * 回傳 { version, list, code }
 */
export function buildServiceWorker(files, template = readFileSync(TEMPLATE, 'utf8')) {
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  const list = precacheList([...byPath.keys()]);
  const hash = createHash('sha256').update(template);
  for (const p of list) hash.update(p).update('\0').update(byPath.get(p)).update('\0');
  const version = hash.digest('hex').slice(0, 12);
  const header =
    '// 由 scripts/nk-pwa.mjs 在建置時產生，不要手動修改\n' +
    `const VERSION = ${JSON.stringify(version)};\n` +
    `const PRECACHE = ${JSON.stringify(list)};\n\n`;
  return { version, list, code: header + template };
}

function walk(dir, prefix = '') {
  return readdirSync(dir).flatMap((name) => {
    const rel = prefix + name;
    return statSync(join(dir, name)).isDirectory() ? walk(join(dir, name), `${rel}/`) : [rel];
  });
}

export function nkPwa() {
  return {
    name: 'nk-pwa',
    apply: 'build',
    writeBundle(options) {
      const dir = options.dir;
      if (!dir) return;
      const files = walk(dir)
        .filter((p) => p !== 'sw.js')
        .map((path) => ({ path, content: readFileSync(join(dir, path)) }));
      const { version, list, code } = buildServiceWorker(files);
      writeFileSync(join(dir, 'sw.js'), code);
      const bytes = list.reduce((sum, p) => sum + statSync(join(dir, p)).size, 0);
      this.info?.(`離線快取：${list.length} 個檔、${Math.round(bytes / 1024)} kB（版本 ${version}）`);
    },
  };
}
