/**
 * AI 家教：情境會話的劇本、三種模式的系統提示與 JSON 格式。
 */
import { obj, arr, S, B, I } from '../lib/schema';
import type { TutorLevel } from '../state';

import { PURPOSE_LABEL, SCENARIOS, type Purpose, type Scenario } from './scenarios';

export { PURPOSE_LABEL, SCENARIOS };
export type { Purpose, Scenario };

export const LEVEL_LABEL: Record<TutorLevel, string> = {
  kana: '只用假名（剛學完五十音）',
  n5: '初級前半（N5）',
  n4: '初級後半（N4）',
};

const LEVEL_RULES: Record<TutorLevel, string> = {
  kana:
    'The learner has just finished learning hiragana and katakana and knows almost no grammar. Use very short sentences (about 5–12 kana), the most common words for this situation, and です／ます. Write `reply` entirely in hiragana and katakana — no kanji at all.',
  n5:
    'The learner is around JLPT N5. Use N5 grammar (です／ます, 〜てください, 〜たいです, 〜ませんか, basic particles) and common vocabulary. You may use common kanji in `reply`; `reading` gives the full kana.',
  n4:
    'The learner is around JLPT N4. Use N4 grammar (plain form, 〜たら, 〜と思います, potential form, basic honorific set phrases) and natural vocabulary. Use kanji normally in `reply`; `reading` gives the full kana.',
};

/* ---------------- 情境會話 ---------------- */
export interface ConversationTurn {
  reply: string;
  reading: string;
  translation: string;
  feedback: { ok: boolean; corrected: string; explanation: string };
  suggestions: { ja: string; reading: string; zh: string }[];
  done: boolean;
}

export const CONVERSATION_SCHEMA = obj({
  reply: S,
  reading: S,
  translation: S,
  feedback: obj({ ok: B, corrected: S, explanation: S }),
  suggestions: arr(obj({ ja: S, reading: S, zh: S })),
  done: B,
});

export function conversationSystem(s: Scenario, level: TutorLevel): string {
  return [
    'You are a friendly Japanese conversation partner and teacher for a Taiwanese adult learner whose native language is Traditional Chinese (Taiwan).',
    '',
    `Role-play scenario: ${s.setup}`,
    `You play: ${s.aiRole}. The learner plays: ${s.learnerRole}.`,
    `The learner's goal: ${s.goal}`,
    '',
    `Learner level: ${LEVEL_RULES[level]}`,
    '',
    'Rules:',
    '- Stay in character. Keep each reply to one or two short sentences so the learner can follow.',
    s.casual
      ? '- You are close friends, so use natural casual speech (plain form), but keep it simple. Never treat the learner\'s です／ます as a mistake. If the learner level says they have only just finished kana, stay with です／ます yourself too, because they have not learned plain forms yet.'
      : '- Use polite です／ます speech appropriate to the situation.',
    '- The learner may answer in Japanese, romaji, or Chinese when stuck. Understand what they mean and continue the scene.',
    '- `feedback` is only about the learner\'s most recent message. ok=true when it was natural and correct for the situation. When ok=false, `corrected` is the natural Japanese for what they meant (also when they wrote Chinese or romaji), and `explanation` is one or two short, kind sentences in Traditional Chinese (Taiwan) about the key fix. When ok=true, leave corrected and explanation empty.',
    '- `reading` is `reply` written entirely in hiragana/katakana (no kanji), with a space between phrases (文節) to help a beginner.',
    '- `translation` is a natural Traditional Chinese (Taiwan) translation of `reply`.',
    '- `suggestions`: exactly two short things the learner could say next, at their level, each with Japanese (`ja`), its full kana reading (`reading`) and Chinese (`zh`).',
    '- Set `done` to true only when the learner has reached the goal; then close the scene politely in `reply`.',
    '- In Chinese text use Taiwanese wording, e.g. 計程車 (not 出租車), 便利商店 (not 便利店), 影片 (not 視頻), 軟體 (not 軟件). Keep Japanese names such as Suica as they are instead of swapping in Taiwanese brands.',
  ].join('\n');
}

export const OPENING_MESSAGE =
  '（情境開始。請你先開口說第一句，帶出這個情境。學生還沒說話，所以 feedback.ok 設為 true，corrected 和 explanation 留空。）';

/* ---------------- 句子批改 ---------------- */
export interface Correction {
  verdict: 'correct' | 'minor' | 'wrong';
  corrected: string;
  reading: string;
  translation: string;
  issues: { part: string; fix: string; why: string }[];
  alternatives: { style: string; ja: string; zh: string }[];
  tip: string;
}

export const CORRECTION_SCHEMA = obj({
  verdict: { type: 'string', enum: ['correct', 'minor', 'wrong'] },
  corrected: S,
  reading: S,
  translation: S,
  issues: arr(obj({ part: S, fix: S, why: S })),
  alternatives: arr(obj({ style: S, ja: S, zh: S })),
  tip: S,
});

