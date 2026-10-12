// nk-fonts.mjs 的型別宣告（給 vite.config.ts 和 tests/fonts.test.ts 型別檢查用）
import type { Plugin } from 'vite';

export interface FontFamilyConfig {
  family: string;
  pkg: string;
  css: string;
  weight: number;
  prefix: string;
  chars: 'display' | 'ja' | 'meaning';
}

export declare const FAMILIES: FontFamilyConfig[];
export declare function collectChars(sources: { file: string; text: string }[]): { display: Set<string>; ja: Set<string>; meaning: Set<string> };
export declare function parseFontsourceCss(css: string): { file: string | undefined; ranges: [number, number][] }[];
export declare function toUnicodeRange(codePoints: number[]): string;
export declare function generateFonts(): Promise<string[]>;
export declare function nkFonts(): Plugin;
