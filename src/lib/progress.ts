/** 由各項紀錄推算的進度數字 */
import { SEION_CELLS } from '../data/kana';
import { COURSE_LESSONS, KANA_LESSONS, LESSON_META } from '../data/lessons/meta';
import type { CourseLessonMeta, CourseLevel, KanaLessonMeta, LessonMeta } from '../data/types';
import { kanaLevel, type Activity, type KanaStats, type LessonProgress, type TutorLevel } from '../state';
import { addDays, studyDayKey, studyDayStart } from './date';

export const HIRA_KEYS = SEION_CELLS.map((c) => `h:${c.h}`);
export const KATA_KEYS = SEION_CELLS.map((c) => `k:${c.k}`);

export function countMastered(stats: KanaStats, keys: string[]): number {
  return keys.filter((k) => kanaLevel(stats, k) === 2).length;
}

/**
 * 現在上到的課（「繼續第 N 課」）：完成的課裡最後面那一課的下一課。
 * 課可以不照順序完成（會假名的人直接從第 9 課開始、忘了按某一課的「完成」、改回未完成重上），
 * 所以不是找「第一個還沒完成的課」，而是從上到最遠的地方接著上；前面沒按完成的課在課程列表上看得到。
 * 後面的課都完成了（只剩前面漏掉的課）才回頭指向第一個還沒完成的課。全部完成時回傳 undefined。
 * 首頁、課程列表、學習紀錄的「下一課」、今天的任務、學習地圖、AI 家教的程度都照這個算（見下面幾個函式）。
 */
export function nextLesson(progress: LessonProgress): LessonMeta | undefined {
  return after(LESSON_META, progress);
}

/** list 裡完成的課最後面那一課的下一課；後面都完成了就是第一個還沒完成的課 */
function after<T extends LessonMeta>(list: T[], progress: LessonProgress): T | undefined {
  // 最後一課完成的課後面那一課一定還沒完成
  const last = list.findLastIndex((l) => progress.done[l.id]);
  return list[last + 1] ?? list.find((l) => !progress.done[l.id]);
}

/** 五十音課程（第 1–8 課）的下一課；五十音課程算學完了（見 kanaCourseDone）就回傳 undefined */
export function nextKanaLesson(progress: LessonProgress): KanaLessonMeta | undefined {
  if (kanaCourseDone(progress)) return undefined;
  const next = nextLesson(progress);
  return next?.kind === 'kana' ? next : undefined;
}

/** 初級課程（N5、N4）現在上到的課（規則同 nextLesson，只看初級課程的課） */
export function nextCourseLesson(progress: LessonProgress): CourseLessonMeta | undefined {
  return after(COURSE_LESSONS, progress);
}

/** 完成幾課（五十音和初級課程一起算） */
export function lessonsDone(progress: LessonProgress): number {
  return LESSON_META.filter((l) => progress.done[l.id]).length;
}

export function kanaLessonsDone(progress: LessonProgress): number {
  return KANA_LESSONS.filter((l) => progress.done[l.id]).length;
}

export function courseLessonsDone(progress: LessonProgress): number {
  return COURSE_LESSONS.filter((l) => progress.done[l.id]).length;
}

/**
 * 五十音課程算學完了：五十音的最後一課（第 8 課）或任何一課初級課程完成了。
 * 不要求 8 課都按了完成：會假名、直接從第 9 課開始的人，或漏按一課的人，已經在上初級課程，
 * 不該再被當成「還在學假名」（AI 家教只用假名、每天寫假名、學習地圖停在五十音）。
 */
export function kanaCourseDone(progress: LessonProgress): boolean {
  const lastKana = KANA_LESSONS[KANA_LESSONS.length - 1]?.id ?? 0;
  return LESSON_META.some((l) => l.id >= lastKana && progress.done[l.id]);
}

/** 初級課程裡完成的課教的漢字（照課的順序） */
export function learnedKanji(progress: LessonProgress): string {
  return COURSE_LESSONS.filter((l) => progress.done[l.id])
    .map((l) => l.kanji)
    .join('');
}

/** 到這一課為止學過的假名 */
export function learnedKana(progress: LessonProgress): string {
  const upTo = nextKanaLesson(progress)?.id ?? Infinity;
  return KANA_LESSONS.filter((l) => l.id < upTo).flatMap((l) => l.newKana).join('');
}

/** 完成的初級課程的課，加上正在上的那一課（照課的順序） */
function startedCourse(progress: LessonProgress): CourseLessonMeta[] {
  const now = nextCourseLesson(progress);
  // 五十音還沒學完時，N5 的第一課還不算「正在上」
  const current = kanaCourseDone(progress) ? now?.id : undefined;
  return COURSE_LESSONS.filter((l) => progress.done[l.id] || l.id === current);
}

/**
 * 學過的文法（完成的課，加上正在上的那一課）：AI 家教照這些出題、聊天。
 * level：只要某個程度（N5、N4）的課。還沒開始上初級課程時是空的。
 */
export function learnedGrammar(progress: LessonProgress, level?: CourseLevel): string[] {
  return startedCourse(progress)
    .filter((l) => !level || l.level === level)
    .flatMap((l) => l.grammar);
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

/**
 * 現在的程度：還在學五十音 → kana；開始上初級課程 → 至少 n5；
 * N4 的課完成了任何一課，或 N5 的課都完成了 → n4（N5 有一課忘了勾完成，不會一直停在 N5）。
 * AI 家教的建議程度、學習地圖的「你在這裡」都照這個。
 */
export function suggestedLevel(progress: LessonProgress): TutorLevel {
  if (!kanaCourseDone(progress)) return 'kana';
  const n5 = COURSE_LESSONS.filter((l) => l.level === 'n5');
  const n5Done = n5.length > 0 && n5.every((l) => progress.done[l.id]);
  const n4Started = COURSE_LESSONS.some((l) => l.level === 'n4' && progress.done[l.id]);
  return n5Done || n4Started ? 'n4' : 'n5';
}

/**
 * 學習地圖的階段：0 五十音、1 初級前半（N5）、2 初級後半（N4）、3 課程都學完（中級）。
 * 和 AI 家教的建議程度一樣照 suggestedLevel：不要求前面每一課都按了完成
 * （會假名直接從第 9 課開始、漏按一課、改回未完成重上的人，都停在正確的階段）。
 */
export function studyPhase(progress: LessonProgress): 0 | 1 | 2 | 3 {
  const level = suggestedLevel(progress);
  if (level === 'kana') return 0;
  if (level === 'n5') return 1;
  const n4 = COURSE_LESSONS.filter((l) => l.level === 'n4');
  return n4.length && n4.every((l) => progress.done[l.id]) ? 3 : 2;
}
