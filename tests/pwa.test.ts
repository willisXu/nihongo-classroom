import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildServiceWorker, precacheList } from '../scripts/nk-pwa.mjs';

/* ---------------- 安裝成 App：manifest 與圖示 ---------------- */

/** PNG 的寬高（IHDR 區塊） */
function pngSize(file: string): [number, number] {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString('latin1')).toBe('PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('安裝成 App', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  const html = readFileSync('index.html', 'utf8');

  it('manifest 的圖示都在，尺寸和宣告的一樣，也有給 Android 遮罩用的', () => {
    expect(manifest.start_url).toBe('./');
    expect(manifest.display).toBe('standalone');
    for (const icon of manifest.icons) {
      const [w, h] = pngSize(`public/${icon.src}`);
      expect(`${w}x${h}`).toBe(icon.sizes);
    }
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
    expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
  });

  it('捷徑都指向網站裡的頁面', () => {
    for (const s of manifest.shortcuts) expect(s.url).toMatch(/^\.\/#\/[a-z]/);
  });

  it('index.html 連到 manifest 和 iPhone 主畫面圖示', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    const apple = /<link rel="apple-touch-icon" href="\/([^"]+)"/.exec(html)?.[1];
    expect(apple && pngSize(`public/${apple}`)).toEqual([180, 180]);
  });
});

/* ---------------- 預先下載清單 ---------------- */

describe('離線快取：要預先下載哪些檔', () => {
  it('收主程式、樣式、裁切字型、圖示；不收完整字型和授權全文', () => {
    const list = precacheList([
      'index.html',
      'sw.js',
      'favicon.svg',
      'manifest.webmanifest',
      'icons/icon-192.png',
      'icons/maskable-512.png',
      'assets/index-Ab12.js',
      'assets/index-Cd34.css',
      'assets/display-0-Xy.woff2',
      'assets/kana-12-Zz.woff2',
      'assets/meaning-3-Qq.woff2',
      'assets/klee-one-19-600-normal-MM.woff2',
      'FONT-LICENSES.txt',
      'THIRD-PARTY-LICENSES.md',
    ]);
    expect(list).toEqual([
      'assets/display-0-Xy.woff2',
      'assets/index-Ab12.js',
      'assets/index-Cd34.css',
      'assets/kana-12-Zz.woff2',
      'assets/meaning-3-Qq.woff2',
      'favicon.svg',
      'icons/icon-192.png',
      'icons/maskable-512.png',
      'index.html',
      'manifest.webmanifest',
    ]);
  });

  it('版本代號只跟預先下載的檔案內容有關', () => {
    const files = [
      { path: 'index.html', content: '<script src="./assets/a-1.js"></script>' },
      { path: 'assets/a-1.js', content: 'a' },
      { path: 'FONT-LICENSES.txt', content: 'x' },
    ];
    const a = buildServiceWorker(files);
    expect(a.version).toMatch(/^[0-9a-f]{12}$/);
    expect(buildServiceWorker(files).version).toBe(a.version); // 同樣內容 → 同一版
    const licenseChanged = files.map((f) => (f.path === 'FONT-LICENSES.txt' ? { ...f, content: 'y' } : f));
    expect(buildServiceWorker(licenseChanged).version).toBe(a.version);
    const htmlChanged = files.map((f) => (f.path === 'index.html' ? { ...f, content: `${f.content} ` } : f));
    expect(buildServiceWorker(htmlChanged).version).not.toBe(a.version);
    expect(a.code.startsWith('// 由 scripts/nk-pwa.mjs')).toBe(true);
    expect(a.code).toContain(`const PRECACHE = ${JSON.stringify(['assets/a-1.js', 'index.html'])};`);
  });
});

/* ---------------- service worker 的行為（用假的瀏覽器環境執行 sw.js） ---------------- */

type Listener = (event: unknown) => void;
type Route = { status?: number; body?: string; delay?: number; redirected?: boolean; type?: string } | 'offline';

