import type { LessonMeta } from '../types';

/**
 * 每一課的摘要（課名、標題、時間、新學的字、練習範圍）。
 * 首頁、課程列表和練習頁只需要這些，不用載入整份課文；課文檔案（lesson1.ts…）從這裡取用，不重複寫。
 */
export const LESSON_META: LessonMeta[] = [
  {
    id: 1,
    title: 'あ・か・さ行',
    headline: '三套文字，和最先學的 15 個假名',
    minutes: 40,
    newKana: [...'あいうえおかきくけこさしすせそ'],
    quiz: { script: 'h', rows: ['a', 'k', 's'] },
  },
  {
    id: 2,
    title: 'た行・な行',
    headline: '10 個新假名，和中文裡沒有的 つ',
    minutes: 35,
    newKana: [...'たちつてとなにぬねの'],
    quiz: { script: 'h', rows: ['t', 'n'] },
  },
  {
    id: 3,
    title: 'は行・ま行',
    headline: 'ふ 不是ㄈ：は行和ま行',
    minutes: 35,
    newKana: [...'はひふへほまみむめも'],
    quiz: { script: 'h', rows: ['h', 'm'] },
  },
  {
    id: 4,
    title: 'や・ら・わ行・ん',
    headline: '最後 11 個清音，平假名的基本字全部到齊',
    minutes: 40,
    newKana: [...'やゆよらりるれろわをん'],
    quiz: { script: 'h', rows: ['y', 'r', 'w', 'nn'] },
  },
  {
    id: 5,
    title: '濁音・半濁音',
    headline: '加兩點、加一個圈：再多 25 個音',
    minutes: 45,
    newKana: [...'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ'],
    quiz: { script: 'h', rows: ['g', 'z', 'd', 'b', 'p'] },
  },
  {
    id: 6,
    title: '拗音・促音・長音',
    headline: '小字和長音：一拍一拍數清楚',
    minutes: 45,
    newKana: [...'ゃゅょっ'],
    quiz: { script: 'h', rows: ['a', 'k', 's', 't', 'n', 'h', 'm', 'y', 'r', 'w', 'nn', 'g', 'z', 'd', 'b', 'p'] },
  },
  {
    id: 7,
    title: '片假名（一）',
    headline: '第二套假名：寫外來語的片假名',
    minutes: 40,
    newKana: [...'アイウエオカキクケコサシスセソタチツテトナニヌネノガギグゲゴザジズゼゾダヂヅデドャュョッー'],
    quiz: { script: 'k', rows: ['a', 'k', 's', 't', 'n', 'g', 'z', 'd'] },
  },
  {
    id: 8,
    title: '片假名（二）',
    headline: '最後一課：片假名全部到齊',
    minutes: 45,
    newKana: [...'ハヒフヘホマミムメモヤユヨラリルレロワヲンバビブベボパピプペポァィゥェォヴ'],
    quiz: { script: 'k', rows: ['h', 'm', 'y', 'r', 'w', 'nn', 'b', 'p'] },
  },
];

export function lessonMetaById(id: number): LessonMeta | undefined {
  return LESSON_META.find((l) => l.id === id);
}

/** 課文檔案用：取得這一課的摘要（找不到代表資料寫錯，直接報錯） */
export function lessonMeta(id: number): LessonMeta {
  const m = lessonMetaById(id);
  if (!m) throw new Error(`找不到第 ${id} 課的摘要`);
  return m;
}
