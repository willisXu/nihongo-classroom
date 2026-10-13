/**
 * 補齊網站附的第三方授權（Vite 外掛）。
 *
 * Vite 會把打包進網站的套件授權全文輸出成 dist/THIRD-PARTY-LICENSES.md，但只抓得到套件裡附的授權檔。
 * standardwebhooks（Anthropic SDK 用到）的 npm 套件沒有附授權檔，所以清單裡只有標題。
 * 它是 MIT 授權，MIT 要求散布時附上授權全文：建置完把全文補進去。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** 套件名稱 → 授權全文（來源見 THIRD_PARTY_NOTICES.md） */
export const MISSING_LICENSES = {
  standardwebhooks: `MIT License

Copyright (c) 2023 Svix

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
};

/** 在授權清單裡，只有標題、沒有全文的套件下面補上全文（已經有全文的不動） */
export function addMissingLicenses(markdown, texts = MISSING_LICENSES) {
  let out = markdown;
  for (const [name, text] of Object.entries(texts)) {
    const heading = new RegExp(`^## ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} - [^\n]*\n`, 'm');
    const m = heading.exec(out);
    if (!m) continue;
    const after = out.slice(m.index + m[0].length);
    // 標題後面（空行之後）直接是下一個標題或檔案結尾：沒有全文
    if (!/^\s*(## |$)/.test(after)) continue;
    out = `${out.slice(0, m.index + m[0].length)}\n${text}\n${after}`;
  }
  return out;
}

export function nkLicenses() {
  return {
    name: 'nk-licenses',
    apply: 'build',
    // Vite 在 generateBundle 才產生授權清單：等檔案都寫好了再補
    writeBundle(options) {
      const file = options.dir ? join(options.dir, 'THIRD-PARTY-LICENSES.md') : '';
      if (!file || !existsSync(file)) return;
      const md = readFileSync(file, 'utf8');
      const patched = addMissingLicenses(md);
      if (patched !== md) writeFileSync(file, patched);
    },
  };
}
