/**
 * AI 家教：情境會話的劇本、三種模式的系統提示與 JSON 格式。
 */
import { obj, arr, S, B, I } from '../lib/schema';
import type { TutorLevel } from '../state';

import { PURPOSE_LABEL, SCENARIOS, type Purpose, type Scenario } from './scenarios';

export { PURPOSE_LABEL, SCENARIOS };
export type { Purpose, Scenario };

export const LEVEL_LABEL: Record<TutorLevel, string> = {
  kana: '只用假名（學五十音中、剛學完）',
  n5: '初級前半（N5）',
  n4: '初級後半（N4）',
};

/** 選單「自動」那一項後面的短名稱（完整名稱太長，手機上會超出畫面） */
export const LEVEL_SHORT: Record<TutorLevel, string> = {
  kana: '只用假名',
  n5: 'N5',
  n4: 'N4',
};

/** 學習者的程度（會話、批改共用） */
const LEVEL_DESC: Record<TutorLevel, string> = {
  kana: 'The learner has just finished learning hiragana and katakana and knows almost no grammar.',
  n5: 'The learner is around JLPT N5 (です／ます, 〜てください, 〜たいです, 〜ませんか, basic particles, common vocabulary).',
  n4: 'The learner is around JLPT N4 (plain form, 〜たら, 〜と思います, potential form, basic honorific set phrases, natural vocabulary).',
};

/**
 * 程度說明。還在學五十音（knownKana 是學過的假名）時，照實告訴模型：只認得這些字；
 * 畫面上有附羅馬拼音（romaji）時也說一聲，沒學過的字也跟得上。
 */
function levelDesc(level: TutorLevel, knownKana = '', romaji = false): string {
  if (level !== 'kana' || !knownKana) return LEVEL_DESC[level];
  const help = romaji
    ? 'The app shows romaji under every Japanese line, so they can follow even words with kana they have not learned; when it is natural, prefer words written with the kana above.'
    : 'Prefer words written with the kana above whenever it is natural.';
  return `The learner is still learning kana and can read only these so far: ${knownKana}. They know almost no grammar. ${help}`;
}

/** 寫日文的規則：只會假名的人看不懂漢字，每一個日文欄位（不只是回覆）都只用假名 */
const SCRIPT_RULE: Record<TutorLevel, string> = {
  kana: 'Write ALL Japanese you produce — every Japanese field in the JSON, including corrections, suggestions and alternatives — entirely in hiragana and katakana, with no kanji at all.',
  n5: 'You may use common kanji; every Japanese sentence comes with its full kana reading in the matching reading field.',
  n4: 'Use kanji normally; every Japanese sentence comes with its full kana reading in the matching reading field.',
};

/** 會話裡 AI 自己說的話要多長、多難 */
const SPEECH_RULE: Record<TutorLevel, string> = {
  kana: 'Use very short sentences (about 5–12 kana), the most common words for this situation, and です／ます.',
  n5: 'Use N5 grammar and common vocabulary.',
  n4: 'Use N4 grammar and natural vocabulary.',
};

/* ---------------- 情境會話 ---------------- */
export interface ConversationTurn {
  reply: string;
  reading: string;
  translation: string;
  feedback: { ok: boolean; corrected: string; reading: string; explanation: string };
  suggestions: { ja: string; reading: string; zh: string }[];
  done: boolean;
}

export const CONVERSATION_SCHEMA = obj({
  reply: S,
  reading: S,
  translation: S,
  feedback: obj({ ok: B, corrected: S, reading: S, explanation: S }),
  suggestions: arr(obj({ ja: S, reading: S, zh: S })),
  done: B,
});

