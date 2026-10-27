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

  it('AI 出題也照程度：只會假名不用漢字；N5／N4 的日文選項要看得出讀音，不出看漢字就答得出來的題', async () => {
    const { quizSystem } = await import('../src/data/tutor');
    expect(quizSystem('kana')).toMatch(/only in hiragana and katakana, never kanji/);
    for (const level of ['n5', 'n4'] as const) {
      expect(quizSystem(level)).toMatch(/kana reading/);
      expect(quizSystem(level)).toMatch(/matching Chinese characters/);
      expect(quizSystem(level)).not.toMatch(/never kanji/);
    }
  });

  it('朋友情境：常體是 N4 才教，只會假名和 N5 的程度用です／ます', async () => {
    const { conversationSystem, SCENARIOS } = await import('../src/data/tutor');
    const casual = SCENARIOS.find((s) => s.casual)!;
    for (const level of ['kana', 'n5'] as const) {
      expect(conversationSystem(casual, level)).toMatch(/has not learned plain forms yet/);
      expect(conversationSystem(casual, level)).not.toMatch(/use natural casual speech/);
    }
    expect(conversationSystem(casual, 'n4')).toMatch(/use natural casual speech \(plain form\)/);
  });

  it('朋友情境：N5 課程上到第 32 課（普通形）就用常體，系統提示不會同時說「學過普通形」又說「還沒學」', async () => {
    const { conversationSystem, PLAIN_FORM, SCENARIOS } = await import('../src/data/tutor');
    const { learnedGrammar, suggestedLevel } = await import('../src/lib/progress');
    const { COURSE_LESSONS, LESSON_META } = await import('../src/data/lessons/meta');
    // 第 32 課教普通形、作業連到 KTV（朋友情境）：課程資料要用同一個文法名稱
    const l32 = COURSE_LESSONS.find((l) => l.id === 32)!;
    expect(l32.grammar).toContain(PLAIN_FORM);
    const karaoke = SCENARIOS.find((s) => s.id === l32.tutor)!;
    expect(karaoke.casual).toBe(true);
    // 第 1–31 課完成、正在上第 32 課：自動程度是 N5，學過的文法已經有普通形
    const progress = { done: Object.fromEntries(LESSON_META.filter((l) => l.id <= 31).map((l) => [l.id, 1])), hw: {} };
    expect(suggestedLevel(progress)).toBe('n5');
    const grammar = learnedGrammar(progress, 'n5');
    const sys = conversationSystem(karaoke, 'n5', '', false, grammar);
    expect(sys).toContain(PLAIN_FORM);
    expect(sys).toMatch(/use natural casual speech \(plain form\)/);
    expect(sys).not.toMatch(/has not learned plain forms yet/);
    // 還沒上到第 32 課：照樣用です／ます
    const before = learnedGrammar({ done: Object.fromEntries(LESSON_META.filter((l) => l.id <= 20).map((l) => [l.id, 1])), hw: {} }, 'n5');
    expect(conversationSystem(karaoke, 'n5', '', false, before)).toMatch(/has not learned plain forms yet/);
    // 只用假名的程度不受學過的文法影響（那個程度要求很短的です／ます句子）
    expect(conversationSystem(karaoke, 'kana', '', false, grammar)).toMatch(/has not learned plain forms yet/);
  });

  it('還在學五十音：告訴 AI 學過哪些假名、畫面有羅馬拼音；學完了就照原本的說明', async () => {
    const { conversationSystem, correctionSystem, SCENARIOS } = await import('../src/data/tutor');
    const known = 'あいうえおかきくけこさしすせそ';
    for (const sys of [conversationSystem(SCENARIOS[0], 'kana', known, true), correctionSystem('kana', known, true)]) {
      expect(sys).toContain(`can read only these so far: ${known}`);
      expect(sys).toMatch(/romaji under every Japanese line/);
      expect(sys).toMatch(/ALL Japanese you produce/);
    }
    // 關掉羅馬拼音時不說畫面上有拼音
    expect(conversationSystem(SCENARIOS[0], 'kana', known, false)).not.toMatch(/romaji under every Japanese line/);
    expect(conversationSystem(SCENARIOS[0], 'kana', known, false)).toContain(known);
    expect(conversationSystem(SCENARIOS[0], 'kana')).toMatch(/has just finished learning hiragana and katakana/);
    // N5 以上不受影響
    expect(conversationSystem(SCENARIOS[0], 'n5', known)).not.toContain(known);
  });

  it('在上 N5／N4 課程：告訴 AI 學過哪些文法；沒上課時照原本的說明', async () => {
    const { conversationSystem, correctionSystem, SCENARIOS } = await import('../src/data/tutor');
    const grammar = ['〜は〜です', '〜ます／〜ません'];
    for (const sys of [conversationSystem(SCENARIOS[0], 'n5', '', false, grammar), correctionSystem('n5', '', false, grammar)]) {
      expect(sys).toContain('has learned these patterns so far: 〜は〜です, 〜ます／〜ません');
    }
    expect(conversationSystem(SCENARIOS[0], 'n5')).toMatch(/around JLPT N5/);
    // N4：N5 的文法都學過，另外列出學過的 N4 文法
    const n4 = ['可能形', '〜てあげます'];
    for (const sys of [conversationSystem(SCENARIOS[0], 'n4', '', false, n4), correctionSystem('n4', '', false, n4)]) {
      expect(sys).toContain('they have learned these N4 patterns so far: 可能形, 〜てあげます');
    }
    expect(conversationSystem(SCENARIOS[0], 'n4')).not.toContain('N4 patterns so far');
  });

  it('接電話的情境由學習者先開口：AI 不先說話，系統提示說明第一句是學習者的', async () => {
    const { conversationSystem, SCENARIOS } = await import('../src/data/tutor');
    const phone = SCENARIOS.find((s) => s.id === 'phone')!;
    expect(phone.learnerFirst?.suggestions.length).toBe(2);
    // 參考說法只用假名：各種程度都看得懂
    for (const sg of phone.learnerFirst!.suggestions) expect(sg.ja).toMatch(/^[\u3040-\u30ff、。！？ー\s]+$/u);
    expect(conversationSystem(phone, 'n5')).toMatch(/learner speaks first/);
    expect(SCENARIOS.filter((s) => s.learnerFirst).map((s) => s.id)).toEqual(['phone']);
    expect(conversationSystem(SCENARIOS[0], 'n5')).not.toMatch(/learner speaks first/);
  });
});

