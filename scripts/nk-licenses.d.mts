// nk-licenses.mjs 的型別宣告（給 vite.config.ts 和 tests 型別檢查用）
import type { Plugin } from 'vite';

export declare const MISSING_LICENSES: Record<string, string>;
export declare function addMissingLicenses(markdown: string, texts?: Record<string, string>): string;
export declare function nkLicenses(): Plugin;
