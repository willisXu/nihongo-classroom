/**
 * 會念出來的句子（會話、短文、例句、練習題答完的句子），課文和模擬考都檢查：
 * 句子中間的〜要念得出來（範圍「9時〜12時」念「から」），不能被當成句型的空位拿掉、念成「9時12時」。
 */
import { describe, expect, it } from 'vitest';
import { COURSE_LESSON_DATA } from './lessonData';
import { mock } from '../src/data/mock/n4';
import type { DrillItem, JaText, LessonBlock } from '../src/data/types';
import { fillBlank, fillTarget } from '../src/components/Drill';
import { inlineSay, jaPlain, jaSpeech } from '../src/lib/ja';
import { DECKS } from '../src/data/vocab';
import { exampleSpeech } from '../src/lib/vocab';

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

/* ---------------- 念法：片假名讀音的詞、語音引擎常念錯的詞 ---------------- */

/** 一個物件裡所有的字串（課文、模擬考） */
function strings(o: unknown, out: string[] = []): string[] {
  if (typeof o === 'string') out.push(o);
  else if (Array.isArray(o)) for (const v of o) strings(v, out);
  else if (o && typeof o === 'object') for (const v of Object.values(o)) strings(v, out);
  return out;
}

/** 說明文字裡可以點來聽的 [[表記|念法]]：沒有念法時念 inlineSay（見 components/Rich.tsx） */
const inline: Spoken[] = [
  ...COURSE_LESSON_DATA.flatMap((l) => strings(l).map((t) => ({ t, where: `第 ${l.id} 課的說明文字` }))),
  ...strings(mock).map((t) => ({ t, where: '模擬考的說明文字' })),
].flatMap(({ t, where }) =>
  [...t.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => {
    const [shown, say] = m[1].split('|');
    return { where, ja: shown, say: say ?? inlineSay(shown) };
  }),
);

const cards = DECKS.flatMap((d) => d.items);
const speechOf = (s: Spoken) => s.say ?? jaSpeech(s.ja);

describe('念法', () => {
  it('讀音標片假名的詞（台北《タイペイ》…）：指定的念法（say）和單字卡例句不能寫漢字（語音引擎會念成 たいほく）', () => {
    const kata = new Set<string>();
    for (const t of [...strings(COURSE_LESSON_DATA), ...strings(mock)]) {
      for (const m of t.matchAll(/([\p{Script=Han}々]+)《([ァ-ヺー]+)》/gu)) kata.add(m[1]);
    }
    expect([...kata]).toContain('台北');
    const bad: string[] = [];
    for (const s of [...spoken, ...inline]) {
      const say = speechOf(s);
      for (const k of kata) if (say.includes(k)) bad.push(`${s.where}「${jaPlain(s.ja)}」念「${say}」：${k} 要寫讀音`);
    }
    for (const it of cards) {
      if (!it.ex) continue;
      for (const k of kata) if (exampleSpeech(it.ex).includes(k)) bad.push(`${it.id}「${it.ex.ja}」：${k} 要在 say 寫讀音`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * 語音引擎常念錯的寫法：課文用 say（或 [[表記|念法]]）改念假名，單字卡例句用 ex.say。
   * 課文裡單獨一個漢字的 降・開・辛・角 jaSpeech 會自己改念讀音（見 lib/ja.ts 的 SAY_READING_SINGLE），
   * 單字卡例句是照原句念的，所以例句另外檢查。
   */
  const RISKY: { re: RegExp; why: string; lessons: boolean }[] = [
    { re: /弾け/, why: '弾ける 會被念成 はじける（彈開），要念 ひける', lessons: true },
    { re: /降り/, why: '降ります 有 ふります（下雨）／おります（下車）兩種念法', lessons: false },
    { re: /開[かきくこいっ]/, why: '開く 有 あく／ひらく 兩種念法（開ける 只念 あける，不用改）', lessons: false },
    { re: /辛[いくかけ]/, why: '辛い 有 からい／つらい 兩種念法', lessons: false },
    { re: /角/, why: '角 有 かど／かく 兩種念法', lessons: false },
  ];

  it('容易念錯的詞，每一處都指定念法', () => {
    const bad: string[] = [];
    for (const r of RISKY) {
      if (r.lessons) {
        for (const s of [...spoken, ...inline]) if (r.re.test(jaPlain(s.ja)) && r.re.test(speechOf(s))) bad.push(`${s.where}「${jaPlain(s.ja)}」：${r.why}`);
      }
      for (const it of cards) {
        if (it.ex && r.re.test(it.ex.ja) && r.re.test(exampleSpeech(it.ex))) bad.push(`${it.id}「${it.ex.ja}」：${r.why}，要加 ex.say`);
      }
    }
    expect(bad).toEqual([]);
  });
});
