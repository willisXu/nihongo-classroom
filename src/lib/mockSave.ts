/**
 * 模擬考的作答存在瀏覽器裡（nk.mock，見 state/index.ts 的 MOCK_KEY）：重新整理、去看課文再回來，都可以接著做。
 * 不放進備份檔（只是一次考試做到一半的狀態）；「全部清除」會清掉。
 */
import type { MockTest } from '../data/types';
import { grade, validAnswer, type Answer } from '../components/Drill';
import { isObj } from '../state/store';

export const partKey = (sectionId: string, partId: string) => `${sectionId}/${partId}`;

/** 每一個題組一個陣列（題目順序），還沒答的是 null */
export interface MockSaved {
  id: string;
  /** 第一次作答的時間（0：還沒開始） */
  started: number;
  answers: Record<string, (Answer | null)[]>;
}

export const emptyMock = (test: MockTest): MockSaved => ({ id: test.id, started: 0, answers: {} });

/** 讀回存著的作答：別份模擬考、題目改過（作答對不上題目）的部分不用 */
export function parseMockSaved(test: MockTest, raw: unknown, now = Date.now()): MockSaved {
  const out = emptyMock(test);
  if (!isObj(raw) || raw.id !== test.id || !isObj(raw.answers)) return out;
  for (const s of test.sections) {
    for (const p of s.parts) {
      const key = partKey(s.id, p.id);
      const arr = raw.answers[key];
      if (!Array.isArray(arr)) continue;
      out.answers[key] = p.items.map((it, i) => (validAnswer(it, arr[i]) ? (arr[i] as Answer) : null));
    }
  }
  if (answeredCount(out)) out.started = typeof raw.started === 'number' && raw.started > 0 ? raw.started : now;
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
