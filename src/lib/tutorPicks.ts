/**
 * 首頁推薦的 AI 家教情境：先推薦現在這一課搭配的情境，其餘照日期在全部情境裡輪流（每天換一批，三個不重複）。
 * 還在學五十音、上 N5 課程時，不推薦只出現在 N4 課程的情境（請假、接待客戶…要用 N4 的文法）。
 */
import { COURSE_LESSONS } from '../data/lessons/meta';
import { SCENARIOS, type Scenario } from '../data/scenarios';
import type { LessonProgress } from '../state';
import { daysBetween } from './date';
import { nextLesson, suggestedLevel } from './progress';

/** 只出現在 N4 課程的情境：課程裡第一次連到它的課是 N4 的課（情境資料沒有標程度） */
export const N4_ONLY_SCENARIOS: ReadonlySet<string> = new Set(
  SCENARIOS.filter((s) => COURSE_LESSONS.find((l) => l.tutor === s.id)?.level === 'n4').map((s) => s.id),
);

export function homeScenarios(progress: LessonProgress, now: number, count = 3): Scenario[] {
  const next = nextLesson(progress);
  const current = next?.kind === 'course' && next.tutor ? SCENARIOS.find((s) => s.id === next.tutor) : undefined;
  const n4 = suggestedLevel(progress) === 'n4';
  const pool = SCENARIOS.filter((s) => s !== current && (n4 || !N4_ONLY_SCENARIOS.has(s.id)));
  const picks = current ? [current] : [];
  // 一天往後移一批（今天推薦的下一天就換掉），整份清單輪完再從頭
  const step = count - picks.length;
  const start = (((daysBetween(0, now) * step) % pool.length) + pool.length) % pool.length;
  for (let i = 0; picks.length < count && i < pool.length; i++) picks.push(pool[(start + i) % pool.length]);
  return picks;
}
