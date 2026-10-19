import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createTcpServer, type AddressInfo, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import viteConfig from '../vite.config';
import {
  APP_NAME,
  LOCK_NAME,
  LOCK_STALE_MS,
  PORT,
  STAMP_NAME,
  acquireLock,
  browserCommand,
  checkPort,
  depsInstalled,
  expectedStamp,
  isCommandMissing,
  isSupportedNode,
  looksLikeThisApp,
  parseNodeVersion,
  processAlive,
  releaseLock,
  removeStamp,
  writeStamp,
} from '../scripts/start-lib.mjs';

describe('Node.js version check', () => {
  it.each([
    ['v22.11.0', false],
    ['v22.11.9', false],
    ['v22.12.0', true],
    ['v22.12.1', true],
    ['v22.22.0', true],
    ['v23.0.0', true],
    ['v24.1.0', true],
    ['v26.0.0', true],
    ['v21.7.3', false],
    ['v20.19.0', false],
    ['v18.20.4', false],
    ['v8.17.0', false],
    ['22.12.0', true],
    ['v23.0.0-nightly20260101', true],
    ['', false],
    ['not a version', false],
  ])('%s → %s', (version, ok) => {
    expect(isSupportedNode(version)).toBe(ok);
  });

  it('compares the minor version only within the same major', () => {
    expect(isSupportedNode('v23.0.0', { major: 22, minor: 12 })).toBe(true);
    expect(isSupportedNode('v22.0.0', { major: 22, minor: 0 })).toBe(true);
    expect(parseNodeVersion('v22.12.3')).toEqual({ major: 22, minor: 12, patch: 3 });
    expect(parseNodeVersion('nope')).toBeNull();
  });
});

describe('fixed port', () => {
  it('start.mjs and vite.config.ts use the same strict port', () => {
    expect(PORT).toBe(5288);
    expect(viteConfig.preview?.port).toBe(PORT);
    expect(viteConfig.preview?.strictPort).toBe(true);
    expect(viteConfig.server?.port).toBe(PORT);
    expect(viteConfig.server?.strictPort).toBe(true);
  });

  it('publishes the bundled packages’ licences next to index.html', () => {
    expect(viteConfig.build?.license).toEqual({ fileName: 'THIRD-PARTY-LICENSES.md' });
  });
});

describe('install stamp', () => {
  let dir: string;
  const lock = '{"name":"nihongo-classroom","lockfileVersion":3}\n';
  const sha = createHash('sha256').update(lock).digest('hex');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nk-start-'));
    writeFileSync(join(dir, 'package-lock.json'), lock);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const installNodeModules = () => {
    mkdirSync(join(dir, 'node_modules'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', '.package-lock.json'), '{}');
  };

  it('contains the sha256 of package-lock.json plus the platform', () => {
    expect(expectedStamp(dir, 'win32', 'x64')).toBe(`${sha} win32-x64`);
  });

  it('needs an install when node_modules is missing', () => {
    expect(depsInstalled(dir)).toBe(false);
  });

  it('needs an install when node_modules exists but has no stamp (interrupted install)', () => {
    mkdirSync(join(dir, 'node_modules', 'vite'), { recursive: true });
    expect(depsInstalled(dir)).toBe(false);
    installNodeModules();
    expect(depsInstalled(dir)).toBe(false);
  });

  it('needs an install when npm never finished (no .package-lock.json) even with a stamp', () => {
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'node_modules', STAMP_NAME), `${expectedStamp(dir)}\n`);
    expect(depsInstalled(dir)).toBe(false);
  });

  it('is installed once the stamp matches, and not after the stamp is removed', () => {
    installNodeModules();
    writeStamp(dir);
    expect(depsInstalled(dir)).toBe(true);
    removeStamp(dir);
    expect(depsInstalled(dir)).toBe(false);
    expect(() => removeStamp(dir)).not.toThrow();
  });

  it('reinstalls after package-lock.json changes', () => {
    installNodeModules();
    writeStamp(dir);
    writeFileSync(join(dir, 'package-lock.json'), lock.replace('3', '4'));
    expect(depsInstalled(dir)).toBe(false);
  });

  it('a manual npm ci / npm install writes the stamp too (postinstall), so the launcher does not reinstall', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts.postinstall).toBe('node scripts/stamp.mjs');
    // 在暫存資料夾裡照 npm 的方式跑：scripts/stamp.mjs 用自己所在的位置找專案根目錄
    mkdirSync(join(dir, 'scripts'));
    for (const f of ['stamp.mjs', 'start-lib.mjs']) writeFileSync(join(dir, 'scripts', f), readFileSync(join(__dirname, '..', 'scripts', f)));
    installNodeModules();
    expect(depsInstalled(dir)).toBe(false);
    const run = spawnSync(process.execPath, [join(dir, 'scripts', 'stamp.mjs')], { cwd: tmpdir(), encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(depsInstalled(dir)).toBe(true);
    // 沒有 node_modules（安裝失敗）時不會出錯，安裝本身不受影響
    rmSync(join(dir, 'node_modules'), { recursive: true, force: true });
    expect(spawnSync(process.execPath, [join(dir, 'scripts', 'stamp.mjs')], { encoding: 'utf8' }).status).toBe(0);
  });

  it('reinstalls when the folder moves to another OS', () => {
    installNodeModules();
    const otherPlatform = process.platform === 'win32' ? 'darwin' : 'win32';
    writeFileSync(join(dir, 'node_modules', STAMP_NAME), `${expectedStamp(dir, otherPlatform, process.arch)}\n`);
    expect(depsInstalled(dir)).toBe(false);
    expect(expectedStamp(dir, 'darwin', 'arm64')).not.toBe(expectedStamp(dir, 'darwin', 'x64'));
  });
});

