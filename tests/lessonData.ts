/** 測試用：一次載入全部課文（網站上是打開哪一課才下載那一課） */
import type { CourseLesson, KanaLesson, Lesson } from '../src/data/types';

const modules = import.meta.glob<Lesson>('../src/data/lessons/lesson*.ts', { eager: true, import: 'lesson' });

export const LESSONS: Lesson[] = Object.values(modules).sort((a, b) => a.id - b.id);
export const KANA_LESSON_DATA = LESSONS.filter((l): l is KanaLesson => l.kind === 'kana');
export const COURSE_LESSON_DATA = LESSONS.filter((l): l is CourseLesson => l.kind === 'n5');
