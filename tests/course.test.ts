/**
 * N5 課程（第 9 課起）的課文檢查：日文格式、漢字都標了讀音、單字卡和漢字清單一致、練習題答案合理。
 */
import { describe, expect, it } from 'vitest';
import { COURSE_LESSON_DATA, KANA_LESSON_DATA } from './lessonData';
import { COURSE_LESSONS, UNITS, courseLessonById, lessonMetaById } from '../src/data/lessons/meta';
import type { CourseLesson, DrillItem, Inline, JaText, LessonBlock } from '../src/data/types';
import { bareKanji, isKanji, jaPlain, jaReading, parseJa, wordSay } from '../src/lib/ja';
import { deckById, vocabById } from '../src/data/vocab';
import { SCENARIOS } from '../src/data/scenarios';
import { getStrokePaths } from '../src/lib/strokes';
import { toHiragana } from '../src/lib/romaji';
import { KANJI, kanjiInfo } from '../src/data/kanji';
import { conjugate } from '../src/lib/verbs';

/**
 * 一段說明文字（Inline）裡的日文：[[…]]（| 前面）和 {{…}}。
 * 只有一個漢字的 {{会}} 是在說「這個字」（字形），不用標讀音。
 */
function inlineJa(text: Inline): JaText[] {
  const out: JaText[] = [];
  for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) out.push(m[1].split('|')[0]);
  for (const m of text.matchAll(/\{\{([^}]+)\}\}/g)) if (!/^\p{Script=Han}$/u.test(m[1])) out.push(m[1]);
  return out;
}

/** 一課所有的說明文字 */
function inlinesOf(l: CourseLesson): Inline[] {
  const out: Inline[] = [l.summary, ...l.goals, ...l.homework, ...(l.next ? [l.next] : []), ...(l.companion ?? [])];
  for (const s of l.sections) for (const b of s.blocks) out.push(...blockInlines(b));
  return out;
}

function blockInlines(b: LessonBlock): Inline[] {
  switch (b.type) {
    case 'p':
      return [b.text];
    case 'callout':
      return b.items;
    case 'table':
      return b.rows.flat();
    case 'dialog':
      return b.scene ? [b.scene] : [];
    case 'grammar':
      return [...b.points, ...b.examples.flatMap((e) => (e.note ? [e.note] : []))];
    case 'examples':
      return b.items.flatMap((e) => (e.note ? [e.note] : []));
    case 'vocab':
      return [...(b.note ? [b.note] : []), ...b.items.flatMap((w) => (w.note ? [w.note] : []))];
    case 'kanji':
      return b.items.flatMap((k) => (k.note ? [k.note] : []));
    case 'drill':
      return [...(b.intro ? [b.intro] : []), ...b.items.flatMap((d) => [...('q' in d && d.q ? [d.q] : []), ...(d.why ? [d.why] : [])])];
    default:
      return [];
  }
}

/** 一課所有的日文句子（JaText），附上位置方便看錯誤訊息 */
function jaTextsOf(l: CourseLesson): { where: string; text: JaText }[] {
  const out: { where: string; text: JaText }[] = [];
  for (const t of inlinesOf(l)) for (const j of inlineJa(t)) out.push({ where: '說明文字', text: j });
  for (const s of l.sections) {
    for (const b of s.blocks) {
      const at = (what: string) => `「${s.title}」的${what}`;
      if (b.type === 'dialog') for (const ln of b.lines) out.push({ where: at('會話'), text: ln.ja }, { where: at('會話的人名'), text: ln.who });
      if (b.type === 'grammar') {
        out.push({ where: at('句型'), text: b.form });
        for (const e of b.examples) out.push({ where: at('例句'), text: e.ja });
      }
      if (b.type === 'examples') for (const e of b.items) out.push({ where: at('例句'), text: e.ja });
      if (b.type === 'vocab') for (const w of b.items) out.push({ where: at('單字'), text: w.ja });
      if (b.type === 'kanji') for (const k of b.items) for (const w of k.words) out.push({ where: at(`漢字 ${k.ch} 的詞`), text: w.ja });
      if (b.type === 'drill') {
        for (const d of b.items) {
          if (d.kind === 'choice') {
            if (d.ja) out.push({ where: at('練習題'), text: d.ja });
            for (const o of d.options) out.push({ where: at('練習題的選項'), text: o });
          }
          if (d.kind === 'order') for (const t of d.tiles) out.push({ where: at('排列題'), text: t });
          if (d.kind === 'listen') out.push({ where: at('聽力題'), text: d.ja });
        }
      }
    }
  }
  return out;
}

