import { describe, expect, it } from 'vitest';
import { sanitizeCorrection, sanitizeFeedback, sanitizeQuiz, sanitizeTurn, type ConversationTurn, type Correction } from '../src/data/tutor';

const TURN: ConversationTurn = {
  reply: 'いらっしゃいませ！',
  reading: 'いらっしゃいませ',
  translation: '歡迎光臨！',
  feedback: { ok: false, corrected: 'ラーメンをください。', explanation: '要用「を」。' },
  suggestions: [{ ja: 'ひとりです。', reading: 'ひとり です', zh: '一個人。' }],
  done: false,
};

const CORRECTION: Correction = {
  verdict: 'wrong',
  corrected: 'わたしは たいわんじんです。',
  reading: 'わたしは たいわんじん です',
  translation: '我是台灣人。',
  issues: [{ part: 'が', fix: 'は', why: '主題用助詞「は」。' }],
  alternatives: [{ style: '更禮貌', ja: 'わたくしは たいわんじんで ございます。', zh: '我是台灣人。' }],
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
      feedback: { ok: true, corrected: '', explanation: '' },
      suggestions: [{ ja: 'えっと', reading: '', zh: '' }],
      done: false,
    });
    expect(sanitizeCorrection({ corrected: 'はい', verdict: 'great', issues: [null, { part: 'x' }], alternatives: [{ style: 'a' }, { ja: 'うん' }] })).toEqual({
      verdict: 'minor',
      corrected: 'はい',
      reading: '',
      translation: '',
      issues: [{ part: 'x', fix: '', why: '' }],
      alternatives: [{ style: '', ja: 'うん', zh: '' }],
      tip: '',
    });
  });

  it('restores saved quiz questions with the existing sanitizer', () => {
    const q = { prompt: '「あ」怎麼念？', ja: 'あ', choices: ['a', 'i', 'u', 'e'], answer: 0, explanation: '' };
    expect(sanitizeQuiz({ questions: [q, { prompt: 'x' }] })).toEqual([q]);
    expect(sanitizeQuiz({ questions: undefined })).toEqual([]);
  });
});
