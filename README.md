# 日文自學教室

給零基礎、母語是繁體中文的人用的日文自學網站。從五十音開始，一路到 JLPT N5 單字和會話練習。

**線上版：<https://willisxu.github.io/nihongo-classroom/>**（GitHub Pages；推送到 `main` 後約 1 分鐘自動更新）

- **五十音課程（8 課）**：平假名 6 課、片假名 2 課。用注音對照發音、用漢字草書記字形，每課的練習詞只會用到學過的假名。
- **假名測驗**：看字選拼音、聽音選假名。答錯的字會更常出現，連續答對 3 次算「熟悉」。
- **手寫描字**：照 KanjiVG 的筆順一筆一筆寫，逐筆判斷方向、順序、位置和形狀，寫錯會說明原因並示範。也能練小字（ゃ ゅ ょ っ、ァ ィ…）和長音符號 ー。
- **單字卡**：JLPT N5 核心單字（776）、旅遊（226）、職場（127）、日劇・動畫・音樂（128）四組牌組，用間隔複習排程。
- **AI 日文家教**：用 Claude 練情境會話（點餐、入住、問路、自我介紹、接電話、聊動畫…）、批改句子、依弱點出題。
- **學習地圖**：從零到 N4 的路線、每天 45 分鐘的分配、2027 年 JLPT 時程與教材建議。

所有學習紀錄都存在瀏覽器的 localStorage，不需要帳號或伺服器。

---

## 快速開始

