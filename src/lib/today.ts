/**
 * 首頁「今天的任務」：依進度算出今天該做的幾件事和完成了沒有。
 * 對應學習地圖「每天 45 分鐘」的複習和手寫；新進度（下一課）在首頁另外列。
 */
import { DECK_META, metaItemIds, unseenWords } from '../data/vocab/meta';
import type { Activity, KanaStats, LessonProgress, SrsData, WritingStats } from '../state';
import {
  countMastered, HIRA_KEYS, kanaCourseDone, kanaLessonsDone, KATA_KEYS, learnedKanji, nextCourseLesson, nextKanaLesson,
} from './progress';
import { weakKanaKeys } from './mistakes';
import { deckStats } from './srs';
import { studyDayKey } from './date';

/** 每天的假名測驗題數 */
export const KANA_GOAL = 20;
/** 每天的手寫字數 */
export const WRITING_GOAL = 5;
/** 學完平假名（第 1–6 課）才把單字卡列進每天的任務 */
const VOCAB_AFTER_LESSONS = 6;
/** 上初級課程以後的錯題練習：每個答錯的假名連對 3 次才算練熟，題數照這個算（最多 KANA_GOAL 題） */
const WEAK_KANA_ROUNDS = 3;

export type TaskId = 'vocab' | 'kana' | 'writing';

export interface Task {
  id: TaskId;
  title: string;
  /** 進度說明，例如「今天 12／20 題」 */
  detail: string;
  done: boolean;
  to: string;
  /** 還沒完成時按鈕上的字 */
  action: string;
  /** 有固定目標的任務：目前數量和目標 */
  value?: number;
  goal?: number;
}

export interface TodayInput {
  activity: Activity;
  kana: KanaStats;
  lessons: LessonProgress;
  srs: SrsData;
  /** 手寫紀錄：課程學完或這一課沒有新漢字時，手寫任務寫還沒寫過的漢字 */
  writing: WritingStats;
  newPerDay: number;
  now: number;
}

export function todayTasks({ activity, kana, lessons, srs, writing, newPerDay, now }: TodayInput): Task[] {
  const key = studyDayKey(now);
  const today = activity[key] ?? {};
  const next = nextKanaLesson(lessons);
  const tasks: Task[] = [];

  // 單字卡：學完平假名、或已經開始背單字之後才列入
  let due = 0;
  let seen = 0;
  for (const d of DECK_META) {
    const s = deckStats(srs.cards, metaItemIds(d), now);
    due += s.due;
    seen += s.seen;
  }
  // 同一個字在好幾個牌組只算一次（「全部牌組」也只會出一張）
  const unseen = unseenWords(srs.cards);
  if (seen > 0 || kanaLessonsDone(lessons) >= VOCAB_AFTER_LESSONS || kanaCourseDone(lessons)) {
    const day = srs.days[key] ?? { reviews: 0, fresh: 0, rev: 0, forgot: 0 };
    const newLeft = Math.min(unseen, Math.max(0, newPerDay - day.fresh));
    const practiced = today.review ?? 0;
    const done = due === 0 && newLeft === 0;
    const parts = [due ? `${due} 張到期` : '', newLeft ? `${newLeft} 張新卡` : ''].filter(Boolean);
    tasks.push({
      id: 'vocab',
      title: '單字卡',
      // 次數和學習紀錄頁一樣：單字卡複習加上錯題本的加強練習
      detail: done ? (practiced ? `今天複習了 ${practiced} 次，都完成了` : '今天沒有要複習的卡片') : `還有 ${parts.join('、')}`,
      done,
      to: '/review/all',
      action: due ? '開始複習' : '學新卡',
    });
  }

  // 假名測驗：還在上五十音課程時每天測，平假名、片假名都熟悉之後就不用；
  // 上初級課程以後（見 progress.ts 的 kanaCourseDone）不再每天測，只在有答錯、還沒練熟的假名時，練那幾個字
  const kanaN = today.kana ?? 0;
  if (!kanaCourseDone(lessons)) {
    if (countMastered(kana, HIRA_KEYS) < HIRA_KEYS.length || countMastered(kana, KATA_KEYS) < KATA_KEYS.length) {
      tasks.push({
        id: 'kana',
        title: `假名測驗 ${KANA_GOAL} 題`,
        detail: `今天答了 ${kanaN} 題`,
        done: kanaN >= KANA_GOAL,
        to: '/practice',
        action: '去練習',
        value: kanaN,
        goal: KANA_GOAL,
      });
    }
  } else {
    const weak = weakKanaKeys(kana).length;
    if (weak) {
      const goal = Math.min(KANA_GOAL, weak * WEAK_KANA_ROUNDS);
      tasks.push({
        id: 'kana',
        title: '複習答錯的假名',
        detail: `還有 ${weak} 個字沒練熟，今天答了 ${kanaN} 題`,
        done: kanaN >= goal,
        to: '/practice?focus=weak',
        action: '去練習',
        value: kanaN,
        goal,
      });
    }
  }

  // 手寫：還在上五十音課程時寫這一課的假名；上初級課程以後寫這一課的漢字。
  // 這一課沒有新漢字（第 30–32、55 課）或課程都學完時，寫學過、還沒寫過的漢字；都寫過了才不列
  const course = next ? undefined : nextCourseLesson(lessons);
  const unwritten = [...learnedKanji(lessons)].filter((ch) => !writing[ch]);
  const writeTo = next
    ? `/writing?lesson=${next.id}`
    : course?.kanji
      ? `/writing?chars=${encodeURIComponent(course.kanji)}`
      : unwritten.length
        ? `/writing?chars=${encodeURIComponent(unwritten.join(''))}`
        : null;
  if (writeTo) {
    const n = today.writing ?? 0;
    tasks.push({
      id: 'writing',
      title: `手寫 ${WRITING_GOAL} 個字`,
      detail: `今天寫了 ${n} 個字`,
      done: n >= WRITING_GOAL,
      to: writeTo,
      action: '去寫字',
      value: n,
      goal: WRITING_GOAL,
    });
  }
  return tasks;
}
