/**
 * 手寫描字的練習範圍：五十音表的行，加上不在表裡、只有手寫才練的小字和長音。
 * 課程的「去寫字」用這一課新教的字決定範圍（測試確認每一課的範圍＝新教的字）。
 */
import { ALL_ROWS, kanaInfo } from '../data/kana';
import type { Script } from '../data/types';
import { normalizeRows } from './kanaQuiz';
import { getStrokePaths } from './strokes';

/* ---------- 手寫才有的範圍（測驗不出）：拗音・促音・長音的小字，和拼外國音的小字・ヴ ---------- */
// 分兩組，照課程教的順序：ャ ュ ョ ッ ー 是第 7 課，ァ ィ ゥ ェ ォ ヴ 是第 8 課（平假名沒有後面這一組）
export const EXTRA_ROWS = [
  { id: 'small', h: 'ゃ・っ', k: 'ャ・ッ・ー', group: 'small' as const },
  { id: 'foreign', h: '', k: 'ァ・ヴ', group: 'small' as const },
];
export const EXTRA_CHARS: Record<string, Record<Script, string[]>> = {
  small: { h: ['ゃ', 'ゅ', 'ょ', 'っ'], k: ['ャ', 'ュ', 'ョ', 'ッ', 'ー'] },
  foreign: { h: [], k: ['ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ヴ'] },
};

/** 不在五十音表裡的字：屬於哪一組範圍、哪一種文字 */
export function extraOf(ch: string): { row: string; script: Script } | undefined {
  for (const [row, chars] of Object.entries(EXTRA_CHARS)) {
    if (chars.h.includes(ch)) return { row, script: 'h' };
    if (chars.k.includes(ch)) return { row, script: 'k' };
  }
  return undefined;
}

/** 範圍代號整理成固定順序（小字放最後） */
export function normalizeWriteRows(rows: string[]): string[] {
  return [...normalizeRows(rows), ...EXTRA_ROWS.map((r) => r.id).filter((id) => rows.includes(id))];
}

/** 這種文字有字的範圍（平假名沒有「拼外國音」那一組） */
export function rowsFor(rows: string[], script: Script): string[] {
  return rows.filter((id) => !(id in EXTRA_CHARS) || EXTRA_CHARS[id][script].length > 0);
}

/** 練習範圍內的字（手寫也練 ぢ、づ、を和小字，測驗則不出） */
export function writingChars(rows: string[], script: Script): string[] {
  const chosen = new Set(normalizeWriteRows(rows));
  const out: string[] = [];
  for (const row of ALL_ROWS) {
    if (!chosen.has(row.id === 'nn' ? 'w' : row.id)) continue;
    for (const c of row.cells) {
      if (!c) continue;
      const ch = script === 'h' ? c.h : c.k;
      if (getStrokePaths(ch)) out.push(ch);
    }
  }
  for (const r of EXTRA_ROWS) {
    if (chosen.has(r.id)) for (const ch of EXTRA_CHARS[r.id][script]) if (getStrokePaths(ch)) out.push(ch);
  }
  return out;
}

/**
 * 一課的手寫範圍：這一課新教的字所在的行（小字、長音放在最後那兩組）。
 * 不用測驗的範圍：第 6 課的測驗是全部平假名複習，新教的卻是 ゃ ゅ ょ っ。
 */
export function lessonWriteRows(newKana: string[]): string[] {
  const rows = new Set<string>();
  for (const ch of newKana) {
    const extra = extraOf(ch);
    if (extra) rows.add(extra.row);
    else {
      const inf = kanaInfo(ch);
      if (inf?.row) rows.add(inf.row.id === 'nn' ? 'w' : inf.row.id);
    }
  }
  return normalizeWriteRows([...rows]);
}
