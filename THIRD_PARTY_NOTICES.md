# 第三方資料與授權

這個專案自己的程式碼以 MIT 授權（見 [`LICENSE`](LICENSE)）。下面這些第三方資料、字型和套件各有自己的授權，**不適用** MIT。

## KanjiVG（筆順資料與網站圖示）

以下檔案取自 KanjiVG 的假名 SVG 筆畫資料，或由它衍生而成：

| 檔案 | 內容 |
| --- | --- |
| `src/data/strokes.json` | 假名筆順資料，由 `scripts/fetch-kanjivg.mjs` 從 KanjiVG 下載後擷取而成 |
| `public/favicon.svg` | 網站圖示，裡面的三個筆畫是 KanjiVG「あ」（`03042.svg`）的筆畫路徑 |

- 來源：https://kanjivg.tagaini.net/ ・ https://github.com/KanjiVG/kanjivg
- 著作權：© Ulrich Apel
- 授權：Creative Commons Attribution-Share Alike 3.0（CC BY-SA 3.0）https://creativecommons.org/licenses/by-sa/3.0/
- 這兩個衍生檔案沿用 CC BY-SA 3.0 授權。

## 字型

| 字型 | 著作權 | 授權 | 引入方式 |
| --- | --- | --- | --- |
| Klee One（Fontworks） | Copyright 2020 The Klee Project Authors | SIL Open Font License 1.1 | `@fontsource/klee-one`（Fontsource） |
| LXGW WenKai TC（落霞與孤鶩） | Copyright 2024 The LXGW WenKai Project Authors | SIL Open Font License 1.1 | `@fontsource/lxgw-wenkai-tc`（Fontsource） |

SIL Open Font License 1.1 全文：https://openfontlicense.org/open-font-license-official-text/ 。

建置時 `scripts/nk-fonts.mjs` 會把這兩套字型依網站用到的字裁切（subset），另存成 NK Display、NK Kana、NK Meaning 三組 woff2 檔，仍以 SIL Open Font License 1.1 授權；兩套字型的授權全文會一起發布成網站根目錄的 **`FONT-LICENSES.txt`**（線上版：https://willisxu.github.io/nihongo-classroom/FONT-LICENSES.txt ）。

## 打包進網站的 npm 套件

網站會把 React、React Router、Anthropic TypeScript SDK、svg-path-properties 等套件打包進去。每次建置（`npm run build`、`npm start`、GitHub Actions）時，Vite 會把**實際打包進網站的每個套件**和它們的授權全文自動整理成 **`THIRD-PARTY-LICENSES.md`**，放在 `dist/` 裡和 `index.html` 同一層，跟網站一起發布：

- 線上版：https://willisxu.github.io/nihongo-classroom/THIRD-PARTY-LICENSES.md
- 本機：http://localhost:5288/THIRD-PARTY-LICENSES.md

這個檔案是建置時產生的，不在 repo 裡（設定見 `vite.config.ts` 的 `build.license`）。

補充：`standardwebhooks`（Anthropic SDK 用到）的 npm 套件沒有附授權全文，所以在 `THIRD-PARTY-LICENSES.md` 裡只看得到「MIT」。它是 MIT 授權，Copyright (c) 2023 Svix，全文見 https://github.com/standard-webhooks/standard-webhooks/blob/main/libraries/LICENSE 。

只在開發和建置時使用、不會進到網站裡的工具（Vite、Vitest、TypeScript 等），授權請見各自 `node_modules/<套件>/` 裡的授權檔。
