import { describe, expect, it } from 'vitest';
import { sanitizeCorrection, sanitizeFeedback, sanitizeQuiz, sanitizeTurn, type ConversationTurn, type Correction } from '../src/data/tutor';

const TURN: ConversationTurn = {
  reply: 'いらっしゃいませ！',
  reading: 'いらっしゃいませ',
  translation: '歡迎光臨！',
  feedback: { ok: false, corrected: 'ラーメンをください。', reading: 'らーめんを ください', explanation: '要用「を」。' },
  suggestions: [{ ja: 'ひとりです。', reading: 'ひとり です', zh: '一個人。' }],
  done: false,
};

const CORRECTION: Correction = {
  verdict: 'wrong',
  corrected: 'わたしは たいわんじんです。',
  reading: 'わたしは たいわんじん です',
  translation: '我是台灣人。',
  issues: [{ part: 'が', fix: 'は', why: '主題用助詞「は」。' }],
  alternatives: [{ style: '更禮貌', ja: 'わたくしは たいわんじんで ございます。', reading: 'わたくしは たいわんじんで ございます', zh: '我是台灣人。' }],
  tip: '自我介紹用「は」。',
};

describe('restoring tutor data from the tab session', () => {
  it('keeps valid turns and corrections unchanged (round trip through JSON)', () => {
    expect(sanitizeTurn(JSON.parse(JSON.stringify(TURN)))).toEqual(TURN);
    expect(sanitizeCorrection(JSON.parse(JSON.stringify(CORRECTION)))).toEqual(CORRECTION);
    expect(sanitizeFeedback(TURN.feedback)).toEqual(TURN.feedback);
  });

  it('rejects things that are not a turn or a correction', () => {
    for (const bad of [null, undefined, 'x', 3, [], {}, { reply: 5 }]) expect(sanitizeTurn(bad)).toBeNull();
    for (const bad of [null, 'x', [], {}, { corrected: null }]) expect(sanitizeCorrection(bad)).toBeNull();
    for (const bad of [null, {}, { ok: 'yes' }]) expect(sanitizeFeedback(bad)).toBeNull();
  });

  it('fills in missing or broken fields so the page can render', () => {
    expect(sanitizeTurn({ reply: 'はい', suggestions: [{ ja: 'えっと' }, { ja: '' }, 'x', null], feedback: 'bad', done: 'yes' })).toEqual({
      reply: 'はい',
      reading: '',
      translation: '',
      feedback: { ok: true, corrected: '', reading: '', explanation: '' },
      suggestions: [{ ja: 'えっと', reading: '', zh: '' }],
      done: false,
    });
    expect(sanitizeCorrection({ corrected: 'はい', verdict: 'great', issues: [null, { part: 'x' }], alternatives: [{ style: 'a' }, { ja: 'うん' }] })).toEqual({
      verdict: 'minor',
      corrected: 'はい',
      reading: '',
      translation: '',
      issues: [{ part: 'x', fix: '', why: '' }],
      alternatives: [{ style: '', ja: 'うん', reading: '', zh: '' }],
      tip: '',
    });
  });

  it('restores saved quiz questions with the existing sanitizer', () => {
    const q = { prompt: '「あ」怎麼念？', ja: 'あ', choices: ['a', 'i', 'u', 'e'], answer: 0, explanation: '' };
    // 以前存下來的題目沒有 choiceLang：從選項猜
    expect(sanitizeQuiz({ questions: [q, { prompt: 'x' }] })).toEqual([{ ...q, choiceLang: 'romaji' }]);
    expect(sanitizeQuiz({ questions: undefined })).toEqual([]);
    const kana = { ...q, prompt: '「a」是哪一個？', ja: '', choices: ['あ', 'お', 'め', 'ぬ'] };
    const zh = { ...q, prompt: '「がっこう」是什麼意思？', ja: 'がっこう', choices: ['學校', '老師', '電車', '學生'] };
    expect(sanitizeQuiz({ questions: [kana, zh] }).map((x) => x.choiceLang)).toEqual(['ja', 'zh']);
  });

  it('quiz choices written only in kanji are still Japanese when the model says so', () => {
    const q = { prompt: '「學校」的日文是？', ja: '', choices: ['学校', '先生', '電車', '学生'], choiceLang: 'ja', answer: 0, explanation: '' };
    expect(sanitizeQuiz({ questions: [q] })[0].choiceLang).toBe('ja');
    expect(sanitizeQuiz({ questions: [{ ...q, choiceLang: 'xx' }] })[0].choiceLang).toBe('zh'); // 不認得：從選項猜
  });
});

describe('程度規則', () => {
  it('只會假名的程度：會話和批改的每個日文欄位都要求只用假名，不只是回覆', async () => {
    const { conversationSystem, correctionSystem, SCENARIOS } = await import('../src/data/tutor');
    for (const sys of [conversationSystem(SCENARIOS[0], 'kana'), correctionSystem('kana')]) {
      expect(sys).toMatch(/ALL Japanese you produce/);
      expect(sys).toMatch(/no kanji/);
    }
    // 批改模式沒有「回覆」欄位，也不要求把學習者的句子縮成 5–12 個假名
    expect(correctionSystem('kana')).not.toMatch(/`reply`|5–12 kana/);
    expect(correctionSystem('n5')).not.toMatch(/ALL Japanese you produce/);
  });
});
