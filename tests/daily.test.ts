// 每天的學習：今天的任務、錯題本、每天提醒
import { describe, expect, it } from 'vitest';
import { todayTasks, KANA_GOAL, WRITING_GOAL, type TodayInput } from '../src/lib/today';
import { vocabMistakes, weakKanaKeys, writingMistakes } from '../src/lib/mistakes';
import { foldLine, googleCalendarUrl, reminderIcs } from '../src/lib/reminder';
import { studyDayKey, DAY_MS } from '../src/lib/date';
import { HIRA_KEYS, KATA_KEYS, learnedKanji } from '../src/lib/progress';
import { LESSON_META } from '../src/data/lessons/meta';
import type { CardState } from '../src/lib/srs';
import type { KanaStats } from '../src/state';

const NOW = new Date(2026, 9, 13, 12, 0).getTime(); // 中午，離學習日的分界（凌晨 4 點）很遠
const TODAY = studyDayKey(NOW);

function input(patch: Partial<TodayInput> = {}): TodayInput {
  return {
    activity: {},
    kana: {},
    lessons: { done: {}, hw: {} },
    srs: { cards: {}, days: {} },
    writing: {},
    newPerDay: 10,
    now: NOW,
    ...patch,
  };
}

const lessonsDone = (n: number) => ({ done: Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, NOW])), hw: {} });
const card = (patch: Partial<CardState>): CardState => ({ due: NOW + DAY_MS, ivl: 3, ease: 2.5, reps: 3, lapses: 0, step: -1, last: NOW - DAY_MS, ...patch });
const allMastered = (): KanaStats =>
  Object.fromEntries([...HIRA_KEYS, ...KATA_KEYS].map((k) => [k, { c: 3, w: 0, s: 3, t: NOW }]));