export function conversationSystem(s: Scenario, level: TutorLevel, knownKana = '', romaji = false): string {
  return [
    'You are a friendly Japanese conversation partner and teacher for a Taiwanese adult learner whose native language is Traditional Chinese (Taiwan).',
    '',
    `Role-play scenario: ${s.setup}`,
    `You play: ${s.aiRole}. The learner plays: ${s.learnerRole}.`,
    `The learner's goal: ${s.goal}`,
    '',
    `Learner level: ${levelDesc(level, knownKana, romaji)} ${SPEECH_RULE[level]} ${SCRIPT_RULE[level]}`,
    '',
    'Rules:',
    '- Stay in character. Keep each reply to one or two short sentences so the learner can follow.',
    ...(s.learnerFirst ? ['- In this scene the learner speaks first (they pick up the phone). Their first message starts the scene; answer it in character.'] : []),
    // 常體（普通形）是 N4 才教：只會假名、N5 的學習者，朋友情境也用簡單的です／ます
    s.casual
      ? level === 'n4'
        ? '- You are close friends, so use natural casual speech (plain form), but keep it simple. Never treat the learner\'s です／ます as a mistake.'
        : '- You are close friends, but the learner has not learned plain forms yet (they come at N4), so use simple, friendly です／ます yourself and in your suggestions. Never treat the learner\'s です／ます as a mistake.'
      : '- Use polite です／ます speech appropriate to the situation.',
    '- The learner may answer in Japanese, romaji, or Chinese when stuck. Understand what they mean and continue the scene.',
    '- `feedback` is only about the learner\'s most recent message. ok=true when it was natural and correct for the situation. When ok=false, `corrected` is the natural Japanese for what they meant (also when they wrote Chinese or romaji), `reading` is `corrected` written entirely in kana, and `explanation` is one or two short, kind sentences in Traditional Chinese (Taiwan) about the key fix. When ok=true, leave corrected, reading and explanation empty.',
    '- `reading` is `reply` written entirely in hiragana/katakana (no kanji), with a space between phrases (文節) to help a beginner.',
    '- `translation` is a natural Traditional Chinese (Taiwan) translation of `reply`.',
    '- `suggestions`: exactly two short things the learner could say next, at their level, each with Japanese (`ja`), its full kana reading (`reading`) and Chinese (`zh`).',
    '- Set `done` to true only when the learner has reached the goal; then close the scene politely in `reply`.',
    '- In Chinese text use Taiwanese wording, e.g. 計程車 (not 出租車), 便利商店 (not 便利店), 影片 (not 視頻), 軟體 (not 軟件). Keep Japanese names such as Suica as they are instead of swapping in Taiwanese brands.',
  ].join('\n');
}

export const OPENING_MESSAGE =
  '（情境開始。請你先開口說第一句，帶出這個情境。學生還沒說話，所以 feedback.ok 設為 true，corrected、reading 和 explanation 留空。）';

/* ---------------- 句子批改 ---------------- */
export interface Correction {
  verdict: 'correct' | 'minor' | 'wrong';
  corrected: string;
  reading: string;
  translation: string;
  issues: { part: string; fix: string; why: string }[];
  alternatives: { style: string; ja: string; reading: string; zh: string }[];
  tip: string;
}

export const CORRECTION_SCHEMA = obj({
  verdict: { type: 'string', enum: ['correct', 'minor', 'wrong'] },
  corrected: S,
  reading: S,
  translation: S,
  issues: arr(obj({ part: S, fix: S, why: S })),
  alternatives: arr(obj({ style: S, ja: S, reading: S, zh: S })),
  tip: S,
});

export function correctionSystem(level: TutorLevel, knownKana = '', romaji = false): string {
  return [
    'You are a careful, encouraging Japanese teacher for a Taiwanese adult learner (native Traditional Chinese, Taiwan).',
    `Learner level: ${levelDesc(level, knownKana, romaji)} ${SCRIPT_RULE[level]} Keep the learner\'s meaning and roughly their sentence length; prefer words at their level.`,
    'The learner sends a Japanese sentence they wrote, sometimes followed by the meaning they intended in Chinese. Check it and answer in the JSON format:',
    '- verdict: "correct" (natural and correct), "minor" (understandable but with small mistakes or unnatural wording), or "wrong" (grammar or meaning problems).',
    '- corrected: the most natural correct version that keeps the intended meaning and politeness level. If already correct, repeat it.',
    '- reading: `corrected` written entirely in kana (no kanji), with spaces between phrases.',
    '- translation: a Traditional Chinese (Taiwan) translation of `corrected`.',
    '- issues: one entry per mistake — part (the wrong fragment exactly as written), fix (its replacement), why (one short explanation in Traditional Chinese; name grammar points in Chinese with the Japanese term, e.g. 助詞「を」). Empty when correct.',
    '- alternatives: one or two other natural ways to say it, each with a Chinese style label such as「較口語」「更禮貌」, the Japanese (`ja`), its full kana reading (`reading`), and Chinese (`zh`).',
    '- tip: one short, encouraging learning tip in Traditional Chinese related to this sentence (may be empty).',
    'If the input is not Japanese, set verdict to "wrong", put the Japanese for what they seem to mean in `corrected`, and explain briefly in `issues`.',
  ].join('\n');
}

