/**
 * 日文自學教室的啟動程式：start-windows.bat、start-mac.command 和 `npm start` 都是執行這支。
 *
 *   1. 檢查 Node.js 版本（22.12 以上）
 *   2. 檢查連接埠 5288：日文自學教室已經在執行 → 直接打開瀏覽器；被別的程式占用 → 說明後結束
 *   3. 拿啟動鎖：另一個視窗正在安裝或建置（雙擊了兩次）→ 等它把網站開好
 *   4. 套件沒裝好（第一次執行、上次裝到一半、套件有更新、換了電腦）→ 執行 npm ci
 *   5. 建置網站，在 http://localhost:5288 開啟（設定沿用 vite.config.ts）
 *
 * 這支檔案只用 Node.js 內建模組，套件還沒裝好也能執行；Vite 等套件裝好之後才載入。
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIN_NODE,
  PORT,
  acquireLock,
  checkPort,
  depsInstalled,
  isSupportedNode,
  keepLock,
  openBrowser,
  releaseLock,
  removeStamp,
  runNpmCi,
  writeStamp,
} from './start-lib.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const APP_URL = `http://localhost:${PORT}/`;

/** 目前在做什麼（預期外的錯誤訊息會用到） */
let step = '啟動';

function say(...lines) {
  for (const line of lines) console.log(line);
}