describe('今天的任務', () => {
  it('第一天：假名測驗和手寫，還沒有單字卡', () => {
    const tasks = todayTasks(input());
    expect(tasks.map((t) => t.id)).toEqual(['kana', 'writing']);
    expect(tasks.every((t) => !t.done)).toBe(true);
    expect(tasks.find((t) => t.id === 'writing')!.to).toBe('/writing?lesson=1');
  });

  it('今天答滿題數、寫滿字數就打勾；昨天做的不算', () => {
    const yesterday = studyDayKey(NOW - DAY_MS);
    const almost = todayTasks(input({ activity: { [TODAY]: { kana: KANA_GOAL - 1, writing: WRITING_GOAL }, [yesterday]: { kana: 50 } } }));
    expect(almost.find((t) => t.id === 'kana')!.done).toBe(false);
    expect(almost.find((t) => t.id === 'writing')!.done).toBe(true);
    const done = todayTasks(input({ activity: { [TODAY]: { kana: KANA_GOAL, writing: WRITING_GOAL } } }));
    expect(done.every((t) => t.done)).toBe(true);
  });

  it('學完平假名（第 6 課）後加入單字卡：有到期或新卡就還沒完成', () => {
    const tasks = todayTasks(input({ lessons: lessonsDone(6), srs: { cards: { 'n5-0001': card({ due: NOW - 1000 }) }, days: {} } }));
    const vocab = tasks.find((t) => t.id === 'vocab')!;
    expect(tasks[0]).toBe(vocab);
    expect(vocab.done).toBe(false);
    expect(vocab.detail).toBe('還有 1 張到期、10 張新卡');
    expect(vocab.action).toBe('開始複習');
  });

  it('單字卡：沒有到期、今天的新卡學完了就完成；複習次數含錯題本的加強練習（和學習紀錄頁一樣）', () => {
    const tasks = todayTasks(
      input({
        lessons: lessonsDone(6),
        activity: { [TODAY]: { review: 17 } },
        srs: { cards: { 'n5-0001': card({}) }, days: { [TODAY]: { reviews: 14, fresh: 10, rev: 4, forgot: 0 } } },
      }),
    );
    const vocab = tasks.find((t) => t.id === 'vocab')!;
    expect(vocab.done).toBe(true);
    expect(vocab.detail).toBe('今天複習了 17 次，都完成了');
  });

  it('還沒學完平假名，但已經開始背單字，也會列入', () => {
    const tasks = todayTasks(input({ lessons: lessonsDone(2), srs: { cards: { 'travel-0003': card({}) }, days: {} }, newPerDay: 0 }));
    expect(tasks.find((t) => t.id === 'vocab')?.done).toBe(true);
  });

  it('五十音都學完、假名都熟悉：單字卡，加上手寫 N5 這一課的漢字', () => {
    const tasks = todayTasks(input({ lessons: lessonsDone(8), kana: allMastered() }));
    expect(tasks.map((t) => t.id)).toEqual(['vocab', 'writing']);
    expect(tasks.find((t) => t.id === 'writing')?.to).toBe(`/writing?chars=${encodeURIComponent('日本人名会社')}`);
  });

  it('上到沒有新漢字的課（或全部學完）：手寫學過、還沒寫過的漢字；都寫過了才不列', () => {
    const upTo = (LESSON_META.find((l) => l.kind === 'course' && !l.kanji)?.id ?? LESSON_META.length + 1) - 1;
    for (const n of [upTo, LESSON_META.length]) {
      const lessons = lessonsDone(n);
      const learned = [...learnedKanji(lessons)];
      expect(learned.length).toBeGreaterThan(100);
      // 寫過第一個字：連結只帶還沒寫過的字
      const writing = { [learned[0]]: { n: 1, recall: 0, lastMistakes: 0, t: NOW } };
      const tasks = todayTasks(input({ lessons, kana: allMastered(), writing }));
      expect(tasks.map((t) => t.id)).toEqual(['vocab', 'writing']);
      expect(tasks.find((t) => t.id === 'writing')?.to).toBe(`/writing?chars=${encodeURIComponent(learned.slice(1).join(''))}`);
      // 學過的漢字都寫過了：只剩單字卡
      const all = Object.fromEntries(learned.map((ch) => [ch, { n: 1, recall: 0, lastMistakes: 0, t: NOW }]));
      expect(todayTasks(input({ lessons, kana: allMastered(), writing: all })).map((t) => t.id)).toEqual(['vocab']);
    }
  });

  it('上初級課程以後不再每天假名測驗：只有答錯、還沒練熟的假名時，練那幾個字', () => {
    const lessons = lessonsDone(LESSON_META.length);
    // 沒做過假名測驗（會假名、直接上初級課程）：不列
    expect(todayTasks(input({ lessons })).map((t) => t.id)).not.toContain('kana');
    // 都熟悉之後答錯一個：練那一個字，連對 3 次的份量
    const kana = { ...allMastered(), 'k:ヌ': { c: 9, w: 1, s: 0, t: NOW } };
    const one = todayTasks(input({ lessons, kana })).find((t) => t.id === 'kana')!;
    expect(one).toMatchObject({ title: '複習答錯的假名', to: '/practice?focus=weak', goal: 3, done: false });
    expect(one.detail).toBe('還有 1 個字沒練熟，今天答了 0 題');
    // 答錯很多個：最多每天 20 題
    const many = { ...kana, 'h:ぬ': { c: 0, w: 2, s: 0, t: NOW }, 'h:め': { c: 0, w: 1, s: 1, t: NOW }, 'h:ね': { c: 1, w: 1, s: 0, t: NOW }, 'h:わ': { c: 0, w: 3, s: 0, t: NOW }, 'k:シ': { c: 0, w: 1, s: 0, t: NOW }, 'k:ツ': { c: 0, w: 1, s: 0, t: NOW }, 'k:ソ': { c: 0, w: 1, s: 0, t: NOW } };
    expect(todayTasks(input({ lessons, kana: many })).find((t) => t.id === 'kana')?.goal).toBe(KANA_GOAL);
    // 今天答滿就打勾（還沒練熟也一樣）
    const done = todayTasks(input({ lessons, kana, activity: { [TODAY]: { kana: 3 } } })).find((t) => t.id === 'kana')!;
    expect(done.done).toBe(true);
    // 照錯題練習的方式練熟了（連對 3 次，不再是答錯的字）：任務不消失，留到今天結束打勾
    const fixed = { ...kana, 'k:ヌ': { c: 12, w: 1, s: 3, t: NOW } };
    const kept = todayTasks(input({ lessons, kana: fixed, activity: { [TODAY]: { kana: 3 } } })).find((t) => t.id === 'kana');
    expect(kept).toMatchObject({ done: true, detail: '答錯的假名都練熟了，今天答了 3 題' });
    // 今天沒練、也沒有答錯的字：不列
    expect(todayTasks(input({ lessons, kana: fixed })).map((t) => t.id)).not.toContain('kana');
    // 還在上五十音課程時照舊每天 20 題
    expect(todayTasks(input({ lessons: lessonsDone(7) })).find((t) => t.id === 'kana')).toMatchObject({ title: `假名測驗 ${KANA_GOAL} 題`, to: '/practice', goal: KANA_GOAL });
    // 學完第 8 課、還沒上第 9 課：片假名多半還不熟，照舊每天 20 題
    expect(todayTasks(input({ lessons: lessonsDone(8) })).find((t) => t.id === 'kana')).toMatchObject({ title: `假名測驗 ${KANA_GOAL} 題`, goal: KANA_GOAL });
  });

  it('沒有按完五十音的 8 課也照初級課程的進度：手寫這一課的漢字，不寫假名', () => {
    const at = (ids: number[]) => ({ done: Object.fromEntries(ids.map((i) => [i, NOW])), hw: {} });
    const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
    // 漏按第 7 課、上到第 40 課
    const gap = todayTasks(input({ lessons: at([1, 2, 3, 4, 5, 6, 8, ...range(9, 40)]) }));
    const lesson41 = LESSON_META.find((l) => l.id === 41)!;
    expect(lesson41.kind === 'course' && lesson41.kanji).toBeTruthy();
    expect(gap.map((t) => t.id)).toEqual(['vocab', 'writing']);
    expect(gap.find((t) => t.id === 'writing')?.to).toBe(`/writing?chars=${encodeURIComponent(lesson41.kind === 'course' ? lesson41.kanji : '')}`);
    // 會假名、直接從第 9 課開始
    const skip = todayTasks(input({ lessons: at([9]) }));
    expect(skip.map((t) => t.id)).toEqual(['vocab', 'writing']);
    expect(skip.find((t) => t.id === 'writing')?.to).toBe(`/writing?chars=${encodeURIComponent('何先生')}`);
  });
});

