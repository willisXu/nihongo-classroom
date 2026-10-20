/** 由各項紀錄推算的進度數字 */
import { SEION_CELLS } from '../data/kana';
import { COURSE_LESSONS, KANA_LESSONS, LESSON_META } from '../data/lessons/meta';
import type { CourseLessonMeta, KanaLessonMeta, LessonMeta } from '../data/types';
import { kanaLevel, type Activity, type KanaStats, type LessonProgress, type TutorLevel } from '../state';
import { addDays, studyDayKey, studyDayStart } from './date';
import { buildPool } from './kanaQuiz';

export const HIRA_KEYS = SEION_CELLS.map((c) => `h:${c.h}`);
export const KATA_KEYS = SEION_CELLS.map((c) => `k:${c.k}`);

export function countMastered(stats: KanaStats, keys: string[]): number {
  return keys.filter((k) => kanaLevel(stats, k) === 2).length;
}

/** 一課的測驗範圍（key 清單） */
export function lessonQuizKeys(lesson: KanaLessonMeta): string[] {
  return buildPool(lesson.quiz.rows, lesson.quiz.script, 'see').map((it) => it.key);
}

/** 下一堂要上的課（五十音或 N5，全部完成時回傳 undefined） */
export function nextLesson(progress: LessonProgress): LessonMeta | undefined {
  return LESSON_META.find((l) => !progress.done[l.id]);
}

/** 五十音課程（第 1–8 課）的下一課；五十音都學完時回傳 undefined */
export function nextKanaLesson(progress: LessonProgress): KanaLessonMeta | undefined {
  return KANA_LESSONS.find((l) => !progress.done[l.id]);
}

/** N5 課程的下一課 */
export function nextCourseLesson(progress: LessonProgress): CourseLessonMeta | undefined {
  return COURSE_LESSONS.find((l) => !progress.done[l.id]);
}

/** 完成幾課（五十音和 N5 一起算） */
export function lessonsDone(progress: LessonProgress): number {
  return LESSON_META.filter((l) => progress.done[l.id]).length;
}

export function kanaLessonsDone(progress: LessonProgress): number {
  return KANA_LESSONS.filter((l) => progress.done[l.id]).length;
}

export function courseLessonsDone(progress: LessonProgress): number {
  return COURSE_LESSONS.filter((l) => progress.done[l.id]).length;
}

/** 五十音課程全部完成 */
export function kanaCourseDone(progress: LessonProgress): boolean {
  return kanaLessonsDone(progress) >= KANA_LESSONS.length;
}

/** 到這一課為止學過的假名 */
export function learnedKana(progress: LessonProgress): string {
  const upTo = nextKanaLesson(progress)?.id ?? Infinity;
  return KANA_LESSONS.filter((l) => l.id < upTo).flatMap((l) => l.newKana).join('');
}

/** 完成的 N5 課，加上正在上的那一課（照課的順序） */
function startedCourse(progress: LessonProgress): CourseLessonMeta[] {
  const now = nextCourseLesson(progress);
  // 五十音還沒學完時，N5 的第一課還不算「正在上」
  const current = kanaCourseDone(progress) ? now?.id : undefined;
  return COURSE_LESSONS.filter((l) => progress.done[l.id] || l.id === current);
}

/**
 * 學過的 N5 文法（完成的課，加上正在上的那一課）：AI 家教照這些出題、聊天。
 * 還沒開始上 N5 課程時是空的。
 */
export function learnedGrammar(progress: LessonProgress): string[] {
  return startedCourse(progress).flatMap((l) => l.grammar);
}

/** 課程教過的單字（同上，照課的順序）：單字卡先出這些新卡（見 lib/vocab.ts 的 courseFirst） */
export function courseWords(progress: LessonProgress): string[] {
  return startedCourse(progress).flatMap((l) => l.words);
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
  return kanaCourseDone(progress) ? 'n5' : 'kana';
}
