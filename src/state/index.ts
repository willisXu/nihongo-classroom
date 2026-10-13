import { createStore, isObj, num, bool, str, oneOf } from './store';
import { SEION_CELLS } from '../data/kana';
import type { CardState } from '../lib/srs';
import { studyDayKey } from '../lib/date';

/* ---------------- 設定 ---------------- */
export type ThemePref = 'system' | 'light' | 'dark';
export type TutorLevel = 'kana' | 'n5' | 'n4';
export const MODEL_IDS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export interface Settings {
  theme: ThemePref;
  /** 慢速發音 */
  slow: boolean;
  /** 指定的日文語音（空字串 = 自動挑選） */
  voiceURI: string;
  /** 單字卡顯示羅馬拼音 */
  showRomaji: boolean;
  /** 每天新單字上限 */
  newPerDay: number;
  model: ModelId;
  tutorLevel: TutorLevel | 'auto';
  showTranslation: boolean;
  showReading: boolean;
  /** 每天提醒的時間（HH:MM），產生行事曆提醒用 */
  remindAt: string;
}

const defaultSettings = (): Settings => ({
  theme: 'system',
  slow: false,
  voiceURI: '',
  showRomaji: true,
  newPerDay: 10,
  model: 'claude-sonnet-5-5',
  tutorLevel: 'auto',
  showTranslation: true,
  showReading: true,
  remindAt: '20:30',
});

export const settingsStore = createStore<Settings>('nk.settings', defaultSettings, (raw) => {
  const d = defaultSettings();
  if (!isObj(raw)) return d;
  return {
    theme: oneOf(raw.theme, ['system', 'light', 'dark'] as const, d.theme),
    slow: bool(raw.slow, d.slow),
    voiceURI: str(raw.voiceURI, d.voiceURI),
    showRomaji: bool(raw.showRomaji, d.showRomaji),
    newPerDay: Math.min(50, Math.max(0, Math.round(num(raw.newPerDay, d.newPerDay)))),
    model: oneOf(raw.model, MODEL_IDS, d.model),
    tutorLevel: oneOf(raw.tutorLevel, ['auto', 'kana', 'n5', 'n4'] as const, d.tutorLevel),
    showTranslation: bool(raw.showTranslation, d.showTranslation),
    showReading: bool(raw.showReading, d.showReading),
    remindAt: typeof raw.remindAt === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.remindAt) ? raw.remindAt : d.remindAt,
  };
});

/** 每天新卡的選項（單字頁和設定頁共用） */
export const NEW_PER_DAY_OPTIONS = [0, 5, 10, 15, 20, 30, 50];

export function updateSettings(patch: Partial<Settings>) {
  settingsStore.set((s) => ({ ...s, ...patch }));
}

/* ---------------- API 金鑰（只存在這個瀏覽器，不會匯出） ---------------- */
export const apiKeyStore = createStore<string>('nk.apiKey', () => '', (raw) => (typeof raw === 'string' ? raw : ''));

/* ---------------- 假名測驗紀錄 ---------------- */
export interface KanaStat {
  /** 答對 */
  c: number;
  /** 答錯 */
  w: number;
  /** 目前連對 */
  s: number;
  /** 最後作答時間 */
  t: number;
}
export type KanaStats = Record<string, KanaStat>;

export const kanaStore = createStore<KanaStats>('nk.kana', () => ({}), (raw) => {
  const out: KanaStats = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!/^[hk]:./u.test(k) || !isObj(v)) continue;
    out[k] = { c: num(v.c), w: num(v.w), s: num(v.s), t: num(v.t) };
  }
  return out;
});

export function recordKana(key: string, ok: boolean) {
  kanaStore.set((all) => {
    const e = all[key] ?? { c: 0, w: 0, s: 0, t: 0 };
    const next: KanaStat = ok ? { c: e.c + 1, w: e.w, s: e.s + 1, t: Date.now() } : { c: e.c, w: e.w + 1, s: 0, t: Date.now() };
    return { ...all, [key]: next };
  });
  snapshotKana();
  logActivity('kana');
}

/* ---------------- 每天的假名熟悉度（學習紀錄頁的進步曲線用） ---------------- */
/** 學習日 → 那天結束時熟悉的平假名、片假名（清音 46 個）數量 */
export type KanaDays = Record<string, { h: number; k: number }>;

export const kanaDaysStore = createStore<KanaDays>('nk.kanaDays', () => ({}), (raw) => {
  const out: KanaDays = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && isObj(v)) out[k] = { h: num(v.h), k: num(v.k) };
  return out;
});

/**
 * 記下今天目前的熟悉數量（每次作答後更新，留下當天最後的數字）。
 * 學習紀錄頁打開時也會記一次：更新前就練過的人，曲線從今天的數字開始。
 */
export function snapshotKana() {
  const stats = kanaStore.get();
  if (!Object.keys(stats).length) return;
  const count = (script: 'h' | 'k') => SEION_CELLS.filter((c) => kanaLevel(stats, `${script}:${c[script]}`) === 2).length;
  const day = studyDayKey(Date.now());
  const h = count('h');
  const k = count('k');
  const prev = kanaDaysStore.get()[day];
  if (prev && prev.h === h && prev.k === k) return;
  kanaDaysStore.set((d) => ({ ...d, [day]: { h, k } }));
}

