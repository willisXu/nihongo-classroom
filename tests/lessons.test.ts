import { describe, expect, it } from 'vitest';
import { LESSONS } from '../src/data/lessons';
import { SEION_ROWS, DAKUON_ROWS, rowById } from '../src/data/kana';
import type { Inline, LessonBlock, LessonWord } from '../src/data/types';

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

  it('introduce every kana exactly once', () => {
    const seen = new Map<string, number>();
    for (const l of LESSONS) {
      for (const ch of l.newKana) {
        expect(seen.has(ch), `「${ch}」在第 ${seen.get(ch)} 課和第 ${l.id} 課重複介紹`).toBe(false);
        seen.set(ch, l.id);
      }
    }
  });

  for (const lesson of LESSONS) {
    describe(`第 ${lesson.id} 課 ${lesson.title}`, () => {
      const allowed = new Set<string>(ALLOWED_MARKS);
      for (const l of LESSONS) if (l.id <= lesson.id) l.newKana.forEach((c) => allowed.add(c));

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

      it('inline markup is well-formed', () => {
        const texts: Inline[] = [lesson.summary, ...lesson.homework, ...(lesson.next ? [lesson.next] : [])];
        for (const s of lesson.sections) for (const b of s.blocks) texts.push(...blockTexts(b));
        for (const t of texts) expect(inlineOk(t), t).toBeNull();
      });
    });
  }

  it('cover the whole kana system once all lessons exist', () => {
    if (LESSONS.length < 8) return; // 課程寫完前先略過
    const introduced = new Set(LESSONS.flatMap((l) => l.newKana));
    const required: string[] = [];
    for (const row of [...SEION_ROWS, ...DAKUON_ROWS]) for (const c of row.cells) if (c) required.push(c.h, c.k);
    required.push(...'ゃゅょっャュョッー');
    const missing = required.filter((c) => !introduced.has(c));
    expect(missing, `還沒教到：${missing.join(' ')}`).toEqual([]);
  });
});