describe('錯題本', () => {
  it('答錯過、還沒連對 3 次的假名，錯越多越前面', () => {
    const kana: KanaStats = {
      'h:あ': { c: 5, w: 1, s: 0, t: 1 },
      'h:ぬ': { c: 1, w: 4, s: 1, t: 1 },
      'h:め': { c: 9, w: 3, s: 3, t: 1 }, // 已經連對 3 次
      'k:シ': { c: 0, w: 2, s: 0, t: 1 },
    };
    expect(weakKanaKeys(kana)).toEqual(['h:ぬ', 'k:シ', 'h:あ']);
  });

  it('單字：忘記過的列入，按過「記住了」或變成熟卡就拿掉；舊紀錄用忘記次數補', () => {
    const misses = {
      'n5-0001': { n: 2, t: 100, ok: 0 },
      'n5-0002': { n: 1, t: 100, ok: 200 }, // 記住了
      'n5-0003': { n: 3, t: 100, ok: 0 }, // 後來變成熟卡
    };
    const cards = {
      'n5-0003': card({ ivl: 30, last: 300 }),
      'n5-0004': card({ lapses: 1, last: 50 }), // 錯題本之前就忘記過
      'n5-0005': card({ lapses: 2, ivl: 40, last: 60 }), // 忘記過但已經是熟卡
    };
    expect(vocabMistakes(misses, cards).map((m) => m.id)).toEqual(['n5-0001', 'n5-0004']);
  });

  it('單字：這個版本不認得的卡片（比較新版匯出的備份）不算，首頁的題數和錯題本頁一致', () => {
    const misses = { 'n6-0001': { n: 2, t: 100, ok: 0 }, 'n4plus-0369': { n: 1, t: 100, ok: 0 } };
    const cards = { 'n6-0002': card({ lapses: 1 }), 'n4plus-0001': card({ lapses: 1, last: 50 }) };
    expect(vocabMistakes(misses, cards).map((m) => m.id)).toEqual(['n4plus-0369', 'n4plus-0001']);
  });

  it('手寫：上次寫錯的字，最近寫的在前面', () => {
    const w = {
      あ: { n: 3, recall: 0, lastMistakes: 1, t: 10 },
      い: { n: 2, recall: 1, lastMistakes: 0, t: 30 },
      う: { n: 1, recall: 0, lastMistakes: 2, t: 20 },
    };
    expect(writingMistakes(w).map((m) => `${m.ch}${m.strokes}`)).toEqual(['う2', 'あ1']);
  });
});

