/**
 * 首頁「今天的任務」：依進度算出今天該做的幾件事和完成了沒有。
 * 對應學習地圖「每天 45 分鐘」的複習和手寫；新進度（下一課）在首頁另外列。
 */
import { DECK_META, metaItemIds } from '../data/vocab/meta';
import type { Activity, KanaStats, LessonProgress, SrsData } from '../state';
import { countMastered, HIRA_KEYS, KATA_KEYS, lessonsDone, nextLesson } from './progress';
import { deckStats } from './srs';
import { studyDayKey } from './date';

/** 每天的假名測驗題數 */
export const KANA_GOAL = 20;
/** 每天的手寫字數 */
export const WRITING_GOAL = 5;
/** 學完平假名（第 1–6 課）才把單字卡列進每天的任務 */
const VOCAB_AFTER_LESSONS = 6;

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
  newPerDay: number;
  now: number;
}

export function todayTasks({ activity, kana, lessons, srs, newPerDay, now }: TodayInput): Task[] {
  const key = studyDayKey(now);
  const today = activity[key] ?? {};
  const next = nextLesson(lessons);
  const tasks: Task[] = [];

  // 單字卡：學完平假名、或已經開始背單字之後才列入
  let due = 0;
  let seen = 0;
  let unseen = 0;
  for (const d of DECK_META) {
    const s = deckStats(srs.cards, metaItemIds(d), now);
    due += s.due;
    seen += s.seen;
    unseen += s.unseen;
  }
  if (seen > 0 || lessonsDone(lessons) >= VOCAB_AFTER_LESSONS) {
    const day = srs.days[key] ?? { reviews: 0, fresh: 0, rev: 0, forgot: 0 };
    const newLeft = Math.min(unseen, Math.max(0, newPerDay - day.fresh));
    const done = due === 0 && newLeft === 0;
    const parts = [due ? `${due} 張到期` : '', newLeft ? `${newLeft} 張新卡` : ''].filter(Boolean);
    tasks.push({
      id: 'vocab',
      title: '單字卡',
      detail: done ? (day.reviews ? `今天複習了 ${day.reviews} 次，都完成了` : '今天沒有要複習的卡片') : `還有 ${parts.join('、')}`,
      done,
      to: '/review/all',
      action: due ? '開始複習' : '學新卡',
    });
  }

  // 假名測驗：平假名、片假名都熟悉之後就不用每天測
  if (countMastered(kana, HIRA_KEYS) < HIRA_KEYS.length || countMastered(kana, KATA_KEYS) < KATA_KEYS.length) {
    const n = today.kana ?? 0;
    tasks.push({
      id: 'kana',
      title: `假名測驗 ${KANA_GOAL} 題`,
      detail: `今天答了 ${n} 題`,
      done: n >= KANA_GOAL,
      to: '/practice',
      action: '去練習',
      value: n,
      goal: KANA_GOAL,
    });
  }

  // 手寫：五十音課程還沒學完時，每天寫幾個這一課的字
  if (next) {
    const n = today.writing ?? 0;
    tasks.push({
      id: 'writing',
      title: `手寫 ${WRITING_GOAL} 個字`,
      detail: `今天寫了 ${n} 個字`,
      done: n >= WRITING_GOAL,
      to: `/writing?lesson=${next.id}`,
      action: '去寫字',
      value: n,
      goal: WRITING_GOAL,
    });
  }
  return tasks;
}
