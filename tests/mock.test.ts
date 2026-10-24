import { describe, expect, it } from 'vitest';
import { mock } from '../src/data/mock/n4';
import type { DrillItem, Inline, JaText } from '../src/data/types';
import { bareKanji, jaPlain, jaReading, parseJa } from '../src/lib/ja';
import { COURSE_LESSONS } from '../src/data/lessons/meta';

/** 說明文字裡的日文：[[…]]（| 前面）和 {{…}}（單一個漢字是在說字形，不用標讀音） */
function inlineJa(text: Inline): JaText[] {
  const out: JaText[] = [];
  for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) out.push(m[1].split('|')[0]);
  for (const m of text.matchAll(/\{\{([^}]+)\}\}/g)) if (!/^\p{Script=Han}$/u.test(m[1])) out.push(m[1]);
  return out;
}

const items = mock.sections.flatMap((s) => s.parts.flatMap((p) => p.items.map((it) => ({ it, where: `${s.title}／${p.title}` }))));

function jaOf(d: DrillItem): { text: JaText; target: boolean }[] {
  switch (d.kind) {
    case 'choice':
      return [...(d.ja ? [{ text: d.ja, target: true }] : []), ...d.options.map((o) => ({ text: o, target: true }))];
    case 'order':
      return d.tiles.map((t) => ({ text: t, target: false }));
    case 'listen':
      return [{ text: d.ja, target: false }, ...(d.optionsJa ? d.options.map((o) => ({ text: o, target: false })) : [])];
    case 'talk':
      return [...d.lines.flatMap((ln) => [{ text: ln.ja, target: false }, { text: ln.who, target: false }]), ...(d.optionsJa ? d.options.map((o) => ({ text: o, target: false })) : [])];
  }
}

describe('N4 模擬考', () => {
  it('照 JLPT 的四個科目，題數夠', () => {
    expect(mock.sections.map((s) => s.id)).toEqual(['vocab', 'grammar', 'reading', 'listening']);
    for (const s of mock.sections) {
      expect(s.parts.length, s.title).toBeGreaterThan(0);
      expect(s.minutes, s.title).toBeGreaterThan(0);
    }
    expect(items.length).toBeGreaterThanOrEqual(45);
    // 讀解的題組都附短文；聽解都是聽力題
    for (const p of mock.sections.find((s) => s.id === 'reading')!.parts) expect(p.reading?.lines.length, p.title).toBeGreaterThan(0);
    for (const p of mock.sections.find((s) => s.id === 'listening')!.parts) for (const it of p.items) expect(['listen', 'talk']).toContain(it.kind);
  });

  it('日文的格式正確，漢字都標了讀音（⟦⟧ 只在選擇題）', () => {
    const bad: string[] = [];
    const check = (where: string, text: JaText, allowTarget: boolean) => {
      try {
        parseJa(text);
      } catch (e) {
        bad.push(`${where}：${(e as Error).message}`);
        return;
      }
      if (!allowTarget && text.includes('⟦')) bad.push(`${where}「${text}」：⟦⟧ 只能用在選擇題`);
      const bare = bareKanji(text);
      if (bare.length) bad.push(`${where}「${text}」：${bare.join('')} 沒有標讀音`);
      if (/[a-zA-Z]/.test(jaReading(text).replace(/[〜～]/g, ''))) bad.push(`${where}「${text}」：讀音裡有英文字母`);
    };
    for (const { it, where } of items) for (const { text, target } of jaOf(it)) check(where, text, target);
    for (const s of mock.sections) for (const p of s.parts) for (const ln of p.reading?.lines ?? []) check(`${p.title} 的短文`, ln.ja, false);
    const inlines = [mock.intro, ...mock.sections.flatMap((s) => [s.intro ?? '', ...s.parts.map((p) => p.intro ?? '')]), ...items.flatMap(({ it }) => [it.why ?? '', 'q' in it ? it.q ?? '' : ''])];
    for (const t of inlines) {
      for (const j of inlineJa(t)) check('說明文字', j, false);
      if ((t.match(/\[\[/g) || []).length !== (t.match(/\]\]/g) || []).length) bad.push(`[[ ]] 沒有成對：${t}`);
      if ((t.match(/\{\{/g) || []).length !== (t.match(/\}\}/g) || []).length) bad.push(`{{ }} 沒有成對：${t}`);
      const outside = t.replace(/\[\[[^\]]+\]\]/g, '').replace(/\{\{[^}]+\}\}/g, '');
      if (/[\p{Script=Han}々]《[ぁ-ヿ]+》|[〔〕｜⟦⟧]/u.test(outside)) bad.push(`日文沒有用 [[ ]] 或 {{ }} 包起來：${t}`);
    }
    expect(bad).toEqual([]);
  });

  it('題目：答案在選項裡、選項不重複、不用位置指選項、標了出自第幾課', () => {
    const bad: string[] = [];
    const lessons = new Set(COURSE_LESSONS.map((l) => l.id));
    for (const { it, where } of items) {
      if (it.lesson !== undefined && !lessons.has(it.lesson)) bad.push(`${where}：沒有第 ${it.lesson} 課`);
      if (it.lesson === undefined) bad.push(`${where}：沒有標出自第幾課（lesson）`);
      const pos = /第[一二三四1-4]\s*(?:句|個句子|個選項|項)|前兩句|後兩句|最後一句/;
      for (const t of [it.why ?? '', 'q' in it ? it.q ?? '' : '']) if (pos.test(t)) bad.push(`${where}：選項會打亂，不能用位置指選項：${t}`);
      if (it.kind === 'order') {
        if (it.tiles.length < 2) bad.push(`${where}：排列題只有一塊`);
        continue;
      }
      const opts = it.options.map((o) => (it.kind === 'choice' || it.optionsJa ? jaPlain(o) : o));
      if (it.answer < 0 || it.answer >= opts.length) bad.push(`${where}：答案超出選項 ${opts.join('／')}`);
      if (new Set(opts).size !== opts.length) bad.push(`${where}：選項重複 ${opts.join('／')}`);
      if (opts.length < 3) bad.push(`${where}：選項要 3～4 個 ${opts.join('／')}`);
      if (it.kind === 'choice' && !it.q && !it.ja) bad.push(`${where}：選擇題沒有題目`);
      if (it.kind === 'talk' && it.lines.length < 2) bad.push(`${where}：對話聽力至少兩句`);
    }
    expect(bad).toEqual([]);
  });
});