const LIVE = 'https://example.github.io/nihongo-classroom/';
const LOCAL = 'http://localhost:5288/';
const INDEX_HTML = '<script type="module" src="./assets/index-A1.js"></script><link rel="stylesheet" href="./assets/index-B2.css">';
const SITE = [
  { path: 'index.html', content: INDEX_HTML },
  { path: 'assets/index-A1.js', content: 'main' },
  { path: 'assets/index-B2.css', content: 'css' },
  { path: 'assets/Lesson-C3.js', content: 'lesson' },
  { path: 'assets/kana-0-D4.woff2', content: 'font' },
  { path: 'favicon.svg', content: '<svg/>' },
];

class FakeCache {
  entries = new Map<string, { body: string; status: number; redirected?: boolean; type?: string }>();
  async match(url: string) {
    const e = this.entries.get(url);
    return e ? new Response(e.body, { status: e.status, headers: e.type ? { 'content-type': e.type } : {} }) : undefined;
  }
  async put(url: string, res: Response) {
    this.entries.set(url, { body: await res.text(), status: res.status, redirected: res.redirected, type: res.headers.get('content-type') ?? undefined });
  }
  async delete(url: string) {
    return this.entries.delete(url);
  }
}

function setup(scope: string, routes: Record<string, Route>, site = SITE) {
  const { code } = buildServiceWorker(site);
  const listeners = new Map<string, Listener>();
  const stores = new Map<string, FakeCache>();
  const fetched: string[] = [];
  let skipped = false;
  let claimed = false;

  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new FakeCache());
      return stores.get(name)!;
    },
    async match(url: string) {
      for (const c of stores.values()) {
        const hit = await c.match(url);
        if (hit) return hit;
      }
      return undefined;
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
  };

  const cacheModes = new Map<string, string | undefined>();
  const fakeFetch = (input: string | { url: string }, init?: { cache?: string }) => {
    const url = typeof input === 'string' ? input : input.url;
    fetched.push(url);
    cacheModes.set(url, init?.cache);
    const r = routes[url] ?? { status: 404, body: 'not found' };
    if (r === 'offline') return Promise.reject(new TypeError('Failed to fetch'));
    const res = () => {
      const out = new Response(r.body ?? '', { status: r.status ?? 200, headers: r.type ? { 'content-type': r.type } : {} });
      // 經過轉址的回應（Response 建構子做不出來，直接改掉）
      if (r.redirected) Object.defineProperty(out, 'redirected', { value: true });
      return out;
    };
    return r.delay ? new Promise<Response>((resolve) => setTimeout(() => resolve(res()), r.delay)) : Promise.resolve(res());
  };

  const self = {
    registration: { scope },
    location: new URL('sw.js', scope),
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    skipWaiting: async () => {
      skipped = true;
    },
    clients: {
      claim: async () => {
        claimed = true;
      },
    },
  };
  // 計時一律縮短，測「等太久就用快取」不用真的等 3 秒
  const fastTimeout = (fn: () => void, ms: number) => setTimeout(fn, Math.min(ms, 5));
  runInNewContext(code, { self, caches, fetch: fakeFetch, URL, Response, setTimeout: fastTimeout, console });

  async function lifecycle(type: 'install' | 'activate') {
    let done: Promise<unknown> = Promise.resolve();
    listeners.get(type)!({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  }
  /** 回傳 service worker 的回應；沒有接手（交給瀏覽器照常處理）時回傳 null */
  async function request(url: string, init: { mode?: string; method?: string } = {}) {
    let answer = null as Promise<Response> | null;
    listeners.get('fetch')!({
      request: { url, mode: init.mode ?? 'cors', method: init.method ?? 'GET' },
      respondWith: (p: Promise<Response>) => (answer = p),
    });
    return answer;
  }
  return { lifecycle, request, stores, fetched, cacheModes, state: () => ({ skipped, claimed }) };
}

/** 整個網站都連得到 */
function online(scope: string, site = SITE): Record<string, Route> {
  return Object.fromEntries(site.map((f) => [new URL(f.path, scope).href, { body: f.content }]));
}

describe('service worker', () => {
  it('安裝時下載全部預先下載的檔案，裝好立刻接手', async () => {
    const sw = setup(LIVE, online(LIVE));
    await sw.lifecycle('install');
    const [name, cache] = [...sw.stores.entries()][0];
    expect(name).toMatch(/^nk-precache-[0-9a-f]{12}$/);
    expect([...cache.entries.keys()].sort()).toEqual(SITE.map((f) => new URL(f.path, LIVE).href).sort());
    expect(sw.state().skipped).toBe(true);
  });

  it('更新時，上一版就有的同名檔（含雜湊）直接沿用，不重新下載', async () => {
    const sw = setup(LIVE, online(LIVE));
    const prev = new FakeCache();
    prev.entries.set(`${LIVE}assets/kana-0-D4.woff2`, { body: 'font', status: 200 });
    sw.stores.set('nk-precache-000000000000', prev);
    await sw.lifecycle('install');
    expect(sw.fetched).not.toContain(`${LIVE}assets/kana-0-D4.woff2`);
    expect(sw.fetched).toContain(`${LIVE}index.html`); // 沒有雜湊的檔一定重新確認
  });

  it('上次安裝到一半：已經下載的含雜湊檔沿用，index.html 重新下載', async () => {
    const sw = setup(LIVE, online(LIVE));
    const half = new FakeCache();
    half.entries.set(`${LIVE}index.html`, { body: 'half-installed', status: 200 });
    half.entries.set(`${LIVE}assets/index-A1.js`, { body: 'main', status: 200 });
    sw.stores.set(`nk-precache-${buildServiceWorker(SITE).version}`, half);
    await sw.lifecycle('install');
    expect(sw.fetched).not.toContain(`${LIVE}assets/index-A1.js`);
    expect(half.entries.get(`${LIVE}index.html`)?.body).toBe(INDEX_HTML);
  });

  it('要的是程式檔、伺服器卻回了網頁（找不到檔時回首頁、Wi-Fi 登入頁）：不存，安裝失敗，之後再試', async () => {
    const page = { body: '<!doctype html><title>登入</title>', type: 'text/html; charset=utf-8' };
    const sw = setup(LIVE, { ...online(LIVE), [`${LIVE}assets/Lesson-C3.js`]: page });
    await expect(sw.lifecycle('install')).rejects.toThrow('內容不對');
    expect(sw.state().skipped).toBe(false);
  });

  it('以前存錯的內容：更新時不沿用，開到那一頁時也會丟掉、改從網路拿', async () => {
    const lesson = `${LIVE}assets/Lesson-C3.js`;
    const bad = { body: '<!doctype html>', status: 200, type: 'text/html' };
    // 上一版的快取裡存錯了
    const routes = online(LIVE);
    const sw = setup(LIVE, routes);
    const prev = new FakeCache();
    prev.entries.set(lesson, bad);
    sw.stores.set('nk-precache-000000000000', prev);
    await sw.lifecycle('install');
    expect(sw.fetched).toContain(lesson); // 沒有沿用錯的，重新下載
    const cache = [...sw.stores.entries()].find(([n]) => n !== 'nk-precache-000000000000')![1];
    expect(cache.entries.get(lesson)?.body).toBe('lesson');

    // 這一版的快取被弄壞了：開到那一頁時丟掉、改從網路拿，拿到對的再存回去
    cache.entries.set(lesson, bad);
    expect(await (await sw.request(lesson))!.text()).toBe('lesson');
    expect(cache.entries.get(lesson)?.body).toBe('lesson');
  });

  it('經過轉址的回應重新包過再存（不然開網站時瀏覽器會擋下來）', async () => {
    const sw = setup(LIVE, { ...online(LIVE), [`${LIVE}index.html`]: { body: INDEX_HTML, redirected: true } });
    await sw.lifecycle('install');
    const cache = [...sw.stores.values()][0];
    expect(cache.entries.get(`${LIVE}index.html`)).toMatchObject({ body: INDEX_HTML, status: 200, redirected: false });
  });

  it('下載失敗會重試一次；兩次都失敗就整個安裝失敗', async () => {
    let tries = 0;
    const routes = online(LIVE);
    const flaky = `${LIVE}assets/Lesson-C3.js`;
    const sw = setup(LIVE, new Proxy(routes, {
      get(t, k: string) {
        if (k === flaky) return ++tries === 1 ? 'offline' : { body: 'lesson' };
        return t[k];
      },
    }));
    await sw.lifecycle('install');
    expect(tries).toBe(2);

    const broken = setup(LIVE, { ...online(LIVE), [flaky]: { status: 500 } });
    await expect(broken.lifecycle('install')).rejects.toThrow('500');
    expect(broken.state().skipped).toBe(false);
  });

  it('伺服器上的 index.html 已經是別的版本時不安裝', async () => {
    const sw = setup(LIVE, { ...online(LIVE), [`${LIVE}index.html`]: { body: '<script src="./assets/index-NEW.js"></script>' } });
    await expect(sw.lifecycle('install')).rejects.toThrow('不一致');
  });

  it('啟用時刪掉舊版快取，其他快取不動', async () => {
    const sw = setup(LIVE, online(LIVE));
    sw.stores.set('nk-precache-000000000000', new FakeCache());
    sw.stores.set('something-else', new FakeCache());
    await sw.lifecycle('install');
    await sw.lifecycle('activate');
    expect([...sw.stores.keys()].filter((n) => n.startsWith('nk-precache-'))).toHaveLength(1);
    expect(sw.stores.has('something-else')).toBe(true);
    expect(sw.state().claimed).toBe(true);
  });

  it('開網站：有網路用最新版，離線、伺服器出錯或太慢時用快取', async () => {
    const routes = online(LIVE);
    const sw = setup(LIVE, routes);
    await sw.lifecycle('install');
    const open = async () => (await (await sw.request(LIVE, { mode: 'navigate' }))!).text();

    routes[LIVE] = { body: 'NEW VERSION' };
    expect(await open()).toBe('NEW VERSION');
    expect(sw.cacheModes.get(LIVE)).toBe('no-cache'); // 一律向伺服器確認，不用瀏覽器裡 10 分鐘內的舊版
    routes[LIVE] = 'offline';
    expect(await open()).toBe(INDEX_HTML);
    routes[LIVE] = { status: 503, body: 'down' };
    expect(await open()).toBe(INDEX_HTML);
    routes[LIVE] = { body: 'SLOW', delay: 50 };
    expect(await open()).toBe(INDEX_HTML);
  });

  it('本機版不設等待上限：伺服器慢也等它回應', async () => {
    const routes = online(LOCAL);
    const sw = setup(LOCAL, routes);
    await sw.lifecycle('install');
    routes[LOCAL] = { body: 'DEV SERVER', delay: 50 };
    expect(await (await sw.request(LOCAL, { mode: 'navigate' }))!.text()).toBe('DEV SERVER');
  });

  it('清單裡的檔從快取拿；其他請求交給瀏覽器照常處理', async () => {
    const routes = online(LIVE);
    const sw = setup(LIVE, routes);
    await sw.lifecycle('install');
    routes[`${LIVE}assets/Lesson-C3.js`] = 'offline';
    expect(await (await sw.request(`${LIVE}assets/Lesson-C3.js`))!.text()).toBe('lesson');

    expect(await sw.request(`${LIVE}assets/klee-one-1-600-normal-X.woff2`)).toBeNull(); // 不在清單
    expect(await sw.request('https://api.anthropic.com/v1/messages', { method: 'POST' })).toBeNull();
    expect(await sw.request('https://api.anthropic.com/v1/models')).toBeNull(); // 別的網域
    expect(await sw.request(`${LIVE}THIRD-PARTY-LICENSES.md`, { mode: 'navigate' })).toBeNull(); // 不是首頁的導覽
  });
});
