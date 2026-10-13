/**
 * scripts/start.mjs（啟動檔）用的小工具。
 * 只用 Node.js 內建模組：第一次執行、套件還沒安裝之前也要能跑。
 * 也不要用太新的語法或內建函式，舊版 Node 才看得到「版本太舊」的說明，而不是一堆錯誤。
 * 型別宣告在 start-lib.d.mts（給 tests/start.test.ts 用）。
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { connect } from 'node:net';
import { join } from 'node:path';

/** 固定的連接埠，要和 vite.config.ts 一致：學習紀錄（localStorage）是跟著「網址＋連接埠」存的 */
export const PORT = 5288;

/** 網站名稱：首頁 HTML 裡有這幾個字，就當作是日文自學教室 */
export const APP_NAME = '日文自學教室';

/** 最低 Node.js 版本（和 package.json 的 engines、Vite 的需求一致） */
export const MIN_NODE = Object.freeze({ major: 22, minor: 12 });

/** 安裝印記檔：放在 node_modules 裡，npm ci 一開始清掉 node_modules 時會跟著消失 */
export const STAMP_NAME = '.nk-install-stamp';

/** 'v22.12.0' 或 '22.12.0' → { major, minor, patch }；看不懂就回傳 null */
export function parseNodeVersion(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version).trim());
  return m ? { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) } : null;
}

/** 主版號和次版號都要比：22.11 不行、22.12 可以、23 以上都可以 */
export function isSupportedNode(version, min = MIN_NODE) {
  const v = parseNodeVersion(version);
  if (!v) return false;
  return v.major > min.major || (v.major === min.major && v.minor >= min.minor);
}

/** 首頁 HTML 看起來是不是日文自學教室（建置後的預覽和 npm run dev 都算） */
export function looksLikeThisApp(html) {
  return typeof html === 'string' && html.includes(APP_NAME);
}

/** 試著連線到 host:port；有程式在接聽就回傳 true（被拒絕、逾時、不支援 IPv6 都算 false） */
export function isListening(port, host, timeoutMs = 1000) {
  return new Promise((resolve) => {
    let socket;
    try {
      socket = connect({ port, host });
    } catch {
      resolve(false);
      return;
    }
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** 讀 http://host:port/ 的內容（最多約 200 KB）；失敗或逾時回傳空字串 */
export function fetchHomePage(port, host, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let body = '';
    let settled = false;
    let req;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (req) req.destroy();
      resolve(body);
    };
    const timer = setTimeout(finish, timeoutMs);
    try {
      req = request(
        // Host 用 localhost：Vite 只接受 localhost 和 IP 位址，避免被當成 DNS rebinding 擋下來
        { host, port, path: '/', method: 'GET', agent: false, headers: { Host: `localhost:${port}`, Accept: 'text/html' } },
        (res) => {
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
            if (body.length > 200000) finish();
          });
          res.on('end', finish);
          res.on('error', finish);
          res.on('close', finish);
        },
      );
    } catch {
      finish();
      return;
    }
    req.on('error', finish);
    req.end();
  });
}

/**
 * 看看連接埠現在的狀態：
 * - 'free'：沒有程式在用
 * - 'app'：日文自學教室已經在執行
 * - 'other'：被別的程式占用
 * localhost 可能是 IPv4 或 IPv6，兩個都要看（瀏覽器兩個都會試）。
 */
export async function checkPort(port, { connectTimeoutMs = 1000, httpTimeoutMs = 5000 } = {}) {
  const hosts = ['127.0.0.1', '::1'];
  const listening = await Promise.all(hosts.map((host) => isListening(port, host, connectTimeoutMs)));
  const busy = hosts.filter((_, i) => listening[i]);
  if (busy.length === 0) return 'free';
  for (const host of busy) {
    if (looksLikeThisApp(await fetchHomePage(port, host, httpTimeoutMs))) return 'app';
  }
  return 'other';
}

/**
 * 安裝印記的內容：package-lock.json 的 sha256＋作業系統和 CPU。
 * 套件更新（package-lock.json 改了）或整個資料夾搬到另一種電腦時，印記就對不上，會重新安裝。
 */
export function expectedStamp(root, platform = process.platform, arch = process.arch) {
  const hash = createHash('sha256').update(readFileSync(join(root, 'package-lock.json'))).digest('hex');
  return `${hash} ${platform}-${arch}`;
}

/**
 * 套件是否已經完整安裝：npm 安裝成功才會寫 node_modules/.package-lock.json，
 * 而且安裝印記要和目前的 package-lock.json 對得上。
 * 只看「有沒有 node_modules 資料夾」不夠：安裝到一半斷線，資料夾也會在。
 */
export function depsInstalled(root) {
  try {
    if (!existsSync(join(root, 'node_modules', '.package-lock.json'))) return false;
    const stamp = readFileSync(join(root, 'node_modules', STAMP_NAME), 'utf8').trim();
    return stamp === expectedStamp(root);
  } catch {
    return false;
  }
}

/** npm ci 成功之後才寫入安裝印記 */
export function writeStamp(root) {
  writeFileSync(join(root, 'node_modules', STAMP_NAME), `${expectedStamp(root)}\n`);
}

