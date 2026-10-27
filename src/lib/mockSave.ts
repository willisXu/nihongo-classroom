/**
 * 模擬考的作答存在瀏覽器裡（nk.mock，見 state/index.ts 的 MOCK_KEY）：重新整理、去看課文再回來，都可以接著做。
 * 不放進備份檔（只是一次考試做到一半的狀態）；「全部清除」會清掉。
 */
import type { DrillItem, MockTest } from '../data/types';
import { grade, validAnswer, type Answer } from '../components/Drill';
import { isObj } from '../state/store';

export const partKey = (sectionId: string, partId: string) => `${sectionId}/${partId}`;

/** 每一個題組一個陣列（題目順序），還沒答的是 null */
export interface MockSaved {
  id: string;
  /** 第一次作答的時間（0：還沒開始） */
  started: number;
  answers: Record<string, (Answer | null)[]>;
  /** 每個題組作答時的題目內容（partSig）：網站更新改了題目，那個題組的作答就不用 */
  sigs: Record<string, string>;
}

export const emptyMock = (test: MockTest): MockSaved => ({ id: test.id, started: 0, answers: {}, sigs: {} });

/**
 * 題組內容的指紋（題目、選項、答案、詞塊的順序）：題目改過、換了順序，作答就對不上了。
 * 說明（why）和複習的課（lesson）改了不影響作答，不算進去。
 */
export function partSig(items: DrillItem[]): string {
  const text = JSON.stringify(items.map(({ why: _why, lesson: _lesson, ...rest }) => rest));
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** 記下一個題組的作答（連同題目的指紋） */
export function withPartAnswers(test: MockTest, saved: MockSaved, key: string, answers: (Answer | null)[], now = Date.now()): MockSaved {
  const part = test.sections.flatMap((s) => s.parts.map((p) => ({ key: partKey(s.id, p.id), items: p.items }))).find((p) => p.key === key);
  if (!part) return saved;
  return { ...saved, started: saved.started || now, answers: { ...saved.answers, [key]: answers }, sigs: { ...saved.sigs, [key]: partSig(part.items) } };
}

/** 讀回存著的作答：別份模擬考、題目改過（指紋對不上、作答對不上題目）的部分不用 */
export function parseMockSaved(test: MockTest, raw: unknown, now = Date.now()): MockSaved {
  const out = emptyMock(test);
  if (!isObj(raw) || raw.id !== test.id || !isObj(raw.answers)) return out;
  const sigs = isObj(raw.sigs) ? raw.sigs : {};
  for (const s of test.sections) {
    for (const p of s.parts) {
      const key = partKey(s.id, p.id);
      const arr = raw.answers[key];
      const sig = partSig(p.items);
      if (!Array.isArray(arr) || sigs[key] !== sig) continue;
      out.answers[key] = p.items.map((it, i) => (validAnswer(it, arr[i]) ? (arr[i] as Answer) : null));
      out.sigs[key] = sig;
    }
  }
  if (answeredCount(out)) {
    const t = raw.started;
    // 時間壞掉（不是數字、比現在還晚）時當作現在開始，畫面上才不會出現奇怪的日期
    out.started = typeof t === 'number' && Number.isFinite(t) && t > 0 && t <= now ? t : now;
  }
  return out;
}

export const answeredCount = (saved: MockSaved) => Object.values(saved.answers).reduce((n, a) => n + a.filter((x) => x !== null).length, 0);

export interface SectionScore {
  id: string;
  title: string;
  count: number;
  answered: number;
  right: number;
}

/** 照科目算做了幾題、答對幾題；review 是答錯的題目出自哪幾課 */
export function scoreMock(test: MockTest, saved: MockSaved): { rows: SectionScore[]; review: number[] } {
  const review = new Set<number>();
  const rows = test.sections.map((s) => {
    let answered = 0;
    let right = 0;
    let count = 0;
    for (const p of s.parts) {
      const a = saved.answers[partKey(s.id, p.id)] ?? [];
      p.items.forEach((it, i) => {
        count += 1;
        const r = grade(it, a[i]);
        if (r === null) return;
        answered += 1;
        if (r) right += 1;
        else if (it.lesson) review.add(it.lesson);
      });
    }
    return { id: s.id, title: s.title, count, answered, right };
  });
  return { rows, review: [...review].sort((a, b) => a - b) };
}