/* ---------------- AI 出題 ---------------- */
/** 選項是哪一種文字：日文（假名或漢字）、中文、羅馬拼音 */
export type ChoiceLang = 'ja' | 'zh' | 'romaji';

export interface QuizQuestion {
  prompt: string;
  ja: string;
  choices: string[];
  /** 決定選項用日文還是中文的字型和念法（只有漢字的日文單字，光看字分不出來） */
  choiceLang: ChoiceLang;
  answer: number;
  explanation: string;
}

export const QUIZ_SCHEMA = obj({
  questions: arr(
    obj({ prompt: S, ja: S, choices: arr(S), choiceLang: { type: 'string', enum: ['ja', 'zh', 'romaji'] }, answer: I, explanation: S }),
  ),
});

export interface QuizContext {
  level: TutorLevel;
  learnedKana: string;
  weakKana: string[];
  words: { ja: string; kana: string; zh: string }[];
  focus: 'mixed' | 'kana' | 'vocab';
}

/**
 * 出題時日文怎麼寫。台灣學習者看得懂漢字：選項只有漢字的話，「中文 → 選日文」靠漢字就答得出來，等於沒考到日文。
 */
const QUIZ_SCRIPT_RULE: Record<TutorLevel, string> = {
  kana: 'Write every piece of Japanese (in prompt, ja, choices and explanation) only in hiragana and katakana, never kanji. The listed words are already given in kana; use them as given.',
  n5: 'When choices are Japanese, write each one in kana, or as kanji followed by its kana reading in full-width parentheses, e.g. 学校（がっこう）. If the ja field contains kanji, add its kana reading the same way. Never write a question that can be answered just by matching Chinese characters (for example 學校 → 学校): in "Chinese → choose the Japanese" questions the choices must differ in their kana.',
  n4: 'When choices are Japanese, write each one in kana, or as kanji followed by its kana reading in full-width parentheses, e.g. 学校（がっこう）. If the ja field contains kanji, add its kana reading the same way. Never write a question that can be answered just by matching Chinese characters (for example 學校 → 学校): in "Chinese → choose the Japanese" questions the choices must differ in their kana.',
};

export function quizSystem(level: TutorLevel): string {
  return [
    'You write short multiple-choice quizzes for a Taiwanese adult learning Japanese (native Traditional Chinese, Taiwan).',
    `Learner level: ${LEVEL_DESC[level]} ${QUIZ_SCRIPT_RULE[level]}`,
    'Write exactly 5 questions. Use ONLY the kana and words listed in the learner context; do not introduce new vocabulary.',
    'Question types to mix (follow the requested focus): reading (Japanese → Chinese meaning), meaning (Chinese → choose the Japanese), kana recognition (which kana is pronounced X / which romaji), and — only when the level is n5 or n4 — choosing the right particle in a short sentence built from the listed words.',
    'Each question: prompt (the question in Traditional Chinese), ja (the Japanese shown with the question, or empty), choices (exactly 4 short options), choiceLang (what the choices are written in: "ja" for Japanese kana or kanji, "zh" for Traditional Chinese, "romaji" for romaji), answer (0-based index of the correct choice), explanation (one short sentence in Traditional Chinese, mention a memory tip when useful).',
    'Distractors must be plausible but clearly wrong; prefer look-alike kana and related words. Vary the position of the correct answer.',
    'Prioritise the weak kana and the listed words.',
  ].join('\n');
}

export function quizUserMessage(ctx: QuizContext): string {
  return JSON.stringify({
    level: ctx.level,
    focus: ctx.focus,
    learned_kana: ctx.learnedKana,
    weak_kana: ctx.weakKana,
    words: ctx.words,
  });
}