/** 網站裡的連結：有這一頁（App.tsx 的路由）、這一課、這個牌組、這個 AI 家教情境 */
const PAGES = /^\/(?:lessons(?:\/\d+)?|chart|mistakes|stats|practice|writing|vocab(?:\/[\w-]+)?|review\/[\w-]+|tutor|roadmap|settings)?$/;
function linkProblem(href: string): string | null {
  if (!href.startsWith('/')) return null;
  const u = new URL(href, 'https://x.test');
  if (!PAGES.test(u.pathname)) return '沒有這一頁';
  const lessonId = /^\/lessons\/(\d+)$/.exec(u.pathname)?.[1];
  if (lessonId && !lessonMetaById(Number(lessonId))) return '沒有這一課';
  const review = /^\/review\/([\w-]+)$/.exec(u.pathname)?.[1];
  if (review) {
    const n = /^lesson-(\d+)$/.exec(review)?.[1];
    if (n ? !courseLessonById(Number(n)) : review !== 'all' && !deckById(review)) return '沒有這個單字卡牌組';
  }
  const deck = /^\/vocab\/([\w-]+)$/.exec(u.pathname)?.[1];
  if (deck && !deckById(deck)) return '沒有這個單字牌組';
  if (u.pathname === '/tutor') {
    const mode = u.searchParams.get('mode');
    if (mode && !['chat', 'correct', 'quiz'].includes(mode)) return '沒有這個 AI 家教模式';
    const sc = u.searchParams.get('scenario');
    if (sc && !SCENARIOS.some((s) => s.id === sc)) return '沒有這個 AI 家教情境';
  }
  return null;
}

const blocksOf = (l: CourseLesson) => l.sections.flatMap((s) => s.blocks);
const drillsOf = (l: CourseLesson): DrillItem[] => blocksOf(l).flatMap((b) => (b.type === 'drill' ? b.items : []));

describe('N5 的漢字', () => {
  it('讀音、台灣寫法的格式；課程教的字都在清單裡，清單裡的字都有一課教', () => {
    const bad: string[] = [];
    const taught = new Set(COURSE_LESSONS.flatMap((l) => [...l.kanji]));
    const seen = new Set<string>();
    for (const k of KANJI) {
      if (seen.has(k.ch)) bad.push(`${k.ch} 重複`);
      seen.add(k.ch);
      if ([...k.ch].length !== 1 || !isKanji(k.ch)) bad.push(`${k.ch} 不是一個漢字`);
      if (k.tc !== undefined && (k.tc === k.ch || [...k.tc].length !== 1)) bad.push(`${k.ch} 的台灣寫法 ${k.tc} 不對（一樣的話不用填）`);
      if (!k.zh) bad.push(`${k.ch} 沒有中文意思`);
      if (!k.on.length && !k.kun.length) bad.push(`${k.ch} 沒有讀音`);
      for (const r of k.on) if (!/^[ァ-ヺー]+$/u.test(r)) bad.push(`${k.ch} 的音讀 ${r} 要用片假名`);
      for (const r of k.kun) if (!/^[ぁ-ゖ]+(・[ぁ-ゖ]+)?$/u.test(r)) bad.push(`${k.ch} 的訓讀 ${r} 要用平假名（送假名用・分開）`);
      if (!getStrokePaths(k.ch)) bad.push(`${k.ch} 沒有筆順資料（npm run strokes）`);
      if (!taught.has(k.ch)) bad.push(`${k.ch} 沒有一課教`);
    }
    for (const ch of taught) if (!seen.has(ch)) bad.push(`${ch} 不在 data/kanji.ts 裡`);
    expect(bad).toEqual([]);
  });
});

