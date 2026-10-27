// nk-fonts.mjs 的型別宣告（給 vite.config.ts 和 tests/fonts.test.ts 型別檢查用）
import type { Plugin } from 'vite';

export interface FontFamilyConfig {
  family: string;
  /** 提供完整字型檔的套件（node_modules 底下的路徑） */
  pkg: string;
  /** 套件裡的字型檔 */
  file: string;
  weight: number;
  prefix: string;
  chars: 'display' | 'ja' | 'meaning';
  /** 英數、假名怎麼分組（見 BASE_GROUPS） */
  base: 'split' | 'whole';
  /** 幾個檔都有的字算「常用」 */
  core: number;
  /** 每個檔最多幾個字 */
  chunk: number;
  /** 不算常用、但幾課都有的字放進「課文共用」組 */
  lessonCore?: number;
  /** 課文共用組每個檔最多幾個字 */
  lessonChunk?: number;
}

/** 選擇器的一層：標籤（沒有就是 null）和 class */
export interface SelectorPart {
  tag: string | null;
  classes: string[];
}

export interface GroupFile {
  file: string;
  text: string;
  /** 這個檔收到的字 */
  chars: Set<string>;
  /** 這個檔裡用這套字型顯示的字 */
  hot: Set<string>;
}

export declare const FAMILIES: FontFamilyConfig[];
export declare const BASE_GROUPS: Record<'split' | 'whole', [string, [number, number][]][]>;
export declare function objectTops(text: string): string[];
export declare function collectChars(sources: { file: string; text: string }[]): { display: Set<string>; ja: Set<string>; meaning: Set<string> };
export declare function fontSelectors(css: string, test: (declarations: string) => boolean): SelectorPart[][];
export declare function hotText(src: string, selectors: SelectorPart[][]): string;
export declare function displayHotChars(source: { file: string; text: string }, selectors: SelectorPart[][]): Set<string>;
export declare function groupChars(
  chars: Set<string>,
  files: GroupFile[],
  options?: {
    core?: number;
    chunk?: number;
    coreChunk?: number;
    restChunk?: number;
    lessonCore?: number;
    lessonChunk?: number;
    base?: 'split' | 'whole';
    everywhere?: string[];
  },
): { key: string; chars: string[] }[];
export declare function toUnicodeRange(codePoints: number[]): string;
export declare function generateFonts(): Promise<string[]>;
export declare function nkFonts(): Plugin;
