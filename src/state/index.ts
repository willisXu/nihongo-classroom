import { createStore, isObj, num, bool, str, oneOf, readJSON, removeKey } from './store';
import { SEION_CELLS } from '../data/kana';
import { isCardId } from '../data/vocab/meta';
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
  /** 單字卡翻到下一張時自動念 */
  autoplay: boolean;
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
  // 以前「自動發音」另外存在 nk.autoplay（沒有放進備份）：還沒有新設定時沿用舊的
  autoplay: readJSON('nk.autoplay') !== false,
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
    autoplay: bool(raw.autoplay, d.autoplay),
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
  // 自動發音改存在設定裡了：舊的那一份用不到，拿掉才不會在匯入舊備份時又被沿用
  if ('autoplay' in patch) removeKey('nk.autoplay');
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

/** 清除假名測驗紀錄：連同學習紀錄頁的假名曲線一起清掉，曲線才不會停在舊的數字 */
export function resetKanaProgress() {
  kanaStore.reset();
  kanaDaysStore.reset();
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
  /** 每一課第一次完成的時間：取消完成時留著，再勾回去沿用原本的日期，學習日曆也不會多記一課 */
  first?: Record<string, number>;
}

export const lessonStore = createStore<LessonProgress>('nk.lessons', () => ({ done: {}, hw: {} }), (raw) => {
  const out: LessonProgress = { done: {}, hw: {} };
  if (!isObj(raw)) return out;
  if (isObj(raw.done)) for (const [k, v] of Object.entries(raw.done)) if (typeof v === 'number') out.done[k] = v;
  if (isObj(raw.hw)) for (const [k, v] of Object.entries(raw.hw)) if (v === true) out.hw[k] = true;
  if (isObj(raw.first)) {
    const first: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.first)) if (typeof v === 'number') first[k] = v;
    if (Object.keys(first).length) out.first = first;
  }
  return out;
});

