// nk-pwa.mjs 的型別宣告（給 vite.config.ts 和 tests/pwa.test.ts 型別檢查用）
import type { Plugin } from 'vite';

export declare function precacheList(files: string[]): string[];
export declare function buildServiceWorker(
  files: { path: string; content: string | Uint8Array }[],
  template?: string,
): { version: string; list: string[]; code: string };
export declare function nkPwa(): Plugin;