需要先安裝 [Node.js](https://nodejs.org/) **22.12 以上**的版本（裝 LTS 版即可）。

### Windows

雙擊資料夾裡的 **`start-windows.bat`**，建置好之後瀏覽器會自動開啟 `http://localhost:5288`。

### macOS

在 Finder 雙擊 **`start-mac.command`**（第一次可能要在「系統設定 → 隱私權與安全性」允許），或在終端機執行：

```bash
cd nihongo-classroom
./start-mac.command
```

### 啟動檔會自動處理的事

- **第一次執行**會先安裝套件（約 1～2 分鐘，需要網路），再建置網站、打開瀏覽器。
- 套件**沒裝完整**（例如上次安裝到一半斷線）或**套件有更新**時，會自動重新安裝，不用自己刪資料夾。安裝失敗的話，確認網路後再雙擊一次就好。
- 網站**已經在執行**時再雙擊一次，只會直接幫你打開瀏覽器，不會重複啟動。
- 使用期間請讓那個視窗開著；關掉視窗（或按 Ctrl+C），網站就會停止。
- 如果 5288 這個連接埠被別的程式占用，會說明原因後停下來（學習紀錄跟著連接埠走，所以不會改用別的埠）。

### 手動執行

```bash
npm start          # 和雙擊啟動檔一樣：需要時自動安裝套件，建置後開啟 http://localhost:5288
npm ci             # 只安裝套件（要用下面幾個指令前先跑一次）
npm run dev        # 開發模式，改程式會即時更新，同樣是 http://localhost:5288
npm run build      # 型別檢查＋建置到 dist/
npm test           # 單元測試與內容檢查
```

> 學習紀錄存在瀏覽器裡，而且是跟著網址（含連接埠）走的。請固定用 `http://localhost:5288` 開啟，換了網址或連接埠，紀錄會看起來像不見了（其實還留在原本的網址）。

---

## 發音

發音使用瀏覽器內建的語音合成（Web Speech API），不需要網路上的音檔。

- **Windows**：Edge 內建自然的日文語音（Nanami）；Chrome 會用「Google 日本語」。如果聽不到，到「設定 → 時間與語言 → 語音 → 新增語音」加入日文。
- **macOS / iPhone**：到「系統設定 → 輔助使用 → 朗讀內容 → 系統語音 → 管理語音」加入日文（Kyoko、Otoya）。
- 網站右上角的「慢速發音」可以放慢語速，「設定」頁可以指定要用哪個語音。

## AI 日文家教

AI 家教直接從你的瀏覽器呼叫 [Claude API](https://platform.claude.com/docs/en/api/overview)，需要你自己的 Anthropic API 金鑰：

1. 到 [Claude Console](https://console.anthropic.com/settings/keys) 建立金鑰（需要先儲值）。
2. 在網站的「AI 家教」或「設定」頁貼上金鑰，按「測試並儲存」。

說明：

- 金鑰只存在你自己瀏覽器的 localStorage，請求直接送到 `api.anthropic.com`，不經過任何其他伺服器。匯出的備份檔不包含金鑰。
- localStorage 是同一個網址來源共用的：在本機請固定用 5288 埠（不要和其他會讀 localStorage 的專案共用同一個埠）；部署到 GitHub Pages 時，同一個帳號底下的所有 Pages 網站共用 `<帳號>.github.io` 這個來源，如果你還有放別人寫的程式的 Pages 網站，建議改用自己的網域或不要在線上版存金鑰。
- 因為是從瀏覽器直接呼叫，SDK 需要 `dangerouslyAllowBrowser: true`。這個網站適合**自己用**；不要把存有金鑰的瀏覽器借給別人，也不要把金鑰寫進程式碼。
- 可選模型：Claude Haiku 5.5（最省）、Claude Sonnet 5.5（預設）、Claude Opus 5.5。一次會話往返通常只用幾千個 token，「設定」頁會顯示累計用量與估算費用。
- 三種模式都用結構化輸出（JSON schema），回覆會分成日文、假名讀音、中文翻譯、批改與建議回答。
- 回覆用串流接收：生成再久（例如 Opus）也不會被當成逾時；送出後可以按「停止」取消。
- 對話、批改和出題的內容存在這個分頁的 sessionStorage（`nk.tutorSession`）：換到別頁再回來、重新整理都還在，關掉分頁就清掉，也不會放進備份檔。

## 學習紀錄與備份

課程進度、假名測驗、手寫、單字卡、用量紀錄都存在瀏覽器的 localStorage（`nk.*`）。

- 換電腦或換瀏覽器前，到「設定 → 匯出備份」下載 JSON 檔，在新的地方「匯入備份」即可接著學。
- 清除瀏覽器資料會連學習紀錄一起清掉，記得定期匯出。學過幾天之後，首頁會在超過兩週沒匯出時提醒你。
- 瀏覽器存不進資料時（封鎖網站資料、空間已滿），網站會跳出提示，避免你以為有存到。
- iPhone／iPad 的 Safari 如果 7 天沒打開這個網站，可能會清掉網站資料；在 iPhone 上用的話，建議「加入主畫面」並定期匯出備份。

## 部署到 GitHub Pages

這個專案已經附上 `.github/workflows/deploy.yml`：推送到 `main` 分支時會自動跑測試、建置並發布到 GitHub Pages。

1. 到 GitHub repo 的 **Settings → Pages**，把 **Source** 設成 **GitHub Actions**。
2. 推送到 `main`，等 Actions 跑完，網址會是 `https://<你的帳號>.github.io/<repo 名稱>/`。

網站使用 hash 路由（網址裡有 `#/`）和相對路徑，放在任何子路徑都能運作。GitHub 免費方案的 Pages 需要 repo 是 Public；私人 repo 可以改用 Vercel、Netlify 或 Cloudflare Pages（建置指令 `npm run build`，輸出資料夾 `dist`）。

---

## 專案結構

```
src/
  data/
    kana.ts            假名資料：注音對照、發音提示、字源、例字
    lessons/           第 1–8 課（資料驅動，lesson1.ts … lesson8.ts）；meta.ts 是每課摘要（首頁和列表只載這個）
    vocab/             單字牌組：n5 / travel / business / anime；meta.ts 是牌組摘要（首頁和列表只載這個）
    scenarios.ts       AI 家教的情境清單
    tutor.ts           AI 家教的系統提示與 JSON schema
    strokes.json       KanjiVG 筆順（由 scripts/fetch-kanjivg.mjs 產生）
    types.ts           資料型別
  lib/
    srs.ts             間隔複習排程（SM-2 變形）
    strokes.ts         手寫筆畫比對
    kanaQuiz.ts        假名測驗出題與干擾選項
    claude.ts          Claude API：模型、費用、金鑰整理、錯誤型別（不含 SDK）
    claude-api.ts      真正呼叫 API 的部分（含 Claude SDK，第一次用到才載入）
    romaji.ts          假名轉羅馬拼音
    speech.ts          日文語音合成
  state/               localStorage 狀態（設定、進度、紀錄、備份）
  components/          共用元件（練習格、描字畫布、發音鈕…）
  pages/               各頁面
scripts/
  start.mjs            啟動程式（啟動檔和 npm start 都跑這支：檢查 Node、連接埠、安裝套件、建置）
  start-lib.mjs        啟動程式用的小工具（只用 Node 內建模組）
  fetch-kanjivg.mjs    下載 KanjiVG 筆順，產生 src/data/strokes.json
  nk-fonts.mjs         建置時把兩套字型裁成網站用得到的字（Vite 外掛，產生 src/fonts/generated/，不進版控）
tests/                 Vitest：排程、筆畫比對、假名測驗、課程與單字內容檢查、啟動程式
```

### 內容檢查

`npm test` 除了單元測試，也會檢查教材內容：

- 每一課的練習詞**只用到該課以前學過的假名**（逐字檢查）。
- 八課合起來涵蓋所有清音、濁音、半濁音、拗音小字、促音和長音符號。
- 單字的假名欄位只能有假名、動詞一定有分類、中文欄位不能有常見簡體字、牌組內沒有重複。
- 筆畫比對：每個字的標準筆畫要能通過，方向反、順序錯、位置偏的筆畫要被正確判斷。

### 修改課程或單字

- 課程是資料檔，照 `src/data/types.ts` 的 `Lesson` 型別編輯 `src/data/lessons/lessonN.ts`，課文支援 `**粗體**`、`[[可發音的日文]]`、`[[漢字|かんじ]]`、`[連結](/practice)`。
- 單字在 `src/data/vocab/*.ts`，新增時 id 接著往下編號，不要改舊的 id（複習紀錄是用 id 記的）。
- 改完跑 `npm test` 確認內容檢查通過。

---

## 授權

- 程式碼：MIT（見 [`LICENSE`](LICENSE)）。
- 以下檔案取自或衍生自 [KanjiVG](https://kanjivg.tagaini.net/)（© Ulrich Apel），以 [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) 授權，沿用相同授權、不適用 MIT：
  - `src/data/strokes.json`：假名筆順資料
  - `public/favicon.svg`：網站圖示（「あ」的筆畫）
- 字型 Klee One、LXGW WenKai TC 以 SIL Open Font License 1.1 授權，透過 Fontsource 套件引入；建置時依網站用到的字裁切（`scripts/nk-fonts.mjs`），授權全文跟著網站發布成 `FONT-LICENSES.txt`。
- 打包進網站的 npm 套件（React、React Router、Anthropic SDK 等）的授權全文，建置時會自動產生成 `dist/THIRD-PARTY-LICENSES.md`，和 `index.html` 一起發布（線上版：<https://willisxu.github.io/nihongo-classroom/THIRD-PARTY-LICENSES.md>）。

詳見 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