describe('模型回覆的大小寫', () => {
  it('判定、選項語言大小寫不同也認得', () => {
    expect(sanitizeCorrection({ verdict: 'Correct', corrected: 'はい' })?.verdict).toBe('correct');
    expect(sanitizeCorrection({ verdict: ' WRONG ', corrected: 'はい' })?.verdict).toBe('wrong');
    expect(sanitizeCorrection({ verdict: 'great', corrected: 'はい' })?.verdict).toBe('minor');
    const qs = sanitizeQuiz({ questions: [{ prompt: '？', ja: '', choices: ['a', 'b'], choiceLang: 'ZH', answer: 0, explanation: '' }] });
    expect(qs[0].choiceLang).toBe('zh');
  });
});

describe('自動程度', () => {
  const upTo = async (n: number, skip: number[] = []) => {
    const { LESSON_META } = await import('../src/data/lessons/meta');
    return { done: Object.fromEntries(LESSON_META.filter((l) => l.id <= n && !skip.includes(l.id)).map((l) => [l.id, 1])), hw: {} };
  };

  it('還在上五十音是只用假名；N5 全部完成，或已經完成任何一課 N4 就是 N4', async () => {
    const { suggestedLevel, learnedGrammar } = await import('../src/lib/progress');
    expect(suggestedLevel(await upTo(0))).toBe('kana');
    expect(suggestedLevel(await upTo(7))).toBe('kana');
    expect(suggestedLevel(await upTo(8))).toBe('n5');
    expect(suggestedLevel(await upTo(31))).toBe('n5');
    expect(suggestedLevel(await upTo(32))).toBe('n4');
    // N5 有一課忘了勾完成，但 N4 已經上到第 45 課：不會一直停在 N5，學過的 N4 文法也會告訴 AI
    const skipped = await upTo(45, [11]);
    expect(suggestedLevel(skipped)).toBe('n4');
    const grammar = learnedGrammar(skipped, 'n4');
    expect(grammar).toEqual(expect.arrayContaining(['受身', '可能形']));
    // 五十音的課漏按一課、但已經在上初級課程（或會假名、直接從第 9 課開始）：照初級課程的進度，不是只用假名
    expect(suggestedLevel(await upTo(45, [3]))).toBe('n4');
    expect(suggestedLevel({ done: { 9: 1, 10: 1 }, hw: {} })).toBe('n5');
  });
});