/** 清掉安裝印記：下次啟動就會重新安裝（套件裝好之後才壞掉時用） */
export function removeStamp(root) {
  try {
    rmSync(join(root, 'node_modules', STAMP_NAME), { force: true });
  } catch {
    // 刪不掉也沒關係，只是下次不會自動重裝
  }
}

/** 啟動鎖檔：放在專案資料夾裡，啟動檔安裝套件、建置網站的期間才有 */
export const LOCK_NAME = '.nk-start.lock';
/** 拿著鎖的程式每隔這麼久更新一次鎖檔的時間；超過 LOCK_STALE_MS 沒更新，就當作那個程式已經不在了 */
export const LOCK_HEARTBEAT_MS = 15000;
export const LOCK_STALE_MS = 60000;

/** 這個程式還在不在（訊號 0 只檢查，不會真的送出） */
export function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return Boolean(err) && err.code === 'EPERM'; // 程式在，只是沒有權限
  }
}

/** 鎖檔裡記的程式和鎖檔最後更新的時間；沒有鎖檔回傳 null */
function lockHolder(file) {
  try {
    return { pid: Number.parseInt(readFileSync(file, 'utf8'), 10), at: statSync(file).mtimeMs };
  } catch {
    return null;
  }
}

/**
 * 拿啟動鎖，拿到回傳 true。同時雙擊兩次啟動檔時，只讓第一個安裝套件和建置網站
 * （兩個一起做會把 node_modules 或 dist 弄壞），另一個等網站開好。
 * 拿鎖的程式已經結束（當掉、視窗被關掉），或太久沒有更新鎖檔（例如重新開機後程式代號被別的程式用了），就當作沒有人拿。
 * 寫不了鎖檔（例如資料夾是唯讀的）就不鎖，照舊執行。
 */
export function acquireLock(root, pid = process.pid, now = Date.now()) {
  const file = join(root, LOCK_NAME);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      writeFileSync(file, `${pid}\n`, { flag: 'wx' });
      return true;
    } catch (err) {
      if (!err || err.code !== 'EEXIST') return true;
    }
    const holder = lockHolder(file);
    if (!holder) continue; // 鎖檔剛好被拿掉了：再試一次
    if (holder.pid === pid) return true;
    if (processAlive(holder.pid) && now - holder.at < LOCK_STALE_MS) return false;
    // 舊的鎖：刪掉前再確認一次還是同一個（不要刪到別的視窗剛拿到的鎖）
    const again = lockHolder(file);
    if (again && again.pid === holder.pid && again.at === holder.at) {
      try {
        rmSync(file, { force: true });
      } catch {
        return false;
      }
    }
  }
  return false;
}

/** 拿著鎖的期間，定期更新鎖檔的時間，讓其他視窗知道這邊還在忙。回傳停止更新的函式 */
export function keepLock(root) {
  const file = join(root, LOCK_NAME);
  const timer = setInterval(() => {
    try {
      const t = new Date();
      utimesSync(file, t, t);
    } catch {
      // 鎖檔不見了也沒關係
    }
  }, LOCK_HEARTBEAT_MS);
  timer.unref();
  return () => clearInterval(timer);
}

/** 放開啟動鎖（只刪自己的鎖） */
export function releaseLock(root, pid = process.pid) {
  const file = join(root, LOCK_NAME);
  const holder = lockHolder(file);
  if (!holder || holder.pid !== pid) return;
  try {
    rmSync(file, { force: true });
  } catch {
    // 刪不掉的話，別的視窗看到鎖檔太久沒更新，也會當作沒有人拿
  }
}

/**
 * 執行 npm ci（依 package-lock.json 重新安裝，裝到一半的 node_modules 會先清掉）。
 * Windows 上的 npm 是 npm.cmd，必須透過 shell 執行；整個指令用一個字串傳，路徑由 cwd 指定，
 * 所以資料夾路徑有空白或中文也沒關係。回傳 'ok'、'missing'（找不到 npm）或 'failed'。
 */
export function runNpmCi(root) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('npm ci --no-audit --no-fund --no-update-notifier', { cwd: root, stdio: 'inherit', shell: true });
    } catch {
      resolve('failed');
      return;
    }
    child.once('error', () => resolve('failed'));
    child.once('close', (code) => resolve(code === 0 ? 'ok' : isCommandMissing(code) ? 'missing' : 'failed'));
  });
}

/** 透過 shell 執行時找不到指令的結束代碼：Windows 的 cmd 是 9009，macOS／Linux 的 sh 是 127 */
export function isCommandMissing(code) {
  return code === 9009 || code === 127;
}

/** 用系統預設瀏覽器打開網址的指令（不需要任何套件） */
export function browserCommand(url, platform = process.platform) {
  // start 的第一個引號參數是視窗標題，所以要先給一個空字串（Node 會把它變成 ""）
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', url] };
  if (platform === 'darwin') return { command: 'open', args: [url] };
  return { command: 'xdg-open', args: [url] };
}

/** 打開瀏覽器；打不開也不會讓程式當掉。BROWSER=none 時不打開（和 Vite 一樣） */
export function openBrowser(url) {
  if (String(process.env.BROWSER || '').toLowerCase() === 'none') return false;
  const { command, args } = browserCommand(url);
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