describe('每天提醒', () => {
  const url = 'https://willisxu.github.io/nihongo-classroom/';
  const morning = new Date(2026, 9, 13, 9, 0).getTime();
  const night = new Date(2026, 9, 13, 22, 0).getTime();

  it('Google 行事曆連結：當地時間、每天重複；時間已過就從明天開始', () => {
    const today = new URL(googleCalendarUrl({ time: '20:30', url, now: morning }));
    expect(today.hostname).toBe('calendar.google.com');
    expect(today.searchParams.get('dates')).toBe('20261013T203000/20261013T205000');
    expect(today.searchParams.get('recur')).toBe('RRULE:FREQ=DAILY');
    expect(today.searchParams.get('details')).toContain(url);
    const tomorrow = new URL(googleCalendarUrl({ time: '20:30', url, now: night }));
    expect(tomorrow.searchParams.get('dates')).toBe('20261014T203000/20261014T205000');
  });

  it('.ics：每天重複、開始時提醒，每行不超過 75 個位元組', () => {
    const ics = reminderIcs({ time: '07:05', url, now: morning });
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/); // 一律 CRLF
    const lines = ics.split('\r\n').slice(0, -1);
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('DTSTART:20261014T070500'); // 7:05 已經過了，從明天開始
    expect(unfolded).toContain('RRULE:FREQ=DAILY');
    expect(unfolded).toContain('TRIGGER:PT0M');
    expect(unfolded).toContain(`DESCRIPTION:打開日文自學教室，做完今天的任務：${url}`);
  });

  it('.ics：再下載一次（例如改了時間）是同一個行程的新版，不會多出一個', () => {
    const first = reminderIcs({ time: '07:05', url, now: morning });
    const later = reminderIcs({ time: '21:00', url, now: morning + 3 * 86_400_000 });
    const field = (ics: string, name: string) => new RegExp(`^${name}:(.*)$`, 'm').exec(ics)?.[1].trim();
    expect(field(first, 'UID')).toBe('nihongo-daily-reminder@nihongo-classroom');
    expect(field(later, 'UID')).toBe(field(first, 'UID'));
    expect(Number(field(later, 'SEQUENCE'))).toBeGreaterThan(Number(field(first, 'SEQUENCE')));
    expect(Number(field(later, 'SEQUENCE'))).toBeLessThan(2 ** 31); // 行事曆程式多半用 32 位元整數存
  });

  it('折行不會把中文字切開，拼回去和原本一樣', () => {
    const line = `DESCRIPTION:${'日文自學教室，'.repeat(12)}`;
    const folded = foldLine(line);
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });
});
