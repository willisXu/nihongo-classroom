import { describe, expect, it } from 'vitest';
import { LESSONS, KANA_LESSON_DATA } from './lessonData';
import { SEION_ROWS, DAKUON_ROWS, rowById } from '../src/data/kana';
import type { Inline, LessonBlock, LessonWord } from '../src/data/types';
import { getStrokePaths } from '../src/lib/strokes';
import { loadLesson, preloadLesson } from '../src/data/lessons';
import { asPreload, preloading } from '../src/data/lessons/preload';

/** 課文裡刻意提早出現的詞（發音說明的例子，不是要學的單字） */
const TEXT_PREVIEW: Record<number, string[]> = {
  1: ['です'], // す 在句尾聽不到 u：最常見的例子，で 第 5 課才教
};

/** 課程詞裡允許的非假名符號 */
const ALLOWED_MARKS = new Set([' ', '　', '、', '。', '！', '？', '・', '〜']);

function inlineOk(text: Inline): string | null {
  const count = (re: RegExp) => (text.match(re) || []).length;
  if (count(/\[\[/g) !== count(/\]\]/g)) return '[[ ]] 沒有成對';
  if (count(/\{\{/g) !== count(/\}\}/g)) return '{{ }} 沒有成對';
  if (count(/\*\*/g) % 2 !== 0) return '** 沒有成對';
  const links = text.match(/\[[^\[\]]+\]\(([^)]*)\)/g) || [];
  for (const l of links) {
    const href = l.replace(/^.*\(/, '').replace(/\)$/, '');
    if (!href.startsWith('/') && !href.startsWith('https://')) return `連結需以 / 或 https:// 開頭：${l}`;
  }
  return null;
}

function blockTexts(b: LessonBlock): Inline[] {
  switch (b.type) {
    case 'p': return [b.text];
    case 'callout': return b.items;
    case 'words': return b.note ? [b.note] : [];
    case 'pairs': return b.items.flatMap((i) => (i.note ? [i.note] : []));
    case 'fontcompare': return b.caption ? [b.caption] : [];
    case 'table': return b.rows.flat();
    default: return [];
  }
}

function blockWords(b: LessonBlock): LessonWord[] {
  if (b.type === 'words' && !b.free) return b.items;
  if (b.type === 'pairs') return b.items.flatMap((i) => [i.a, i.b]);
  return [];
}

describe('lessons', () => {
  it('are numbered 1..N in order', () => {
    LESSONS.forEach((l, i) => expect(l.id).toBe(i + 1));
  });

  it('五十音的課在前面，接著是 N5、N4 的課', () => {
    const kinds = LESSONS.map((l) => (l.kind === 'course' ? l.level : l.kind)).join(',');
    expect(kinds).toMatch(/^(kana,)*kana(,n5)*(,n4)*$/);
  });
});