describe('N5 課程', () => {
  it('課程摘要：每一課都屬於一個單元，單元照順序', () => {
    expect(COURSE_LESSON_DATA.map((l) => l.id)).toEqual(COURSE_LESSONS.map((l) => l.id));
    if (!COURSE_LESSONS.length) return;
    expect(COURSE_LESSONS[0].id).toBe(KANA_LESSON_DATA.length + 1);
    const units = COURSE_LESSONS.map((l) => l.unit);
    expect([...units].sort((a, b) => a - b)).toEqual(units);
    for (const u of new Set(units)) expect(UNITS.some((x) => x.n === u), `沒有第 ${u} 單元的名稱`).toBe(true);
  });

  it('同一張單字卡只在一課的單字區塊出現（後面的課再用到就列在「學過的詞」）', () => {
    const first = new Map<string, number>();
    const bad: string[] = [];
    for (const l of COURSE_LESSON_DATA) {
      const ids = new Set(blocksOf(l).flatMap((b) => (b.type === 'vocab' ? b.items.flatMap((w) => (w.id ? [w.id] : [])) : [])));
      for (const id of ids) {
        if (first.has(id)) bad.push(`${id}（${vocabById(id)?.kanji ?? vocabById(id)?.kana}）：第 ${first.get(id)} 課和第 ${l.id} 課`);
        else first.set(id, l.id);
      }
    }
    expect(bad).toEqual([]);
  });

  it('每個漢字只在一課當新字教', () => {
    const seen = new Map<string, number>();
    for (const l of COURSE_LESSONS) {
      for (const ch of l.kanji) {
        expect(seen.has(ch), `「${ch}」在第 ${seen.get(ch)} 課和第 ${l.id} 課都是新字`).toBe(false);
        seen.set(ch, l.id);
      }
    }
  });

  for (const lesson of COURSE_LESSON_DATA) {
    describe(`第 ${lesson.id} 課 ${lesson.title}`, () => {
      it('基本欄位', () => {
        expect(lesson.title && lesson.headline && lesson.summary).toBeTruthy();
        expect(lesson.goals.length).toBeGreaterThan(0);
        expect(lesson.grammar.length).toBeGreaterThan(0);
        expect(lesson.sections.length).toBeGreaterThan(0);
        expect(lesson.homework.length).toBeGreaterThan(0);
        const ids = lesson.sections.map((s) => s.id);
        expect(new Set(ids).size, '段落 id 重複').toBe(ids.length);
        expect(ids.includes('homework'), '段落 id 不能叫 homework（作業用了）').toBe(false);
        if (lesson.tutor) expect(SCENARIOS.some((s) => s.id === lesson.tutor), `沒有 AI 家教情境 ${lesson.tutor}`).toBe(true);
      });

      it('日文的格式正確，漢字都標了讀音', () => {
        const bad: string[] = [];
        for (const { where, text } of jaTextsOf(lesson)) {
          try {
            parseJa(text);
          } catch (e) {
            bad.push(`${where}：${(e as Error).message}`);
            continue;
          }
          const bare = bareKanji(text);
          if (bare.length) bad.push(`${where}「${text}」：${bare.join('')} 沒有標讀音`);
          // 讀音只能是平假名（外來語可以有片假名）、長音和標點
          if (/[a-zA-Z0-9]/.test(jaReading(text).replace(/[〜～]/g, ''))) bad.push(`${where}「${text}」：讀音裡有英數字`);
        }
        expect(bad).toEqual([]);
      });

      it('說明文字的標記成對、連結格式正確', () => {
        const bad: string[] = [];
        for (const t of inlinesOf(lesson)) {
          const count = (re: RegExp) => (t.match(re) || []).length;
          if (count(/\[\[/g) !== count(/\]\]/g)) bad.push(`[[ ]] 沒有成對：${t}`);
          if (count(/\{\{/g) !== count(/\}\}/g)) bad.push(`{{ }} 沒有成對：${t}`);
          if (count(/\*\*/g) % 2) bad.push(`** 沒有成對：${t}`);
          // 單獨的 は、へ 點了會念 ha、he（見 lib/speech.ts 的 speechFor）：當助詞介紹時寫 [[は|わ]]、[[へ|え]]
          if (/\[\[[はへ]\]\]/.test(t)) bad.push(`助詞 は／へ 要寫成 [[は|わ]]、[[へ|え]]：${t}`);
          // 中文說明裡不直接寫「漢字《讀音》」：日文要用 [[ ]] 或 {{ }} 包起來（書名號《大家的日本語》不算）
          const outside = t.replace(/\[\[[^\]]+\]\]/g, '').replace(/\{\{[^}]+\}\}/g, '');
          if (/[\p{Script=Han}々]《[\u3041-\u30ff]+》|[〔〕｜]/u.test(outside)) bad.push(`日文沒有用 [[ ]] 或 {{ }} 包起來：${t}`);
          for (const m of t.matchAll(/\[[^[\]]+\]\(([^)]*)\)/g)) {
            const href = m[1];
            if (!href.startsWith('/') && !href.startsWith('https://')) bad.push(`連結要用 / 或 https:// 開頭：${m[0]}`);
            if (href.startsWith('/writing')) {
              const chars = new URL(href, 'https://x.test').searchParams.get('chars') ?? '';
              const miss = [...chars].filter((c) => !getStrokePaths(c));
              if (!chars || miss.length) bad.push(`手寫的連結要帶有筆順資料的字：${m[0]}`);
            }
            if (href.startsWith('/practice')) bad.push(`N5 的課不連假名測驗：${m[0]}`);
            const problem = linkProblem(href);
            if (problem) bad.push(`${problem}：${m[0]}`);
          }
        }
        expect(bad).toEqual([]);
      });

      it('單字：對應的單字卡讀音、寫法一樣', () => {
        const ids: string[] = [];
        const bad: string[] = [];
        for (const b of blocksOf(lesson)) {
          if (b.type !== 'vocab') continue;
          for (const w of b.items) {
            expect(w.zh, `${w.ja} 缺少中文`).toBeTruthy();
            if (!w.id) continue;
            ids.push(w.id);
            const card = vocabById(w.id);
            if (!card) {
              bad.push(`${w.ja}：找不到單字卡 ${w.id}`);
              continue;
            }
            const reading = jaReading(w.ja).replace(/[〜～]/g, '');
            const plain = jaPlain(w.ja).replace(/[〜～]/g, '');
            let cardKana = card.kana.replace(/[〜～]/g, '');
            let cardForm = (card.kanji ?? card.kana).replace(/[〜～]/g, '');
            // 動詞可以寫成ます形（ます／ません／ました／ませんでした；第 25 課教辭書形以前，課文都用ます形）：和單字卡的辭書形變化比對
            const masuEnd = /ま(?:す|せん|した|せんでした)$/.exec(reading)?.[0];
            if (card.pos === 'verb' && card.verbGroup && masuEnd && !/ます$/.test(cardKana)) {
              cardKana = conjugate(cardKana, card.verbGroup, 'masu').replace(/ます$/, masuEnd);
              cardForm = conjugate(cardForm, card.verbGroup, 'masu').replace(/ます$/, masuEnd);
            }
            if (toHiragana(reading) !== toHiragana(cardKana)) bad.push(`${w.ja}（${w.id}）：讀音 ${reading} 和單字卡的 ${card.kana} 不一樣`);
            // 單字卡指定了念法（語音容易念錯）：課文念出來要一樣
            if (card.say && (w.say ?? wordSay(w.ja)) !== card.say) bad.push(`${w.ja}（${w.id}）：單字卡念「${card.say}」，課文念「${w.say ?? wordSay(w.ja)}」`);
            if (plain !== cardForm && plain !== cardKana) bad.push(`${w.ja}（${w.id}）：寫法 ${plain} 和單字卡的 ${cardForm} 不一樣`);
          }
        }
        expect(bad).toEqual([]);
        expect(new Set(ids).size, '同一張單字卡出現兩次').toBe(ids.length);
      });

      it('摘要（meta.ts）的 words 和課文的單字卡 id 一致', () => {
        const ids = blocksOf(lesson).flatMap((b) => (b.type === 'vocab' ? b.items.flatMap((w) => (w.id ? [w.id] : [])) : []));
        expect(lesson.words).toEqual(ids);
      });

      it('漢字：摘要的 kanji 和漢字區塊一致；讀音、例詞合理', () => {
        const chars: string[] = [];
        const bad: string[] = [];
        for (const b of blocksOf(lesson)) {
          if (b.type !== 'kanji') continue;
          for (const k of b.items) {
            chars.push(k.ch);
            if (!kanjiInfo(k.ch)) bad.push(`${k.ch} 不在 data/kanji.ts 裡`);
            if (!k.words.length) bad.push(`${k.ch} 沒有例詞`);
            for (const w of k.words) if (!jaPlain(w.ja).includes(k.ch)) bad.push(`${k.ch} 的例詞 ${w.ja} 裡沒有這個字`);
          }
        }
        expect(bad).toEqual([]);
        expect(chars.join('')).toBe(lesson.kanji);
      });

      it('練習題：答案在選項裡、選項不重複、排列題至少兩塊', () => {
        const bad: string[] = [];
        for (const d of drillsOf(lesson)) {
          if (d.kind === 'order') {
            if (d.tiles.length < 2) bad.push(`排列題只有一塊：${d.tiles.join('')}`);
            // 另一種也對的順序：同樣的詞塊換順序（不能多、不能少、不能和答案一樣）
            const key = (ts: string[]) => [...ts].sort().join('\u0000');
            const seen = new Set([d.tiles.join('\u0000')]);
            for (const a of d.also ?? []) {
              if (key(a) !== key(d.tiles)) bad.push(`排列題的 also 要用一樣的詞塊：${a.join('／')}`);
              if (seen.has(a.join('\u0000'))) bad.push(`排列題的 also 和答案或別的 also 重複：${a.join('／')}`);
              seen.add(a.join('\u0000'));
            }
            continue;
          }
          const opts = d.options.map((o) => (d.kind === 'choice' ? jaPlain(o) : o));
          if (d.answer < 0 || d.answer >= d.options.length) bad.push(`答案超出選項：${opts.join('／')}`);
          if (new Set(opts).size !== opts.length) bad.push(`選項重複：${opts.join('／')}`);
          if (d.options.length < 2) bad.push(`選項太少：${opts.join('／')}`);
          if (d.kind === 'choice') {
            if (!d.q && !d.ja) bad.push(`選擇題沒有題目：${opts.join('／')}`);
            if (d.ja && !/＿＿/.test(d.ja)) bad.push(`題目句沒有空格（＿＿）：${d.ja}`);
          }
        }
        expect(bad).toEqual([]);
        expect(drillsOf(lesson).length, '每一課至少要有幾題練習').toBeGreaterThanOrEqual(6);
      });
    });
  }
});