describe('start lock (double-clicking the launcher twice)', () => {
  let dir: string;
  const lockFile = () => join(dir, LOCK_NAME);
  // 一定還在的程式（跑測試的這個程式的上層）和一定已經結束的程式
  const other = process.ppid;
  const ended = spawnSync(process.execPath, ['-e', '']).pid!;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nk-lock-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('lets only the first window prepare the site', () => {
    expect(processAlive(other)).toBe(true);
    expect(processAlive(ended)).toBe(false);
    expect(acquireLock(dir, other)).toBe(true);
    expect(readFileSync(lockFile(), 'utf8').trim()).toBe(String(other));
    expect(acquireLock(dir, process.pid)).toBe(false); // 另一個視窗還在忙
    expect(acquireLock(dir, other)).toBe(true); // 自己已經拿著
  });

  it('takes over a lock whose window has closed', () => {
    writeFileSync(lockFile(), `${ended}\n`);
    expect(acquireLock(dir, process.pid)).toBe(true);
    expect(readFileSync(lockFile(), 'utf8').trim()).toBe(String(process.pid));
  });

  it('takes over a lock that has not been refreshed for a while (the number may belong to another program now)', () => {
    writeFileSync(lockFile(), `${other}\n`);
    const old = new Date(Date.now() - LOCK_STALE_MS - 5000);
    utimesSync(lockFile(), old, old);
    expect(acquireLock(dir, process.pid)).toBe(true);
  });

  it('only removes its own lock', () => {
    expect(acquireLock(dir, other)).toBe(true);
    releaseLock(dir, process.pid);
    expect(existsSync(lockFile())).toBe(true);
    releaseLock(dir, other);
    expect(existsSync(lockFile())).toBe(false);
    expect(() => releaseLock(dir, other)).not.toThrow();
  });
});

describe('npm missing', () => {
  it('recognises "command not found" exit codes from cmd and sh', () => {
    expect(isCommandMissing(9009)).toBe(true); // Windows cmd
    expect(isCommandMissing(127)).toBe(true); // macOS / Linux sh
    expect(isCommandMissing(1)).toBe(false);
    expect(isCommandMissing(null)).toBe(false);
  });
});

describe('browser command', () => {
  const url = 'http://localhost:5288/';
  it('uses cmd /c start "" on Windows', () => {
    expect(browserCommand(url, 'win32')).toEqual({ command: 'cmd', args: ['/c', 'start', '', url] });
  });
  it('uses open on macOS and xdg-open elsewhere', () => {
    expect(browserCommand(url, 'darwin')).toEqual({ command: 'open', args: [url] });
    expect(browserCommand(url, 'linux')).toEqual({ command: 'xdg-open', args: [url] });
  });
});

describe('port probe', () => {
  const servers: Server[] = [];
  const listen = (server: Server) =>
    new Promise<number>((resolve) => {
      servers.push(server);
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
    });
  const html = (title: string) => `<!doctype html><html><head><title>${title}</title></head><body></body></html>`;
  const httpServer = (body: string) =>
    createHttpServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(body);
    });
  const fast = { connectTimeoutMs: 500, httpTimeoutMs: 800 };

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
  });

  it('recognises the app by its title', () => {
    expect(looksLikeThisApp(html(APP_NAME))).toBe(true);
    expect(looksLikeThisApp(html('Vite + React'))).toBe(false);
  });

  it('reports a free port', async () => {
    const port = await listen(createTcpServer());
    await new Promise((resolve) => servers.pop()!.close(resolve));
    expect(await checkPort(port, fast)).toBe('free');
  });

  it('reports the app when its page is served there', async () => {
    const port = await listen(httpServer(html(APP_NAME)));
    expect(await checkPort(port, fast)).toBe('app');
  });

  it('reports another program serving a different page', async () => {
    const port = await listen(httpServer(html('Some other app')));
    expect(await checkPort(port, fast)).toBe('other');
  });

  it('reports another program that never answers HTTP', async () => {
    // 讀進資料但永遠不回應（resume 讓它看得到對方斷線，測試結束時才關得掉）
    const port = await listen(createTcpServer((socket) => socket.resume()));
    expect(await checkPort(port, fast)).toBe('other');
  });
});
