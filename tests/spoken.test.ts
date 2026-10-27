/**
 * 會念出來的句子（會話、短文、例句、練習題答完的句子），課文和模擬考都檢查：
 * 句子中間的〜要念得出來（範圍「9時〜12時」念「から」），不能被當成句型的空位拿掉、念成「9時12時」。
 */
import { describe, expect, it } from 'vitest';
import { COURSE_LESSON_DATA } from './lessonData';
import { mock } from '../src/data/mock/n4';
import type { DrillItem, JaText, LessonBlock } from '../src/data/types';
import { fillBlank, fillTarget } from '../src/components/Drill';
import { jaSpeech } from '../src/lib/ja';

type Spoken = { where: string; ja: JaText; say?: string };

/** 練習題念的句子：聽力、對話；選擇題、排列題答完以後可以播放的整句 */
function drillSpoken(d: DrillItem, where: string): Spoken[] {
  switch (d.kind) {
    case 'choice':
      return d.ja ? [{ where, ja: /＿＿/.test(d.ja) ? fillBlank(d.ja, d.options[d.answer]) : fillTarget(d.ja, d.options[d.answer]) }] : [];
    case 'order':
      return [d.tiles, ...(d.also ?? [])].map((t) => ({ where, ja: t.join('') }));
    case 'listen':
      return [{ where, ja: d.ja, say: d.say }];
    case 'talk':
      return d.lines.map((ln) => ({ where, ja: ln.ja, say: ln.say }));
  }
}

function blockSpoken(b: LessonBlock, where: string): Spoken[] {
  switch (b.type) {
    case 'dialog':
    case 'reading':
      return b.lines.map((ln) => ({ where, ja: ln.ja, say: ln.say }));
    case 'grammar':
      return b.examples.map((e) => ({ where, ja: e.ja, say: e.say }));
    case 'examples':
      return b.items.map((e) => ({ where, ja: e.ja, say: e.say }));
    case 'drill':
      return b.items.flatMap((d, i) => drillSpoken(d, `${where} 第 ${i + 1} 題`));
    default:
      return [];
  }
}

const spoken: Spoken[] = [
  ...COURSE_LESSON_DATA.flatMap((l) => l.sections.flatMap((s) => s.blocks.flatMap((b) => blockSpoken(b, `第 ${l.id} 課「${s.title}」`)))),
  ...mock.sections.flatMap((s) =>
    s.parts.flatMap((p) => [
      ...(p.reading?.lines ?? []).map((ln) => ({ where: `模擬考「${p.title}」的短文`, ja: ln.ja, say: ln.say })),
      ...p.items.flatMap((d, i) => drillSpoken(d, `模擬考「${p.title}」第 ${i + 1} 題`)),
    ]),
  ),
];

/** 句子中間的〜換成「から」（開頭、結尾、〔〕旁邊的是句型的空位，不換） */
function midTildesAsKara(ja: JaText): string {
  const t = ja.trim();
  return t.replace(/[〜～]/g, (m, at: number) => (at === 0 || at === t.length - 1 || /[〔〕]/.test(t[at - 1] + t[at + 1]) ? m : 'から'));
}

describe('會念出來的句子', () => {
  it('句子中間的〜念「から」（不是範圍的話要寫 say）', () => {
    const withTilde = spoken.filter((s) => !s.say && midTildesAsKara(s.ja) !== s.ja.trim());
    // 課文和模擬考裡有這種句子（例如通知的「午前9時〜12時」），不是什麼都沒檢查到
    expect(withTilde.length).toBeGreaterThan(0);
    const bad = withTilde.filter((s) => jaSpeech(s.ja) !== jaSpeech(midTildesAsKara(s.ja))).map((s) => `${s.where}：${s.ja} → 念成「${jaSpeech(s.ja)}」`);
    expect(bad).toEqual([]);
  });
});
