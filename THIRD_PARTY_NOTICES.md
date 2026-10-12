# 第三方資料與授權

## KanjiVG（筆順資料）

`src/data/strokes.json` 由 `scripts/fetch-kanjivg.mjs` 從 KanjiVG 下載假名的 SVG 筆畫資料後擷取而成。

- 來源：https://kanjivg.tagaini.net/ ・ https://github.com/KanjiVG/kanjivg
- 著作權：© Ulrich Apel
- 授權：Creative Commons Attribution-Share Alike 3.0（CC BY-SA 3.0）https://creativecommons.org/licenses/by-sa/3.0/
- 這個衍生資料檔沿用 CC BY-SA 3.0 授權。

## 字型

- Klee One（Fontworks）：SIL Open Font License 1.1，透過 `@fontsource/klee-one` 引入。
- LXGW WenKai TC（落霞與孤鶩）：SIL Open Font License 1.1，透過 `@fontsource/lxgw-wenkai-tc` 引入。

## 套件

React、React Router、Vite、Vitest、TypeScript、svg-path-properties、Anthropic TypeScript SDK 等套件的授權，請見各自 `node_modules/<套件>/LICENSE`。
