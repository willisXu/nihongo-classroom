/**
 * AI 家教：情境會話的劇本、三種模式的系統提示與 JSON 格式。
 */
import { obj, arr, S, B, I } from '../lib/schema';
import type { TutorLevel } from '../state';

export type Purpose = 'travel' | 'business' | 'daily' | 'anime';

export const PURPOSE_LABEL: Record<Purpose, string> = {
  travel: '旅遊',
  business: '職場',
  daily: '日常',
  anime: '動漫・音樂',
};

export interface Scenario {
  id: string;
  purpose: Purpose;
  title: string;
  /** 給學習者看的情境說明 */
  setup: string;
  /** 學習者要完成的事 */
  goal: string;
  /** 給模型的角色設定 */
  aiRole: string;
  learnerRole: string;
  /** 朋友之間的對話用普通體 */
  casual?: boolean;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'ramen', purpose: 'travel', title: '拉麵店點餐',
    setup: '你走進東京的一家拉麵店，店員來招呼你。',
    goal: '說人數、點一碗拉麵和一杯飲料，最後結帳。',
    aiRole: 'a cheerful staff member at a small ramen shop in Tokyo',
    learnerRole: 'a tourist from Taiwan who wants to eat ramen',
  },
  {
    id: 'hotel', purpose: 'travel', title: '飯店入住',
    setup: '你到大阪的飯店櫃台辦理入住。',
    goal: '報上名字、確認入住天數，問早餐時間和 Wi-Fi 密碼。',
    aiRole: 'a polite front-desk clerk at a business hotel in Osaka',
    learnerRole: 'a guest from Taiwan checking in',
  },
  {
    id: 'directions', purpose: 'travel', title: '問路去車站',
    setup: '你在京都迷路了，向路上的人問怎麼去京都車站。',
    goal: '問到怎麼走、要走多久，最後道謝。',
    aiRole: 'a kind local person walking on a street in Kyoto',
    learnerRole: 'a tourist who is lost and looking for Kyoto Station',
  },
  {
    id: 'konbini', purpose: 'travel', title: '便利商店結帳',
    setup: '你在便利商店買了便當和飲料，正要結帳。',
    goal: '回答要不要加熱、要不要袋子，選付款方式。',
    aiRole: 'a convenience store clerk at the register',
    learnerRole: 'a customer buying a bento and a drink',
  },
  {
    id: 'intro-work', purpose: 'business', title: '第一次見面自我介紹',
    setup: '你到日本合作廠商拜訪，第一次見到對方的窗口。',
    goal: '自我介紹（名字、公司、職務）、交換名片、寒暄一句。',
    aiRole: 'a Japanese business person meeting a new partner for the first time (use polite business Japanese, simple enough for the learner)',
    learnerRole: 'a product manager from a Taiwanese company visiting a partner',
  },
  {
    id: 'phone', purpose: 'business', title: '接到客戶電話',
    setup: '你在公司接到日本客戶打來的電話，對方要找的同事不在座位上。',
    goal: '接電話、說明同事不在，問要不要回電並記下對方的名字。',
    aiRole: 'a Japanese client calling the office and asking for a colleague named 田中 (Tanaka)',
    learnerRole: 'an office worker answering the phone',
  },
  {
    id: 'meeting', purpose: 'business', title: '會議前寒暄',
    setup: '線上會議開始前，你和日本同事先閒聊幾句。',
    goal: '打招呼、聊天氣或最近的工作，最後說「那我們開始吧」。',
    aiRole: 'a Japanese colleague chatting a little before an online meeting starts',
    learnerRole: 'a colleague from the Taiwan office',
  },
  {
    id: 'new-friend', purpose: 'daily', title: '認識新朋友',
    setup: '你在語言交換活動認識一位日本人。',
    goal: '互相自我介紹，聊出身地和興趣。',
    aiRole: 'a friendly Japanese person at a language exchange event, about the same age as the learner',
    learnerRole: 'a Taiwanese person learning Japanese',
  },
  {
    id: 'weekend', purpose: 'daily', title: '約週末出去玩',
    setup: '你想約日本朋友週末一起出去。',
    goal: '邀請對方、決定要去哪裡和幾點見面。',
    aiRole: 'a close Japanese friend', learnerRole: 'a friend inviting them out on the weekend', casual: true,
  },
  {
    id: 'anime-talk', purpose: 'anime', title: '聊喜歡的動畫',
    setup: '你和喜歡動畫的日本朋友聊天。',
    goal: '說出你喜歡的作品和角色，問對方的推薦。',
    aiRole: 'a Japanese friend who loves anime and manga', learnerRole: 'an anime fan from Taiwan', casual: true,
  },
  {
    id: 'karaoke', purpose: 'anime', title: '一起去唱 KTV',
    setup: '你和日本朋友在 KTV 包廂，正要點歌。',
    goal: '說想唱哪首歌或喜歡的歌手，邀對方一起唱。',
    aiRole: 'a Japanese friend at karaoke', learnerRole: 'a friend who likes J-pop', casual: true,
  },
];

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

/** 檢查並清理模型給的題目 */
export function sanitizeQuiz(raw: unknown): QuizQuestion[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { questions?: unknown }).questions)) return [];
  const out: QuizQuestion[] = [];
  for (const q of (raw as { questions: unknown[] }).questions) {
    if (!q || typeof q !== 'object') continue;
    const r = q as Record<string, unknown>;
    const choices = Array.isArray(r.choices) ? r.choices.filter((c): c is string => typeof c === 'string' && c.trim() !== '') : [];
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
