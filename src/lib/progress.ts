/** 由各項紀錄推算的進度數字 */
import { SEION_CELLS } from '../data/kana';
import { LESSON_META } from '../data/lessons/meta';
import type { LessonMeta } from '../data/types';
import { kanaLevel, type Activity, type KanaStats, type LessonProgress, type TutorLevel } from '../state';
import { addDays, studyDayKey, studyDayStart } from './date';
import { buildPool } from './kanaQuiz';

export const HIRA_KEYS = SEION_CELLS.map((c) => `h:${c.h}`);
export const KATA_KEYS = SEION_CELLS.map((c) => `k:${c.k}`);

export function countMastered(stats: KanaStats, keys: string[]): number {
  return keys.filter((k) => kanaLevel(stats, k) === 2).length;
}

/** 一課的測驗範圍（key 清單） */
export function lessonQuizKeys(lesson: LessonMeta): string[] {
  return buildPool(lesson.quiz.rows, lesson.quiz.script, 'see').map((it) => it.key);
}

/** 下一堂要上的課（全部完成時回傳 undefined） */
export function nextLesson(progress: LessonProgress): LessonMeta | undefined {
  return LESSON_META.find((l) => !progress.done[l.id]);
}

export function lessonsDone(progress: LessonProgress): number {
  return LESSON_META.filter((l) => progress.done[l.id]).length;
}

/** 到這一課為止學過的假名 */
export function learnedKana(progress: LessonProgress): string {
  const upTo = nextLesson(progress)?.id ?? LESSON_META.length + 1;
  return LESSON_META.filter((l) => l.id < upTo).flatMap((l) => l.newKana).join('');
}

/**
 * 假名測驗的干擾選項可以用的字：學過的課教的字、測驗做過的字、加上這次的範圍。
 * 還沒教的字不拿來當選項（第 1 課的題目不會冒出 は、ち）。
 */
export function quizKnownChars(stats: KanaStats, progress: LessonProgress, scope: { ch: string }[]): Set<string> {
  const known = new Set<string>(learnedKana(progress));
  for (const key of Object.keys(stats)) known.add(key.slice(key.indexOf(':') + 1));
  for (const it of scope) known.add(it.ch);
  return known;
}

/** 連續學習天數：從今天（今天還沒學就從昨天）往回數 */
export function streak(activity: Activity, now: number): number {
  let day = studyDayStart(now);
  if (!hasActivity(activity, studyDayKey(day))) day = addDays(day, -1);
  let n = 0;
  while (hasActivity(activity, studyDayKey(day))) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

function hasActivity(activity: Activity, key: string): boolean {
  const d = activity[key];
  return !!d && Object.values(d).some((v) => (v ?? 0) > 0);
}

export function todayActivity(activity: Activity, now: number) {
  return activity[studyDayKey(now)] ?? {};
}

/** AI 家教的建議程度：五十音還沒學完就用「只用假名」 */
export function suggestedLevel(progress: LessonProgress): TutorLevel {
  return lessonsDone(progress) >= LESSON_META.length ? 'n5' : 'kana';
}