export function setLessonDone(id: number, done: boolean) {
  const p = lessonStore.get();
  if (!!p.done[id] === done) return;
  const first = { ...p.first };
  const already = first[id] ?? p.done[id];
  const next = { ...p.done };
  if (done) next[id] = already ?? Date.now();
  else {
    if (already) first[id] = already;
    delete next[id];
  }
  lessonStore.set({ ...p, done: next, ...(Object.keys(first).length ? { first } : {}) });
  // 第一次完成才算一次學習（取消再勾回去不重複記）
  if (done && !already) logActivity('lesson');
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
      // 沒有到期時間的卡片不收：補成 0 的話，下次按「記得」會被排到十年後
      if (!isObj(v) || typeof v.due !== 'number' || !Number.isFinite(v.due)) continue;
      const reps = num(v.reps);
      out.cards[id] = {
        due: v.due,
        ivl: num(v.ivl),
        ease: num(v.ease, 2.5),
        reps,
        lapses: num(v.lapses),
        // 沒有記到學習階段：複習過的卡片當成已經畢業的複習卡
        step: num(v.step, reps > 0 ? -1 : 0),
        last: num(v.last),
      };
    }
  }
  if (isObj(raw.days)) {
    for (const [k, v] of Object.entries(raw.days)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && isObj(v)) out.days[k] = { reviews: num(v.reviews), fresh: num(v.fresh), rev: num(v.rev), forgot: num(v.forgot) };
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
/** 一個模型的用量。input 是全部的輸入（含快取），其中 cacheWrite 寫進快取、cacheRead 從快取讀（計價不同） */
export interface ModelUsage {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}
export interface TutorUsage {
  calls: number;
  input: number;
  output: number;
  byModel: Record<string, ModelUsage>;
}
export const usageStore = createStore<TutorUsage>('nk.usage', () => ({ calls: 0, input: 0, output: 0, byModel: {} }), (raw) => {
  const d: TutorUsage = { calls: 0, input: 0, output: 0, byModel: {} };
  if (!isObj(raw)) return d;
  d.calls = num(raw.calls);
  d.input = num(raw.input);
  d.output = num(raw.output);
  if (isObj(raw.byModel)) {
    for (const [k, v] of Object.entries(raw.byModel)) {
      if (isObj(v)) d.byModel[k] = { input: num(v.input), output: num(v.output), cacheWrite: num(v.cacheWrite), cacheRead: num(v.cacheRead) };
    }
  }
  return d;
});

/**
 * 記下 AI 家教的用量。input 是全部的輸入（含快取的部分）。
 * study：算不算一次學習（測試金鑰不算，不然連續學習天數會多一天）
 */
export function addUsage(model: string, input: number, output: number, study = true, cache = { write: 0, read: 0 }) {
  usageStore.set((u) => {
    const m = u.byModel[model] ?? { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    return {
      calls: u.calls + 1,
      input: u.input + input,
      output: u.output + output,
      byModel: {
        ...u.byModel,
        [model]: { input: m.input + input, output: m.output + output, cacheWrite: m.cacheWrite + cache.write, cacheRead: m.cacheRead + cache.read },
      },
    };
  });
  if (study) logActivity('tutor');
}

/* ---------------- 上次匯出備份的時間（提醒用，不放進備份檔） ---------------- */
export const lastExportStore = createStore<number>('nk.lastExport', () => 0, (raw) => num(raw));

export function markExported() {
  lastExportStore.set(Date.now());
}

/* ---------------- 備份：匯出／匯入（不含 API 金鑰） ---------------- */
const BACKUP_STORES = [settingsStore, kanaStore, kanaDaysStore, lessonStore, writingStore, srsStore, missStore, activityStore, usageStore];

/** 這個版本的網站寫出的備份格式 */
const BACKUP_VERSION = 1;

export function exportBackup(): string {
  const data: Record<string, unknown> = {};
  for (const s of BACKUP_STORES) data[s.key] = s.get();
  // 不縮排：全部卡片都學過、用了半年的紀錄，檔案（和匯入前留在瀏覽器的那一份）小一半（約 520 → 270 KB）。
  // 以前縮排的備份檔照樣讀得懂
  return JSON.stringify({ app: 'nihongo-classroom', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data });
}

/** 檢查整個備份檔，回傳裡面的資料和匯出時間；有問題就丟出錯誤訊息（什麼都不改） */
function checkBackup(text: string): { data: Record<string, unknown>; exportedAt: number | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('這不是有效的備份檔（JSON 格式錯誤）。');
  }
  if (!isObj(parsed) || parsed.app !== 'nihongo-classroom' || !isObj(parsed.data)) {
    throw new Error('這個檔案不是日文自學教室的備份。');
  }
  if (num(parsed.version, 1) > BACKUP_VERSION) {
    throw new Error('這個備份是比較新版的網站匯出的。請先重新整理，讓網站更新到最新版，再匯入一次。');
  }
  const data = parsed.data;
  if (BACKUP_STORES.some((s) => s.key in data && !isObj(data[s.key]))) {
    throw new Error('備份檔的內容有問題（有些資料格式不對），這次沒有匯入任何東西。請用「匯出備份」產生的原始檔案。');
  }
  // 一類紀錄都沒有：匯入只會把現有的紀錄清光
  if (!BACKUP_STORES.some((s) => s.key in data)) {
    throw new Error('這個備份檔裡沒有任何學習紀錄，這次沒有匯入。請用「匯出備份」產生的原始檔案。');
  }
  const at = typeof parsed.exportedAt === 'string' ? Date.parse(parsed.exportedAt) : NaN;
  return { data, exportedAt: Number.isFinite(at) ? at : null };
}

/** 備份或目前紀錄的摘要：匯入前讓使用者比一比，避免拿舊的備份蓋掉新的紀錄 */
export interface BackupSummary {
  /** 完成的課 */
  lessons: number;
  /** 熟悉的假名（連對 3 次） */
  kana: number;
  /** 學過的單字卡（這個版本認得的卡片，和學習紀錄頁一致） */
  words: number;
  /** 有學習紀錄的天數 */
  days: number;
}

function summarize(lessons: LessonProgress, kana: KanaStats, srs: SrsData, activity: Activity): BackupSummary {
  return {
    lessons: Object.keys(lessons.done).length,
    kana: Object.keys(kana).filter((k) => kanaLevel(kana, k) === 2).length,
    words: Object.entries(srs.cards).filter(([id, c]) => c.reps > 0 && isCardId(id)).length,
    days: Object.values(activity).filter((d) => Object.values(d).some((v) => (v ?? 0) > 0)).length,
  };
}

export interface BackupPreview {
  /** 備份匯出的時間（很舊的備份可能沒有） */
  exportedAt: number | null;
  backup: BackupSummary;
  current: BackupSummary;
}

/** 匯入前先看備份的內容（不改任何東西）；格式不對時丟出錯誤訊息 */
export function peekBackup(text: string): BackupPreview {
  const { data, exportedAt } = checkBackup(text);
  return {
    exportedAt,
    backup: summarize(lessonStore.parse(data[lessonStore.key]), kanaStore.parse(data[kanaStore.key]), srsStore.parse(data[srsStore.key]), activityStore.parse(data[activityStore.key])),
    current: summarize(lessonStore.get(), kanaStore.get(), srsStore.get(), activityStore.get()),
  };
}

/* ---------- 匯入前的紀錄：匯入錯了可以復原（存不進去時，這次開網頁之內還能復原） ---------- */
const PRE_IMPORT_KEY = 'nk.preImport';
/** 匯入前的紀錄留多久 */
const PRE_IMPORT_DAYS = 30;

export interface PreImport {
  /** 匯入的時間 */
  at: number;
  lastExport: number;
  /** 匯入前的紀錄（和匯出的備份檔同樣格式） */
  backup: string;
}

function readPreImport(): PreImport | null {
  const raw = readJSON(PRE_IMPORT_KEY);
  if (!isObj(raw) || typeof raw.backup !== 'string' || typeof raw.at !== 'number') return null;
  if (Date.now() - raw.at > PRE_IMPORT_DAYS * 86_400_000) {
    removeKey(PRE_IMPORT_KEY);
    return null;
  }
  return { at: raw.at, lastExport: num(raw.lastExport), backup: raw.backup };
}

let preImport: PreImport | null = typeof window === 'undefined' ? null : readPreImport();
const preImportListeners = new Set<() => void>();

function setPreImport(next: PreImport | null) {
  preImport = next;
  try {
    if (next) localStorage.setItem(PRE_IMPORT_KEY, JSON.stringify(next));
    else localStorage.removeItem(PRE_IMPORT_KEY);
  } catch {
    // 空間不夠存不進去：不算存檔失敗（學習紀錄本身還是存得進去），這次開網頁之內仍然可以復原
  }
  preImportListeners.forEach((l) => l());
}

export const preImportStore = {
  get: (): PreImport | null => preImport,
  subscribe(listener: () => void): () => void {
    preImportListeners.add(listener);
    return () => preImportListeners.delete(listener);
  },
};

function applyBackup(data: Record<string, unknown>): number {
  let n = 0;
  for (const s of BACKUP_STORES) {
    if (s.key in data) {
      s.load(data[s.key]);
      n++;
    } else {
      s.reset();
    }
  }
  return n;
}

/**
 * 匯入備份（覆蓋這個瀏覽器的學習紀錄）；回傳匯入了幾類，格式不對時丟出錯誤訊息。
 * 先檢查整個檔案，有問題就什麼都不改，不會只還原一半；
 * 備份裡沒有的項目（比較舊的備份還沒有錯題本、假名曲線）清空，不和原本的紀錄混在一起。
 * 匯入前先把目前的紀錄留一份，可以用 undoImport 復原。
 */
export function importBackup(text: string): number {
  const { data } = checkBackup(text);
  setPreImport({ at: Date.now(), lastExport: lastExportStore.get(), backup: exportBackup() });
  const n = applyBackup(data);
  // 現在這個瀏覽器的紀錄和備份檔一樣：從現在起算「多久沒備份」，不會一匯入就提醒備份
  markExported();
  return n;
}

/** 換回匯入前的紀錄；回傳還原了幾類 */
export function undoImport(): number {
  const snap = preImport;
  if (!snap) throw new Error('沒有匯入前的紀錄可以復原。');
  const n = applyBackup(checkBackup(snap.backup).data);
  lastExportStore.set(snap.lastExport);
  setPreImport(null);
  return n;
}

export function resetAllProgress() {
  for (const s of [kanaStore, kanaDaysStore, lessonStore, writingStore, srsStore, missStore, activityStore, usageStore]) s.reset();
  // 全部清除就是全部：匯入前留的那一份也不留
  setPreImport(null);
}