/** 0 = 還沒練，1 = 練習中，2 = 熟悉（連對 3 次） */
export function kanaLevel(stats: KanaStats, key: string): 0 | 1 | 2 {
  const e = stats[key];
  if (!e || e.c + e.w === 0) return 0;
  return e.s >= 3 ? 2 : 1;
}

/* ---------------- 課程進度 ---------------- */
export interface LessonProgress {
  /** 完成的課 → 完成時間 */
  done: Record<string, number>;
  /** 作業勾選，key = 課次:第幾項 */
  hw: Record<string, boolean>;
}

export const lessonStore = createStore<LessonProgress>('nk.lessons', () => ({ done: {}, hw: {} }), (raw) => {
  const out: LessonProgress = { done: {}, hw: {} };
  if (!isObj(raw)) return out;
  if (isObj(raw.done)) for (const [k, v] of Object.entries(raw.done)) if (typeof v === 'number') out.done[k] = v;
  if (isObj(raw.hw)) for (const [k, v] of Object.entries(raw.hw)) if (v === true) out.hw[k] = true;
  return out;
});

export function setLessonDone(id: number, done: boolean) {
  lessonStore.set((p) => {
    const next = { ...p.done };
    if (done) next[id] = Date.now();
    else delete next[id];
    return { ...p, done: next };
  });
  if (done) logActivity('lesson');
}

export function setHomework(key: string, value: boolean) {
  lessonStore.set((p) => {
    const hw = { ...p.hw };
    if (value) hw[key] = true;
    else delete hw[key];
    return { ...p, hw };
  });
}

/* ---------------- 手寫紀錄 ---------------- */
export interface WritingStat {
  /** 描字完成次數 */
  n: number;
  /** 默寫（不看字）完成次數 */
  recall: number;
  /** 最近一次的錯誤筆數 */
  lastMistakes: number;
  t: number;
}
export type WritingStats = Record<string, WritingStat>;

export const writingStore = createStore<WritingStats>('nk.writing', () => ({}), (raw) => {
  const out: WritingStats = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!isObj(v)) continue;
    out[k] = { n: num(v.n), recall: num(v.recall), lastMistakes: num(v.lastMistakes), t: num(v.t) };
  }
  return out;
});

export function recordWriting(ch: string, mode: 'trace' | 'recall', mistakes: number) {
  writingStore.set((all) => {
    const e = all[ch] ?? { n: 0, recall: 0, lastMistakes: 0, t: 0 };
    return {
      ...all,
      [ch]: {
        n: e.n + (mode === 'trace' ? 1 : 0),
        recall: e.recall + (mode === 'recall' ? 1 : 0),
        lastMistakes: mistakes,
        t: Date.now(),
      },
    };
  });
  logActivity('writing');
}

/* ---------------- 單字卡 ---------------- */
export interface SrsDay {
  /** 作答次數（含新卡和學習中的卡片） */
  reviews: number;
  /** 學了幾張新卡 */
  fresh: number;
  /** 到期複習（已經學會、間隔一天以上的卡片）的次數 */
  rev: number;
  /** 其中按「忘記了」的次數（算「記得的比例」用） */
  forgot: number;
}

export interface SrsData {
  cards: Record<string, CardState>;
  /** 每個學習日的作答紀錄 */
  days: Record<string, SrsDay>;
}

export const srsStore = createStore<SrsData>('nk.srs', () => ({ cards: {}, days: {} }), (raw) => {
  const out: SrsData = { cards: {}, days: {} };
  if (!isObj(raw)) return out;
  if (isObj(raw.cards)) {
    for (const [id, v] of Object.entries(raw.cards)) {
      if (!isObj(v)) continue;
      out.cards[id] = {
        due: num(v.due),
        ivl: num(v.ivl),
        ease: num(v.ease, 2.5),
        reps: num(v.reps),
        lapses: num(v.lapses),
        step: num(v.step),
        last: num(v.last),
      };
    }
  }
  if (isObj(raw.days)) {
    for (const [k, v] of Object.entries(raw.days)) {
      if (isObj(v)) out.days[k] = { reviews: num(v.reviews), fresh: num(v.fresh), rev: num(v.rev), forgot: num(v.forgot) };
    }
  }
  return out;
});

/**
 * 存一次作答。review：這次是不是到期複習（作答前已經是學會的卡片），以及有沒有按「忘記了」，
 * 學習紀錄頁用來算「到期複習時記得的比例」。
 */
export function saveCard(id: string, card: CardState, wasNew: boolean, review?: { due: boolean; forgot: boolean }) {
  const key = studyDayKey(Date.now());
  srsStore.set((d) => {
    const day = d.days[key] ?? { reviews: 0, fresh: 0, rev: 0, forgot: 0 };
    const due = review?.due ? 1 : 0;
    return {
      cards: { ...d.cards, [id]: card },
      days: {
        ...d.days,
        [key]: {
          reviews: day.reviews + 1,
          fresh: day.fresh + (wasNew ? 1 : 0),
          rev: day.rev + due,
          forgot: day.forgot + (due && review?.forgot ? 1 : 0),
        },
      },
    };
  });
  logActivity('review');
}