/* ---------------- 從分頁紀錄還原時的檢查 ---------------- */
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const items = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** 檢查並清理對「我」那句話的回饋；格式不對就回傳 null */
export function sanitizeFeedback(raw: unknown): ConversationTurn['feedback'] | null {
  if (!isRec(raw) || typeof raw.ok !== 'boolean') return null;
  return { ok: raw.ok, corrected: text(raw.corrected), reading: text(raw.reading), explanation: text(raw.explanation) };
}

/** 檢查並清理一則會話回覆；連回覆的句子都沒有就回傳 null */
export function sanitizeTurn(raw: unknown): ConversationTurn | null {
  if (!isRec(raw) || typeof raw.reply !== 'string') return null;
  return {
    reply: raw.reply,
    reading: text(raw.reading),
    translation: text(raw.translation),
    feedback: sanitizeFeedback(raw.feedback) ?? { ok: true, corrected: '', reading: '', explanation: '' },
    suggestions: items(raw.suggestions).flatMap((s) =>
      isRec(s) && typeof s.ja === 'string' && s.ja.trim() ? [{ ja: s.ja, reading: text(s.reading), zh: text(s.zh) }] : [],
    ),
    done: raw.done === true,
  };
}

/** 檢查並清理一則批改結果；沒有更正後的句子就回傳 null */
export function sanitizeCorrection(raw: unknown): Correction | null {
  if (!isRec(raw) || typeof raw.corrected !== 'string') return null;
  // 大小寫不同（Correct、MINOR）也認得
  const v = typeof raw.verdict === 'string' ? raw.verdict.trim().toLowerCase() : '';
  const verdict = v === 'correct' || v === 'minor' || v === 'wrong' ? v : 'minor';
  return {
    verdict,
    corrected: raw.corrected,
    reading: text(raw.reading),
    translation: text(raw.translation),
    issues: items(raw.issues).flatMap((i) => (isRec(i) ? [{ part: text(i.part), fix: text(i.fix), why: text(i.why) }] : [])),
    alternatives: items(raw.alternatives).flatMap((a) =>
      isRec(a) && typeof a.ja === 'string' && a.ja.trim() ? [{ style: text(a.style), ja: a.ja, reading: text(a.reading), zh: text(a.zh) }] : [],
    ),
    tip: text(raw.tip),
  };
}

/** 選項的文字：照模型說的；以前存下來的題目沒有這一欄，就從選項猜（有假名是日文、全是英數是拼音，其他當中文） */
function choiceLangOf(raw: unknown, choices: string[]): ChoiceLang {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (v === 'ja' || v === 'zh' || v === 'romaji') return v;
  if (choices.some((c) => /[\u3040-\u30ff]/.test(c))) return 'ja';
  if (choices.every((c) => /^[\x20-\x7e]+$/.test(c))) return 'romaji';
  return 'zh';
}

/** 檢查並清理模型給的題目 */
export function sanitizeQuiz(raw: unknown): QuizQuestion[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { questions?: unknown }).questions)) return [];
  const out: QuizQuestion[] = [];
  for (const q of (raw as { questions: unknown[] }).questions) {
    if (!q || typeof q !== 'object') continue;
    const r = q as Record<string, unknown>;
    const rawChoices = Array.isArray(r.choices) ? r.choices : [];
    // 有空白選項就整題略過（過濾掉會讓答案的位置對不上）
    if (rawChoices.some((c) => typeof c !== 'string' || c.trim() === '')) continue;
    const choices = rawChoices as string[];
    const answer = typeof r.answer === 'number' ? Math.round(r.answer) : -1;
    if (typeof r.prompt !== 'string' || !r.prompt.trim()) continue;
    if (choices.length < 2 || answer < 0 || answer >= choices.length) continue;
    if (new Set(choices).size !== choices.length) continue;
    out.push({
      prompt: r.prompt,
      ja: typeof r.ja === 'string' ? r.ja : '',
      choices,
      choiceLang: choiceLangOf(r.choiceLang, choices),
      answer,
      explanation: typeof r.explanation === 'string' ? r.explanation : '',
    });
  }
  return out;
}
