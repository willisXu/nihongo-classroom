import type { Lesson } from '../types';
import { lesson1 } from './lesson1';
import { lesson2 } from './lesson2';
import { lesson3 } from './lesson3';
import { lesson4 } from './lesson4';
import { lesson5 } from './lesson5';
import { lesson6 } from './lesson6';
import { lesson7 } from './lesson7';
import { lesson8 } from './lesson8';

/** 五十音課程，依課次排列 */
export const LESSONS: Lesson[] = [lesson1, lesson2, lesson3, lesson4, lesson5, lesson6, lesson7, lesson8];

export function lessonById(id: number): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
