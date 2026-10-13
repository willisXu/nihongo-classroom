/*
 * 日文自學教室的 service worker：讓網站可以離線使用、加到主畫面當 App 用。
 *
 * 這是範本。建置時 scripts/nk-pwa.mjs 會在最前面加上兩個常數，輸出成 dist/sw.js：
 *   VERSION   這一版的代號（預先下載檔案的內容雜湊；內容沒變就不會變）
 *   PRECACHE  要預先下載的檔案，相對於網站根目錄
 *
 * - 安裝：把 PRECACHE 的檔案全部下載進這一版的快取（上一版就有的同一個檔直接沿用，不重複下載）。
 * - 開網站（導覽到首頁）：先向伺服器拿最新的 index.html；離線、伺服器出錯或等太久，改用快取裡的那一版。
 *   所以有網路時打開一定是最新版，沒網路時是上次下載好的那一版。
 * - 其他檔案：在清單裡的直接從快取拿；不在清單裡的照常走網路（AI 家教的 API、完整字型、授權全文…）。
 * - 新版裝好後立刻接手並刪掉舊版快取。還開著的舊分頁如果載不到舊檔，網站會自動重新整理（main.tsx）。
 */
/* global VERSION, PRECACHE */

const CACHE_PREFIX = 'nk-precache-';
const CACHE = CACHE_PREFIX + VERSION;
const SCOPE = self.registration.scope;
const INDEX = new URL('index.html', SCOPE).href;
const URLS = new Set(PRECACHE.map((p) => new URL(p, SCOPE).href));
/** 本機（啟動檔、開發伺服器）不設等待上限：伺服器沒開會立刻連不上，有開就一定等它回應 */
const LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);
/** 網路很慢時（例如訊號差），最多等這麼久就先用快取開網站 */
const NAV_TIMEOUT_MS = 3000;

/** assets/ 底下的檔名含內容雜湊：同名就是同一個檔，可以沿用 */
const isHashed = (url) => new URL(url).pathname.includes('/assets/');

/**
 * 內容看起來對不對：要的不是網頁（.js、.css、字型、圖示…），伺服器卻回了網頁，就不是要的檔。
 * 例如本機版重新建置到一半時找不到檔案會回首頁、公共 Wi-Fi 的登入頁。這種內容存進快取的話，
 * 檔名沒變，之後每一版都會沿用，那一頁就一直打不開。
 */
function plausible(url, res) {
  if (!res || !res.ok) return false;
  const path = new URL(url).pathname;
  if (path.endsWith('/') || path.endsWith('.html')) return true;
  return !/^text\/html/i.test(res.headers.get('content-type') || '');
}

async function download(url) {
  // 沒有雜湊的檔（index.html、圖示、manifest）一律向伺服器確認是最新版
  const res = await fetch(url, { cache: isHashed(url) ? 'default' : 'no-cache' });
  if (!res.ok) throw new Error(`下載失敗（${res.status}）：${url}`);
  if (!plausible(url, res)) throw new Error(`下載到的內容不對（伺服器回了網頁）：${url}`);
  // 經過轉址的回應不能拿來回應開網站（瀏覽器會擋下，變成打不開），重新包成一般的回應再存
  if (res.redirected) return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
  return res;
}

async function precache() {
  const cache = await caches.open(CACHE);
  const queue = [...URLS];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      // 上次安裝到一半時已經下載好的：只沿用檔名含雜湊的檔，index.html 這些重新向伺服器確認。
      // 沿用之前也檢查內容（以前存進去的錯內容在這裡換掉）
      if (isHashed(url) && plausible(url, await cache.match(url))) continue;
      const prev = isHashed(url) ? await caches.match(url) : undefined; // 上一版就有的同一個檔
      if (plausible(url, prev)) {
        await cache.put(url, prev);
        continue;
      }
      let res;
      try {
        res = await download(url);
      } catch {
        // 網路不穩時再試一次；還是失敗就整個安裝失敗（不會半套），下次開網站時瀏覽器會重試
        res = await download(url);
      }
      await cache.put(url, res);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));

  // 部署到一半時，伺服器上的 index.html 可能已經是下一版：它要的檔不在這一版的清單裡，就不要裝
  const html = await (await cache.match(INDEX)).text();
  for (const m of html.matchAll(/(?:src|href)="(?:\.\/|\/)?(assets\/[^"?#]+)"/g)) {
    if (!URLS.has(new URL(m[1], SCOPE).href)) throw new Error('index.html 和這一版的檔案清單不一致');
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fromCache(url) {
  const cache = await caches.open(CACHE);
  return cache.match(url);
}

/** 開網站：網路優先，失敗或太慢就用快取的 index.html */
async function navigate(request) {
  // no-cache：一律向伺服器確認（沒變只回 304）。不然瀏覽器可能拿 10 分鐘內的舊 index.html，剛部署的新版要過一陣子才看得到
  const network = fetch(request.url, { cache: 'no-cache', redirect: 'manual' });
  network.catch(() => undefined); // 已經改用快取時，網路後來失敗不用報錯
  let res;
  try {
    res = await (LOCAL ? network : Promise.race([network, wait(NAV_TIMEOUT_MS)]));
  } catch {
    // 離線或連不上
  }
  if (res && (res.ok || res.type === 'opaqueredirect')) return res;
  const cached = await fromCache(INDEX);
  if (cached) return cached;
  return res ?? network;
}

/** 清單裡的檔：從快取拿；快取裡的內容不對（以前存錯的）就丟掉，改從網路拿，拿到對的再存回去 */
async function asset(request, url) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(url);
  if (plausible(url, cached)) return cached;
  if (cached) await cache.delete(url);
  const res = await fetch(request);
  if (plausible(url, res)) await cache.put(url, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const key = url.origin + url.pathname;
  if (request.mode === 'navigate') {
    // 網站用 hash 路由，所有頁面都是首頁；其他網址（授權全文…）照常走網路
    if (key === SCOPE || key === INDEX) event.respondWith(navigate(request));
    return;
  }
  if (URLS.has(key)) event.respondWith(asset(request, key));
});