/* ---------------- 錯題本：單字卡按「忘記了」的紀錄 ---------------- */
export interface VocabMiss {
  /** 按「忘記了」的次數 */
  n: number;
  /** 最後一次忘記的時間 */
  t: number;
  /** 在錯題本按「記住了」的時間；比 t 晚就不算錯題 */
  ok: number;
}
export type VocabMisses = Record<string, VocabMiss>;

export const missStore = createStore<VocabMisses>('nk.misses', () => ({}), (raw) => {
  const out: VocabMisses = {};
  if (!isObj(raw)) return out;
  for (const [id, v] of Object.entries(raw)) if (isObj(v)) out[id] = { n: num(v.n), t: num(v.t), ok: num(v.ok) };
  return out;
});

export function recordVocabMiss(id: string) {
  missStore.set((m) => {
    const e = m[id] ?? { n: 0, t: 0, ok: 0 };
    return { ...m, [id]: { ...e, n: e.n + 1, t: Date.now() } };
  });
}

/** 錯題本裡按「記住了」：之後再忘記才會回到錯題本 */
export function clearVocabMiss(id: string) {
  missStore.set((m) => {
    const e = m[id] ?? { n: 0, t: 0, ok: 0 };
    return { ...m, [id]: { ...e, ok: Date.now() } };
  });
}

/* ---------------- 每日活動（連續天數） ---------------- */
export type ActivityKind = 'kana' | 'writing' | 'review' | 'lesson' | 'tutor';
export type Activity = Record<string, Partial<Record<ActivityKind, number>>>;

export const activityStore = createStore<Activity>('nk.activity', () => ({}), (raw) => {
  const out: Activity = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !isObj(v)) continue;
    const day: Partial<Record<ActivityKind, number>> = {};
    for (const kind of ['kana', 'writing', 'review', 'lesson', 'tutor'] as const) if (typeof v[kind] === 'number') day[kind] = v[kind] as number;
    out[k] = day;
  }
  return out;
});

export function logActivity(kind: ActivityKind) {
  const key = studyDayKey(Date.now());
  activityStore.set((a) => {
    const day = a[key] ?? {};
    return { ...a, [key]: { ...day, [kind]: (day[kind] ?? 0) + 1 } };
  });
}

/* ---------------- AI 家教用量 ---------------- */
export interface TutorUsage {
  calls: number;
  input: number;
  output: number;
  byModel: Record<string, { input: number; output: number }>;
}
export const usageStore = createStore<TutorUsage>('nk.usage', () => ({ calls: 0, input: 0, output: 0, byModel: {} }), (raw) => {
  const d: TutorUsage = { calls: 0, input: 0, output: 0, byModel: {} };
  if (!isObj(raw)) return d;
  d.calls = num(raw.calls);
  d.input = num(raw.input);
  d.output = num(raw.output);
  if (isObj(raw.byModel)) for (const [k, v] of Object.entries(raw.byModel)) if (isObj(v)) d.byModel[k] = { input: num(v.input), output: num(v.output) };
  return d;
});

export function addUsage(model: string, input: number, output: number) {
  usageStore.set((u) => {
    const m = u.byModel[model] ?? { input: 0, output: 0 };
    return {
      calls: u.calls + 1,
      input: u.input + input,
      output: u.output + output,
      byModel: { ...u.byModel, [model]: { input: m.input + input, output: m.output + output } },
    };
  });
  logActivity('tutor');
}

/* ---------------- 上次匯出備份的時間（提醒用，不放進備份檔） ---------------- */
export const lastExportStore = createStore<number>('nk.lastExport', () => 0, (raw) => num(raw));

export function markExported() {
  lastExportStore.set(Date.now());
}

/* ---------------- 備份：匯出／匯入（不含 API 金鑰） ---------------- */
const BACKUP_STORES = [settingsStore, kanaStore, kanaDaysStore, lessonStore, writingStore, srsStore, missStore, activityStore, usageStore];

export function exportBackup(): string {
  const data: Record<string, unknown> = {};
  for (const s of BACKUP_STORES) data[s.key] = s.get();
  return JSON.stringify({ app: 'nihongo-classroom', version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
}

/** 匯入備份；回傳匯入了幾個項目，格式不對時丟出錯誤訊息 */
export function importBackup(text: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('這不是有效的備份檔（JSON 格式錯誤）。');
  }
  if (!isObj(parsed) || parsed.app !== 'nihongo-classroom' || !isObj(parsed.data)) {
    throw new Error('這個檔案不是日文自學教室的備份。');
  }
  let n = 0;
  for (const s of BACKUP_STORES) {
    if (s.key in parsed.data) {
      s.load(parsed.data[s.key]);
      n++;
    }
  }
  return n;
}

export function resetAllProgress() {
  for (const s of [kanaStore, kanaDaysStore, lessonStore, writingStore, srsStore, missStore, activityStore, usageStore]) s.reset();
}