describe('五十音課程', () => {
  it('introduce every kana exactly once', () => {
    const seen = new Map<string, number>();
    for (const l of KANA_LESSON_DATA) {
      for (const ch of l.newKana) {
        expect(seen.has(ch), `「${ch}」在第 ${seen.get(ch)} 課和第 ${l.id} 課重複介紹`).toBe(false);
        seen.set(ch, l.id);
      }
    }
  });

  for (const lesson of KANA_LESSON_DATA) {
    describe(`第 ${lesson.id} 課 ${lesson.title}`, () => {
      const allowed = new Set<string>(ALLOWED_MARKS);
      for (const l of KANA_LESSON_DATA) if (l.id <= lesson.id) l.newKana.forEach((c) => allowed.add(c));

      it('has the required fields', () => {
        expect(lesson.title).toBeTruthy();
        expect(lesson.headline).toBeTruthy();
        expect(lesson.summary).toBeTruthy();
        expect(lesson.minutes).toBeGreaterThan(0);
        expect(lesson.newKana.length).toBeGreaterThan(0);
        expect(lesson.sections.length).toBeGreaterThan(0);
        expect(lesson.homework.length).toBeGreaterThan(0);
        const ids = lesson.sections.map((s) => s.id);
        expect(new Set(ids).size, '段落 id 重複').toBe(ids.length);
      });

      it('quiz rows and kana blocks point to real rows', () => {
        for (const r of lesson.quiz.rows) expect(rowById(r), `找不到行 ${r}`).toBeTruthy();
        for (const s of lesson.sections) for (const b of s.blocks) {
          if (b.type === 'kana') for (const r of b.rows) expect(rowById(r), `找不到行 ${r}`).toBeTruthy();
        }
      });

      it('practice words only use kana learned so far', () => {
        for (const s of lesson.sections) for (const b of s.blocks) {
          for (const w of blockWords(b)) {
            expect(w.zh, `${w.ja} 缺少中文`).toBeTruthy();
            const bad = Array.from(w.ja).filter((c) => !allowed.has(c));
            expect(bad, `第 ${lesson.id} 課「${s.title}」的「${w.ja}」用到還沒學的字：${bad.join(' ')}`).toEqual([]);
          }
        }
      });

      it('words in the text ([[…]]) and katakana examples only use kana learned so far', () => {
        const bad: string[] = [];
        const check = (where: string, word: string) => {
          const miss = Array.from(word).filter((c) => /[\u3040-\u30ff]/.test(c) && !allowed.has(c));
          if (miss.length) bad.push(`${where}「${word}」：${miss.join(' ')}`);
        };
        const texts: Inline[] = [lesson.summary, ...lesson.homework];
        for (const s of lesson.sections) for (const b of s.blocks) texts.push(...blockTexts(b));
        for (const t of texts) {
          // [[漢字|かな]] 看讀音；[[かな|念法]] 看字本身（例如 なつは 標出念 なつわ）
          for (const m of t.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
            const word = /[\u3400-\u9fff]/.test(m[1]) && m[2] ? m[2] : m[1];
            if (!TEXT_PREVIEW[lesson.id]?.includes(word)) check('課文', word);
          }
        }
        // 片假名課的字表：每個字的例字（五十音表也用同一組例字）
        for (const s of lesson.sections) for (const b of s.blocks) {
          if (b.type !== 'kana' || b.script !== 'k') continue;
          for (const r of b.rows) for (const c of rowById(r)?.cells ?? []) if (c?.kx) check(`${c.k} 的例字`, c.kx[0]);
        }
        expect(bad, `第 ${lesson.id} 課`).toEqual([]);
      });

      it('practice and writing links open the scope of this lesson', () => {
        const texts: Inline[] = [lesson.summary, ...lesson.homework, ...(lesson.next ? [lesson.next] : [])];
        for (const s of lesson.sections) for (const b of s.blocks) texts.push(...blockTexts(b));
        const bad: string[] = [];
        for (const t of texts) {
          for (const m of t.matchAll(/\]\((\/(?:practice|writing)[^)]*)\)/g)) {
            const url = new URL(m[1], 'https://x.test');
            const lessonParam = url.searchParams.get('lesson');
            const chars = url.searchParams.get('chars') ?? url.searchParams.get('char');
            if (lessonParam === String(lesson.id)) continue;
            // 手寫可以帶一組字（長得像的字）：都要是到這一課為止教過、有筆順資料的字
            if (url.pathname === '/writing' && chars) {
              const miss = Array.from(chars).filter((c) => !allowed.has(c) || !getStrokePaths(c));
              if (!miss.length) continue;
              bad.push(`${m[1]}：${miss.join(' ')} 還沒教或沒有筆順`);
              continue;
            }
            bad.push(`${m[1]} 沒有帶第 ${lesson.id} 課的範圍（?lesson=${lesson.id}）`);
          }
        }
        expect(bad, `第 ${lesson.id} 課`).toEqual([]);
      });

      it('inline markup is well-formed', () => {
        const texts: Inline[] = [lesson.summary, ...lesson.homework, ...(lesson.next ? [lesson.next] : [])];
        for (const s of lesson.sections) for (const b of s.blocks) texts.push(...blockTexts(b));
        for (const t of texts) expect(inlineOk(t), t).toBeNull();
      });
    });
  }

  it('cover the whole kana system once all lessons exist', () => {
    const introduced = new Set(KANA_LESSON_DATA.flatMap((l) => l.newKana));
    const required: string[] = [];
    for (const row of [...SEION_ROWS, ...DAKUON_ROWS]) for (const c of row.cells) if (c) required.push(c.h, c.k);
    required.push(...'ゃゅょっャュョッー');
    const missing = required.filter((c) => !introduced.has(c));
    expect(missing, `還沒教到：${missing.join(' ')}`).toEqual([]);
  });
});

describe('課文分檔載入', () => {
  it('同一課只下載一次；沒有這一課（0、57、abc）得到 undefined', async () => {
    expect(loadLesson(9)).toBe(loadLesson(9));
    expect((await loadLesson(9))?.id).toBe(9);
    for (const id of [0, 57, Number('abc'), 1.5]) expect(await loadLesson(id)).toBeUndefined();
  });

  it('背景預載下一課的期間標成預載（失敗時不重新整理正在看的這一課，見 main.tsx）', async () => {
    expect(preloading()).toBe(false);
    preloadLesson(10);
    expect(preloading()).toBe(true);
    await loadLesson(10);
    await Promise.resolve();
    expect(preloading()).toBe(false);
    // 失敗也會結束
    const failed = asPreload(Promise.reject(new Error('Failed to fetch dynamically imported module')));
    expect(preloading()).toBe(true);
    await expect(failed).rejects.toThrow();
    expect(preloading()).toBe(false);
  });
});