export function correctionSystem(level: TutorLevel): string {
  return [
    'You are a careful, encouraging Japanese teacher for a Taiwanese adult learner (native Traditional Chinese, Taiwan).',
    `Learner level: ${LEVEL_RULES[level]}`,
    'The learner sends a Japanese sentence they wrote, sometimes followed by the meaning they intended in Chinese. Check it and answer in the JSON format:',
    '- verdict: "correct" (natural and correct), "minor" (understandable but with small mistakes or unnatural wording), or "wrong" (grammar or meaning problems).',
    '- corrected: the most natural correct version that keeps the intended meaning and politeness level. If already correct, repeat it.',
    '- reading: `corrected` written entirely in kana (no kanji), with spaces between phrases.',
    '- translation: a Traditional Chinese (Taiwan) translation of `corrected`.',
    '- issues: one entry per mistake — part (the wrong fragment exactly as written), fix (its replacement), why (one short explanation in Traditional Chinese; name grammar points in Chinese with the Japanese term, e.g. 助詞「を」). Empty when correct.',
    '- alternatives: one or two other natural ways to say it, each with a Chinese style label such as「較口語」「更禮貌」, the Japanese, and Chinese.',
    '- tip: one short, encouraging learning tip in Traditional Chinese related to this sentence (may be empty).',
    'If the input is not Japanese, set verdict to "wrong", put the Japanese for what they seem to mean in `corrected`, and explain briefly in `issues`.',
  ].join('\n');
}

/* ---------------- AI 出題 ---------------- */
export interface QuizQuestion {
  prompt: string;
  ja: string;
  choices: string[];
  answer: number;
  explanation: string;
}

export const QUIZ_SCHEMA = obj({
  questions: arr(obj({ prompt: S, ja: S, choices: arr(S), answer: I, explanation: S })),
});

export interface QuizContext {
  level: TutorLevel;
  learnedKana: string;
  weakKana: string[];
  words: { ja: string; kana: string; zh: string }[];
  focus: 'mixed' | 'kana' | 'vocab';
}

export function quizSystem(): string {
  return [
    'You write short multiple-choice quizzes for a Taiwanese adult learning Japanese (native Traditional Chinese, Taiwan).',
    'Write exactly 5 questions. Use ONLY the kana and words listed in the learner context; do not introduce new vocabulary.',
    'Question types to mix (follow the requested focus): reading (Japanese → Chinese meaning), meaning (Chinese → choose the Japanese), kana recognition (which kana is pronounced X / which romaji), and — only when the level is n5 or n4 — choosing the right particle in a short sentence built from the listed words.',
    'Each question: prompt (the question in Traditional Chinese), ja (the Japanese shown with the question, or empty), choices (exactly 4 short options), answer (0-based index of the correct choice), explanation (one short sentence in Traditional Chinese, mention a memory tip when useful).',
    'Distractors must be plausible but clearly wrong; prefer look-alike kana and related words. Vary the position of the correct answer.',
    'Never use kanji when the level is "kana". Prioritise the weak kana and the listed words.',
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
  return { ok: raw.ok, corrected: text(raw.corrected), explanation: text(raw.explanation) };
}

/** 檢查並清理一則會話回覆；連回覆的句子都沒有就回傳 null */
export function sanitizeTurn(raw: unknown): ConversationTurn | null {
  if (!isRec(raw) || typeof raw.reply !== 'string') return null;
  return {
    reply: raw.reply,
    reading: text(raw.reading),
    translation: text(raw.translation),
    feedback: sanitizeFeedback(raw.feedback) ?? { ok: true, corrected: '', explanation: '' },
    suggestions: items(raw.suggestions).flatMap((s) =>
      isRec(s) && typeof s.ja === 'string' && s.ja.trim() ? [{ ja: s.ja, reading: text(s.reading), zh: text(s.zh) }] : [],
    ),
    done: raw.done === true,
  };
}

/** 檢查並清理一則批改結果；沒有更正後的句子就回傳 null */
export function sanitizeCorrection(raw: unknown): Correction | null {
  if (!isRec(raw) || typeof raw.corrected !== 'string') return null;
  const verdict = raw.verdict === 'correct' || raw.verdict === 'minor' || raw.verdict === 'wrong' ? raw.verdict : 'minor';
  return {
    verdict,
    corrected: raw.corrected,
    reading: text(raw.reading),
    translation: text(raw.translation),
    issues: items(raw.issues).flatMap((i) => (isRec(i) ? [{ part: text(i.part), fix: text(i.fix), why: text(i.why) }] : [])),
    alternatives: items(raw.alternatives).flatMap((a) =>
      isRec(a) && typeof a.ja === 'string' && a.ja.trim() ? [{ style: text(a.style), ja: a.ja, zh: text(a.zh) }] : [],
    ),
    tip: text(raw.tip),
  };
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
      answer,
      explanation: typeof r.explanation === 'string' ? r.explanation : '',
    });
  }
  return out;
}
