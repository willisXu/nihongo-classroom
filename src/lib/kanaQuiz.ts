/**
 * 假名測驗：出題池、加權抽題（答錯的字更常出現）、干擾選項。
 */
import { ALL_ROWS, LOOKALIKE, SEION_CELLS, kanaInfo, originText } from '../data/kana';
import type { KanaCell, Script } from '../data/types';
import type { KanaStats } from '../state';

export type QuizScript = Script | 'mix';
export type QuizMode = 'see' | 'listen';

export interface QuizItem {
  key: string;
  ch: string;
  r: string;
  script: Script;
  row: string;
  col: number;
  cell: KanaCell;
}

export interface QuizOption {
  ch: string;
  r: string;
  ok: boolean;
}

/** 範圍選擇用的行：わ・ん 合成一個 */
export const ROW_CHOICES: { id: string; h: string; k: string; group: 'sei' | 'daku' }[] = [
  { id: 'a', h: 'あ', k: 'ア', group: 'sei' },
  { id: 'k', h: 'か', k: 'カ', group: 'sei' },
  { id: 's', h: 'さ', k: 'サ', group: 'sei' },
  { id: 't', h: 'た', k: 'タ', group: 'sei' },
  { id: 'n', h: 'な', k: 'ナ', group: 'sei' },
  { id: 'h', h: 'は', k: 'ハ', group: 'sei' },
  { id: 'm', h: 'ま', k: 'マ', group: 'sei' },
  { id: 'y', h: 'や', k: 'ヤ', group: 'sei' },
  { id: 'r', h: 'ら', k: 'ラ', group: 'sei' },
  { id: 'w', h: 'わ・ん', k: 'ワ・ン', group: 'sei' },
  { id: 'g', h: 'が', k: 'ガ', group: 'daku' },
  { id: 'z', h: 'ざ', k: 'ザ', group: 'daku' },
  { id: 'd', h: 'だ', k: 'ダ', group: 'daku' },
  { id: 'b', h: 'ば', k: 'バ', group: 'daku' },
  { id: 'p', h: 'ぱ', k: 'パ', group: 'daku' },
];
export const SEI_ROW_IDS = ROW_CHOICES.filter((r) => r.group === 'sei').map((r) => r.id);
export const ALL_ROW_IDS = ROW_CHOICES.map((r) => r.id);

/** 課程裡的行代號（含 nn）轉成範圍選擇的代號 */
export function normalizeRows(rows: string[]): string[] {
  const set = new Set(rows.map((r) => (r === 'nn' ? 'w' : r)));
  return ALL_ROW_IDS.filter((id) => set.has(id));
}

export function buildPool(rows: string[], script: QuizScript, mode: QuizMode): QuizItem[] {
  const chosen = new Set(normalizeRows(rows));
  const scripts: Script[] = script === 'mix' ? ['h', 'k'] : [script];
  const pool: QuizItem[] = [];
  for (const row of ALL_ROWS) {
    const chip = row.id === 'nn' ? 'w' : row.id;
    if (!chosen.has(chip)) continue;
    row.cells.forEach((cell, col) => {
      if (!cell) return;
      if (cell.h === 'ぢ' || cell.h === 'づ') return; // 和 じ・ず 同音，測驗不出
      if (mode === 'listen' && cell.h === 'を') return; // 和 お 同音
      for (const s of scripts) {
        const ch = s === 'h' ? cell.h : cell.k;
        pool.push({ key: `${s}:${ch}`, ch, r: cell.r, script: s, row: row.id, col: row.id === 'nn' ? -1 : col, cell });
      }
    });
  }
  return pool;
}

export function weightOf(item: QuizItem, stats: KanaStats): number {
  const e = stats[item.key];
  if (!e) return 3;
  if (e.s >= 3) return 1;
  return 3 + Math.min(e.w, 4) - Math.min(e.s, 2);
}

export function pickItem(pool: QuizItem[], stats: KanaStats, lastKey: string | null, rand: () => number = Math.random): QuizItem {
  const items = pool.length > 1 ? pool.filter((it) => it.key !== lastKey) : pool;
  const w = items.map((it) => weightOf(it, stats));
  const total = w.reduce((a, b) => a + b, 0);
  let x = rand() * total;
  for (let i = 0; i < items.length; i++) {
    x -= w[i];
    if (x <= 0) return items[i];
  }
  return items[items.length - 1];
}

function shuffle<T>(a: T[], rand: () => number): T[] {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 4 個選項：1 個正解 + 3 個干擾（長得像的字、同行同段的字優先） */
export function makeOptions(item: QuizItem, pool: QuizItem[], mode: QuizMode, rand: () => number = Math.random): QuizOption[] {
  const s = item.script;
  const out: QuizOption[] = [];
  const push = (ch: string) => {
    const inf = kanaInfo(ch);
    if (!inf || inf.kind === 'yoon') return;
    const c = inf.cell;
    if (c.h === 'ぢ' || c.h === 'づ') return;
    // を 和 お 同音（網站其他地方也把 を 標成 o）：兩個字互相不當干擾選項；聽音題 を 一律不出
    if ((c.h === 'を' && item.cell.h === 'お') || (c.h === 'お' && item.cell.h === 'を')) return;
    if (mode === 'listen' && c.h === 'を') return;
    const opt = { ch: s === 'h' ? c.h : c.k, r: c.r, ok: false };
    if (opt.r === item.r || out.some((o) => o.r === opt.r || o.ch === opt.ch)) return;
    out.push(opt);
  };
  const look = shuffle(LOOKALIKE[item.ch] ?? [], rand);
  if (look.length) push(look[0]);
  const near = shuffle(
    pool.filter((p) => p.script === s && p.key !== item.key && (p.col === item.col || p.row === item.row)),
    rand,
  );
  for (const p of near.slice(0, 2)) if (out.length < 3) push(p.ch);
  for (const p of shuffle(pool.filter((p) => p.script === s), rand)) if (out.length < 3) push(p.ch);
  if (out.length < 3) for (const c of shuffle(SEION_CELLS, rand)) if (out.length < 3) push(s === 'h' ? c.h : c.k);
  return shuffle([...out.slice(0, 3), { ch: item.ch, r: item.r, ok: true }], rand);
}

/** 答錯時的提示：清音給字源，濁音給整行的發音說明 */
export function hintFor(item: QuizItem): string {
  const inf = kanaInfo(item.ch);
  if (!inf) return '';
  if (inf.kind === 'sei') return originText(item.cell, item.script);
  return inf.row?.tip ?? '';
}
