// 每天的學習：今天的任務、錯題本、每天提醒
import { describe, expect, it } from 'vitest';
import { todayTasks, KANA_GOAL, WRITING_GOAL, type TodayInput } from '../src/lib/today';
import { vocabMistakes, weakKanaKeys, writingMistakes } from '../src/lib/mistakes';
import { foldLine, googleCalendarUrl, reminderIcs } from '../src/lib/reminder';
import { studyDayKey, DAY_MS } from '../src/lib/date';
import { HIRA_KEYS, KATA_KEYS } from '../src/lib/progress';
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

  it('五十音都學完、假名都熟悉：只剩單字卡', () => {
    const tasks = todayTasks(input({ lessons: lessonsDone(8), kana: allMastered() }));
    expect(tasks.map((t) => t.id)).toEqual(['vocab']);
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