function complain(...lines) {
  for (const line of lines) console.error(line);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openRunningApp() {
  say('日文自學教室已經在執行，直接幫你打開瀏覽器', `網址：${APP_URL}`);
  openBrowser(APP_URL);
  await wait(2500); // 讓視窗多停一下，看得到上面的訊息
  return 0;
}

/** 另一個視窗等太久的上限（第一次安裝套件加上建置，網路慢時也夠用） */
const WAIT_OTHER_MS = 15 * 60 * 1000;

/** 另一個視窗把網站開好了（瀏覽器由那個視窗打開） */
async function otherWindowDone() {
  say(
    '',
    `日文自學教室已經在另一個視窗開好了：${APP_URL}`,
    '瀏覽器沒有自動打開的話，請自己在瀏覽器輸入上面的網址。這個視窗可以關掉了。',
  );
  await wait(2500);
  return 0;
}

/**
 * 另一個視窗正在安裝套件或建置網站：等它把網站開好（開好時那個視窗會打開瀏覽器）。
 * 那個視窗沒有開成（出錯、被關掉）的話，拿到鎖、回傳 undefined，由這個視窗接手。
 */
async function waitForOtherWindow() {
  say('另一個日文自學教室的視窗正在準備網站（安裝套件或建置），好了就能用，請稍等…');
  const deadline = Date.now() + WAIT_OTHER_MS;
  while (Date.now() < deadline) {
    await wait(2000);
    const state = await checkPort(PORT);
    if (state === 'app') return otherWindowDone();
    if (state === 'other') return portTaken();
    if (acquireLock(root)) return undefined;
  }
  complain('等了很久，另一個視窗還是沒有把網站開好。請關掉所有日文自學教室的視窗，再雙擊一次啟動檔。');
  return 1;
}

function portTaken() {
  complain(
    `連接埠 ${PORT} 已經被別的程式占用，日文自學教室沒辦法啟動。`,
    `學習紀錄是跟著 http://localhost:${PORT} 這個網址存的，所以不能改用別的連接埠。`,
    `請先關掉占用 ${PORT} 的程式（不知道是哪一個的話，重新開機最簡單），再重新執行一次。`,
  );
  return 1;
}

/** 回傳結束代碼；網站開好之後回傳 undefined，程式繼續執行到視窗關掉為止 */
async function main() {
  step = '檢查 Node.js 版本';
  if (!isSupportedNode(process.versions.node)) {
    complain(
      `你的 Node.js 版本是 v${process.versions.node}，太舊了（日文自學教室需要 ${MIN_NODE.major}.${MIN_NODE.minor} 以上）。`,
      '請到 https://nodejs.org/ 下載安裝最新的 LTS 版，裝好後再重新執行一次。',
    );
    openBrowser('https://nodejs.org/');
    return 1;
  }

  // 先看連接埠：網站已經在執行的話，不要在它底下重新安裝或建置
  step = '檢查連接埠';
  const portState = await checkPort(PORT);
  if (portState === 'app') return openRunningApp();
  if (portState === 'other') return portTaken();

  // 同時雙擊了兩次啟動檔：只讓一個視窗安裝和建置，另一個等網站開好
  step = '等待另一個視窗';
  const waited = !acquireLock(root);
  if (waited) {
    const code = await waitForOtherWindow();
    if (code !== undefined) return code;
  }
  // 另一個視窗是網站開好之後才放開鎖：拿到鎖的前一刻它可能剛好開好了，再確認一次，不要在它底下重新建置
  const again = await checkPort(PORT);
  if (again !== 'free') {
    releaseLock(root);
    if (again === 'other') return portTaken();
    return waited ? otherWindowDone() : openRunningApp();
  }
  if (waited) say('另一個視窗沒有把網站開起來，改由這個視窗繼續。');
  const stopKeeping = keepLock(root);
  process.on('exit', () => releaseLock(root));

  step = '安裝套件';
  if (!existsSync(join(root, 'package-lock.json'))) {
    complain('找不到 package-lock.json，專案資料夾可能不完整。請重新下載整個專案資料夾後再試一次。');
    return 1;
  }
  if (!depsInstalled(root)) {
    say(
      existsSync(join(root, 'node_modules'))
        ? '套件沒有裝完整或需要更新，正在重新安裝（約 1～2 分鐘，需要網路）…'
        : '第一次執行，正在安裝需要的套件（約 1～2 分鐘，需要網路）…',
    );
    const installed = await runNpmCi(root);
    if (installed === 'missing') {
      complain(
        '',
        '找不到 npm（安裝套件用的程式，通常會和 Node.js 一起裝好）。',
        '請到 https://nodejs.org/ 重新安裝 LTS 版（安裝時保留預設的選項），裝好後再雙擊一次啟動檔。',
      );
      openBrowser('https://nodejs.org/');
      return 1;
    }
    if (installed !== 'ok') {
      complain('', '套件安裝失敗。請確認網路連線正常，再雙擊一次啟動檔（會自動重新安裝）。');
      return 1;
    }
    writeStamp(root);
    say('套件安裝完成。');
  }

  step = '建置網站';
  say('正在建置網站…');
  let vite;
  try {
    vite = await import('vite');
  } catch (err) {
    // 套件裝好之後又被刪掉或損壞了：清掉安裝印記，下次啟動就會自動重新安裝
    removeStamp(root);
    complain(
      `載入建置工具失敗：${err instanceof Error ? err.message : String(err)}`,
      '',
      '套件好像壞掉了。請再雙擊一次啟動檔，會自動重新安裝。',
    );
    return 1;
  }
  const { build, preview } = vite;
  await build({ root, logLevel: 'warn' });

  step = '啟動網站';
  try {
    await preview({ root, logLevel: 'warn', preview: { port: PORT, strictPort: true, open: true } });
  } catch (err) {
    // 建置的時候，另一個視窗剛好先把網站開起來了
    if (err instanceof Error && /already in use/i.test(err.message)) {
      const again = await checkPort(PORT);
      if (again === 'app') return openRunningApp();
      if (again === 'other') return portTaken();
    }
    throw err;
  }
  // 網站開好了，之後再雙擊啟動檔會看到網站在執行，不需要鎖了
  stopKeeping();
  releaseLock(root);
  say(
    '',
    `日文自學教室已經開好了：${APP_URL}`,
    '瀏覽器會自動打開；如果沒有，請自己在瀏覽器輸入上面的網址。',
    '使用時請讓這個視窗開著；關掉這個視窗（或按 Ctrl+C），網站就會停止。',
  );
  return undefined;
}

function reportUnexpected(err) {
  const message = err instanceof Error ? err.message : String(err);
  complain('', `${step}時發生預期外的錯誤：${message}`, '可以把這個視窗的內容截圖，給協助你的人看。');
}

/** 讓輸出自然寫完再結束；萬一有東西卡住，幾秒後強制結束 */
function finish(code) {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 3000).unref();
}

process.on('uncaughtException', (err) => {
  reportUnexpected(err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  reportUnexpected(err);
  process.exit(1);
});

main().then(
  (code) => {
    if (code !== undefined) finish(code);
  },
  (err) => {
    reportUnexpected(err);
    finish(1);
  },
);
