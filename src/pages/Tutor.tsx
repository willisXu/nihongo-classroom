import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
// AI 回覆可能出現網站資料沒有的漢字：這一頁才載入完整的 Klee One 來補（其他頁用裁過的 NK Kana 就夠）
import '@fontsource/klee-one/600.css';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CONVERSATION_SCHEMA, CORRECTION_SCHEMA, LEVEL_LABEL, LEVEL_SHORT, OPENING_MESSAGE, PURPOSE_LABEL, QUIZ_SCHEMA, SCENARIOS,
  conversationSystem, correctionSystem, quizSystem, quizUserMessage, sanitizeCorrection, sanitizeFeedback, sanitizeQuiz, sanitizeTurn,
  type ConversationTurn, type Correction, type Purpose, type QuizQuestion, type Scenario,
} from '../data/tutor';
import { DECKS } from '../data/vocab';
import { KANA_LESSONS } from '../data/lessons/meta';
import {
  addUsage, apiKeyStore, kanaStore, lessonStore, settingsStore, srsStore, updateSettings, type TutorLevel,
} from '../state';
import { isObj, num, oneOf, str, useStore } from '../state/store';
import { TutorError, callJSON, estimateCost, preloadClaudeApi, toTutorError } from '../lib/claude';
import { kanaCourseDone, learnedGrammar, learnedKana, nextKanaLesson, suggestedLevel } from '../lib/progress';
import { phraseRomaji } from '../lib/romaji';
import { speak } from '../lib/speech';
import { usePageTitle } from '../lib/title';
import { focusLost } from '../lib/flashcard';
import { useOnline } from '../lib/pwa';
import { ApiKeySetup } from '../components/ApiKeySetup';
import { Segmented, Switch } from '../components/Controls';
import { SpeakIcon } from '../components/Speak';
import { Hanamaru } from '../components/Hanamaru';
import { Icon } from '../components/Icon';

type Mode = 'chat' | 'correct' | 'quiz';
const MODES = ['chat', 'correct', 'quiz'] as const;
type Msg = { role: 'user' | 'assistant'; content: string };
/** 一段對話的用量；費用在每次呼叫時用當時的模型計價 */
type Cost = { input: number; output: number; usd: number };
const NO_COST: Cost = { input: 0, output: 0, usd: 0 };

function useLevel(): [TutorLevel, TutorLevel | 'auto'] {
  const settings = useStore(settingsStore);
  const lessons = useStore(lessonStore);
  const level = settings.tutorLevel === 'auto' ? suggestedLevel(lessons) : settings.tutorLevel;
  return [level, settings.tutorLevel];
}

/** 有假名才標成日文（中文或羅馬拼音標成日文，會用日文字型和念法） */
const hasKana = (text: string) => /[぀-ヿ]/.test(text);

/** 選項標日文的條件：模型說選項是日文（只有漢字的單字也算），或選項裡有假名 */
const choiceLang = (q: QuizQuestion, c: string) => (q.choiceLang === 'ja' || hasKana(c) ? 'ja' : undefined);

/** 讀音和原句只差在空格（只用假名的程度）：顯示分好詞的讀音，比較好念 */
const sameKana = (a: string, b: string) => a.replace(/\s/g, '') === b.replace(/\s/g, '');

/** 等待中：還沒連上（連線中）或已經在回覆 */
type Phase = 'connect' | 'reply';
const WAIT_LABEL: Record<Phase, string> = { connect: '正在連線…', reply: 'AI 正在回覆…' };

/** 一句日文下面的羅馬拼音（還在學五十音時才顯示） */
function RomajiLine({ reading, className = 'b-romaji' }: { reading: string; className?: string }) {
  const text = phraseRomaji(reading);
  return text ? <p className={className}>{text}</p> : null;
}

/** 有沒有設定「減少動態效果」：自動捲動時不用平滑捲動 */
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * 剛按的按鈕消失（送出換成停止、作答後選項停用…），焦點掉回 body 時，放到下一個該用的地方。
 * 只在有滑鼠或鍵盤的裝置上把焦點放回輸入框：手機上會把鍵盤叫出來，蓋住剛收到的回覆。
 */
function refocus(el: HTMLElement | null | undefined, opts: { textEntry?: boolean } = {}) {
  if (!el || !focusLost()) return;
  if (opts.textEntry && !matchMedia('(pointer: fine)').matches) return;
  el.focus({ preventScroll: true });
}

/** 呼叫一次 Claude，並把用量記下來（收到回應就計費，之後格式不對或被拒絕也一樣） */
function ask<T>(opts: {
  system: string;
  messages: Msg[];
  schema: Record<string, unknown>;
  maxTokens: number;
  effort: 'low' | 'medium';
  signal?: AbortSignal;
  /** 把前面的對話快取起來（會話用） */
  cache?: boolean;
  /** 連上了（伺服器開始回應） */
  onConnect?: () => void;
  onUsage?: (cost: Cost) => void;
}) {
  const model = settingsStore.get().model;
  const { onUsage, ...rest } = opts;
  return callJSON<T>({
    apiKey: apiKeyStore.get(),
    model,
    ...rest,
    onUsage: (input, output, cache) => {
      const all = input + cache.write + cache.read;
      addUsage(model, all, output, true, cache);
      onUsage?.({ input: all, output, usd: estimateCost(model, input, output, cache.write, cache.read) });
    },
  });
}

/**
 * 剛送出後的這段時間不理會「停止」：連點兩下送出時，第二下會落在同一個位置剛換上的「停止」。
 * 只有會話的輸入框需要（批改、出題的「停止」在原本按鈕的旁邊，不會誤按，按了就要停）。
 */
const STOP_GUARD_MS = 600;

function useStopGuard() {
  const since = useRef(Number.NEGATIVE_INFINITY);
  return useMemo(
    () => ({
      /** 送出請求時呼叫 */
      arm() {
        since.current = performance.now();
      },
      /** 現在按「停止」算不算數 */
      ready() {
        return performance.now() - since.current >= STOP_GUARD_MS;
      },
    }),
    [],
  );
}

/* ---------------- 這個分頁的家教紀錄 ---------------- */
// 存在 sessionStorage：每個分頁各一份，換到設定頁再回來、重新整理都還在，關掉分頁就清掉。
// 不放 localStorage，對話內容不需要長期保存，也不會跟著備份匯出。
const SESSION_KEY = 'nk.tutorSession';

function readSession(): Record<string, unknown> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const data: unknown = raw ? JSON.parse(raw) : null;
    return isObj(data) ? data : {};
  } catch {
    return {};
  }
}

function writeSession(part: 'mode' | 'chat' | 'correct' | 'quiz', value: unknown) {
  try {
    const data = readSession();
    if (value === null) delete data[part];
    else data[part] = value;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {
    /* 私密視窗或空間不足：存不進去就算了，頁面照常運作 */
  }
}

export default function Tutor() {
  usePageTitle('AI 日文家教');
  const apiKey = useStore(apiKeyStore);
  // 有金鑰就先在背景載入 Claude SDK，第一次送出不用等
  useEffect(() => {
    if (apiKey) preloadClaudeApi();
  }, [apiKey]);
  const [params, setParams] = useSearchParams();
  // 網址參數只在進來時讀一次，讀完就清掉，避免切換或返回時重新開場（會再收一次費）
  const [initial] = useState(() => {
    const scenario = params.get('scenario');
    const m = params.get('mode');
    const mode: Mode = m ? (m === 'correct' || m === 'quiz' ? m : 'chat') : scenario ? 'chat' : oneOf(readSession().mode, MODES, 'chat');
    return { scenario, mode };
  });
  /** 網址指定的情境。對話用過就清掉，之後重新掛載（例如在別的分頁移除又加回金鑰）不會再開場一次 */
  const scenarioParam = useRef(initial.scenario);
  const [mode, setMode] = useState<Mode>(initial.mode);
  /** 目前看得到的模式：回覆送到時，只有看得到的面板才自動念出來 */
  const modeRef = useRef(mode);
  const [level, levelPref] = useLevel();
  const lessons = useStore(lessonStore);
  const online = useOnline();
  // 還在學五十音：告訴 AI 學過哪些假名（加上正在學的這一課），畫面上附羅馬拼音
  const knownKana =
    kanaCourseDone(lessons) ? '' : learnedKana(lessons) + (nextKanaLesson(lessons)?.newKana.join('') ?? '');
  // 在上 N5 課程：告訴 AI 學過哪些文法（完成的課和正在上的那一課）
  // N4 程度：N5 的文法都會了，只列 N4 課程學過的句型
  const grammar = useMemo(() => learnedGrammar(lessons, level === 'n4' ? 'n4' : 'n5'), [lessons, level]);

  // 在這一頁設定好金鑰時，設定的區塊會整個換成家教畫面（「連線成功」來不及看到、焦點也會掉）：
  // 另外顯示一行成功訊息，焦點放在那裡
  const [keyJustSaved, setKeyJustSaved] = useState(false);
  const keySavedRef = useRef<HTMLParagraphElement>(null);
  const hadKey = useRef(!!apiKey);
  useEffect(() => {
    if (apiKey && !hadKey.current) setKeyJustSaved(true);
    if (!apiKey) setKeyJustSaved(false);
    hadKey.current = !!apiKey;
  }, [apiKey]);
  useEffect(() => {
    if (keyJustSaved && focusLost()) keySavedRef.current?.focus({ preventScroll: true });
  }, [keyJustSaved]);

  useEffect(() => {
    if (params.get('scenario') || params.get('mode')) setParams({}, { replace: true });
  }, [params, setParams]);

  useEffect(() => {
    writeSession('mode', mode);
  }, [mode]);

  const changeMode = (m: Mode) => {
    modeRef.current = m;
    setMode(m);
  };
  const shown = (m: Mode) => () => modeRef.current === m;

  return (
    <div className="wrap">
      <header className="ph">
        <p className="eyebrow">Claude · AI 日文家教</p>
        <h1>AI 日文家教</h1>
        <p className="lede">情境會話練開口、句子批改練寫作、AI 出題練弱點。程度會配合你的進度，卡住時可以先用中文說。</p>
      </header>

      {!online ? (
        <div className="vnote offline-note" role="status">
          <p>現在沒有網路。AI 家教要連上網路才能用；課程、練習和單字卡離線也能用。</p>
        </div>
      ) : null}

      {keyJustSaved && apiKey ? (
        <p className="key-status tone-ok" role="status" tabIndex={-1} ref={keySavedRef}>
          <Icon name="check" size={16} /> 金鑰設定好了，連線測試成功。選一個模式開始吧。
        </p>
      ) : null}

      {!apiKey ? (
        <section className="card setup-card" aria-labelledby="h-setup">
          <h2 id="h-setup">先設定 API 金鑰</h2>
          <p className="muted">AI 家教使用你自己的 Anthropic API 金鑰，費用依用量計算，直接從你的 API 帳戶扣款。</p>
          <ApiKeySetup />
        </section>
      ) : (
        <>
          <div className="toolbar tutor-tools">
            <Segmented
              label="模式"
              value={mode}
              onChange={changeMode}
              options={[
                { value: 'chat', label: '情境會話' },
                { value: 'correct', label: '句子批改' },
                { value: 'quiz', label: 'AI 出題' },
              ]}
            />
            <label className="inline-select" htmlFor="tutor-level">
              程度
              <select
                id="tutor-level"
                value={levelPref}
                onChange={(e) => updateSettings({ tutorLevel: e.target.value as TutorLevel | 'auto' })}
              >
                <option value="auto">自動（目前：{LEVEL_SHORT[suggestedLevel(lessons)]}）</option>
                {(Object.keys(LEVEL_LABEL) as TutorLevel[]).map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </option>
                ))}
              </select>
            </label>
            <UsageLine />
          </div>
          {/* 三個模式都保持掛載，切換時不會丟掉對話或重新呼叫 API；離開這頁再回來時從分頁紀錄還原 */}
          <div hidden={mode !== 'chat'}>
            <Conversation level={level} knownKana={knownKana} grammar={grammar} scenarioParam={scenarioParam} isShown={shown('chat')} />
          </div>
          <div hidden={mode !== 'correct'}>
            <Corrector level={level} knownKana={knownKana} grammar={grammar} isShown={shown('correct')} />
          </div>
          <div hidden={mode !== 'quiz'}>
            <AiQuiz level={level} />
          </div>
        </>
      )}
    </div>
  );
}

function UsageLine() {
  const settings = useStore(settingsStore);
  return (
    <p className="usage-line">
      模型：{settings.model.replace('claude-', '').replace(/-(\d)-(\d)$/, ' $1.$2')} · <Link to="/settings">設定</Link>
    </p>
  );
}

/* ================= 情境會話 ================= */

interface ChatEntry {
  role: 'ai' | 'me';
  text?: string;
  turn?: ConversationTurn;
  /** AI 對「我」這句話的回饋 */
  feedback?: ConversationTurn['feedback'];
}

interface ChatSession {
  scenario: Scenario;
  entries: ChatEntry[];
  history: Msg[];
  cost: Cost;
  error: string | null;
  /** 還沒送出的草稿 */
  input: string;
}

const isMsg = (v: unknown): v is Msg => isObj(v) && (v.role === 'user' || v.role === 'assistant') && typeof v.content === 'string';

function toEntry(v: unknown): ChatEntry[] {
  if (!isObj(v)) return [];
  if (v.role === 'ai') {
    const turn = sanitizeTurn(v.turn);
    return turn ? [{ role: 'ai', turn }] : [];
  }
  if (v.role === 'me' && typeof v.text === 'string') {
    const feedback = sanitizeFeedback(v.feedback);
    return [feedback ? { role: 'me', text: v.text, feedback } : { role: 'me', text: v.text }];
  }
  return [];
}

/** 讀回這個分頁存著的對話；沒有或格式不對就回傳 null */
function loadChat(): ChatSession | null {
  const raw = readSession().chat;
  if (!isObj(raw)) return null;
  const scenario = SCENARIOS.find((s) => s.id === raw.scenario);
  if (!scenario) return null;
  const cost: Record<string, unknown> = isObj(raw.cost) ? raw.cost : {};
  return {
    scenario,
    entries: Array.isArray(raw.entries) ? raw.entries.flatMap(toEntry) : [],
    history: Array.isArray(raw.history) ? raw.history.filter(isMsg) : [],
    cost: { input: num(cost.input), output: num(cost.output), usd: num(cost.usd) },
    error: str(raw.error) || null,
    input: str(raw.input),
  };
}

/**
 * 決定對話怎麼開始：網址指定了情境，而這個分頁沒有同一個情境的對話 → 開場；
 * 否則接上這個分頁存著的對話，不自動開場（每次開場都會收費）。
 */
function bootChat(scenarioId: string | null): { saved: ChatSession | null; start: Scenario | null } {
  const saved = loadChat();
  const wanted = scenarioId ? (SCENARIOS.find((s) => s.id === scenarioId) ?? null) : null;
  // 由學習者先開口的情境，還沒說話時也接上（保留打到一半的第一句；反正開場不用呼叫 API）
  const resumable = saved && saved.scenario.id === wanted?.id && (saved.history.length > 0 || !!saved.scenario.learnerFirst);
  if (wanted && !resumable) return { saved: null, start: wanted };
  return { saved, start: null };
}

/** 還原時最後一句還在等回覆：那個請求在離開這一頁時已經取消了，讓使用者決定要不要重送 */
function restoredError(s: ChatSession): string | null {
  if (s.error) return s.error;
  const last = s.history[s.history.length - 1];
  if (last?.role !== 'user') return null;
  return last.content === OPENING_MESSAGE
    ? 'AI 開口之前就離開了這一頁。按「再試一次」讓 AI 說第一句。'
    : '離開這一頁時，這一句還沒收到回覆。按「再試一次」重新送出，或直接輸入新的句子。';
}

function Conversation({
  level,
  knownKana,
  grammar,
  scenarioParam,
  isShown,
}: {
  level: TutorLevel;
  knownKana: string;
  grammar: string[];
  scenarioParam: RefObject<string | null>;
  isShown: () => boolean;
}) {
  const settings = useStore(settingsStore);
  // 只用假名的程度：每句日文附羅馬拼音（和單字卡的「羅馬拼音」同一個設定）
  const romajiOn = level === 'kana' && settings.showRomaji;
  const [boot] = useState(() => bootChat(scenarioParam.current));
  const [scenario, setScenario] = useState<Scenario | null>(boot.start ?? boot.saved?.scenario ?? null);
  const [entries, setEntries] = useState<ChatEntry[]>(boot.saved?.entries ?? []);
  /**
   * 讀螢幕軟體只念最新的一則回覆（和對我那句話的回饋）。整串對話不設成播報區：
   * 打開「假名讀音」「中文翻譯」時每個泡泡都會多出一行，整段對話會被重念一次。
   */
  const [heard, setHeard] = useState<{ id: number; ok: boolean; corrected: string; ja: string; zh: string; done: boolean } | null>(null);
  /** 已送出的對話紀錄；最後一則若是 user，代表還在等（或等失敗了，可以重試或改送別句） */
  const [history, setHistory] = useState<Msg[]>(boot.saved?.history ?? []);
  const [input, setInput] = useState(boot.saved?.input ?? '');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>('connect');
  const [error, setError] = useState<string | null>(() => (boot.saved ? restoredError(boot.saved) : null));
  const [cost, setCost] = useState<Cost>(boot.saved?.cost ?? NO_COST);
  const [filter, setFilter] = useState<Purpose | 'all'>('all');
  const abort = useRef<AbortController | null>(null);
  /** 換情境或重新開始時加一：舊對話還沒結束的請求，用量不會算進新的對話 */
  const conversation = useRef(0);
  const stopGuard = useStopGuard();
  const composerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatHeading = useRef<HTMLHeadingElement>(null);
  const pickHeading = useRef<HTMLHeadingElement>(null);
  const composing = useRef(false);

  // 選了情境、換情境時，按的按鈕不見了：焦點放到新畫面的標題
  const shownScenario = useRef(scenario?.id ?? null);
  useEffect(() => {
    const id = scenario?.id ?? null;
    if (shownScenario.current === id) return;
    shownScenario.current = id;
    refocus(scenario ? chatHeading.current : pickHeading.current);
  }, [scenario]);

  useEffect(() => {
    writeSession('chat', scenario ? { scenario: scenario.id, entries, history, cost, error, input } : null);
  }, [scenario, entries, history, cost, error, input]);

  const send = async (msgs: Msg[], sc: Scenario) => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const conv = conversation.current;
    stopGuard.arm();
    setBusy(true);
    setPhase('connect');
    setError(null);
    try {
      const res = await ask<unknown>({
        system: conversationSystem(sc, level, knownKana, romajiOn, grammar),
        messages: msgs,
        schema: CONVERSATION_SCHEMA,
        maxTokens: 4000,
        effort: 'low',
        signal: ctrl.signal,
        cache: true,
        onConnect: () => {
          if (abort.current === ctrl) setPhase('reply');
        },
        // 和總用量同一個時機記：收到回應就計費，之後格式不對或被拒絕也一樣
        onUsage: (u) => {
          if (conversation.current === conv) setCost((c) => ({ input: c.input + u.input, output: c.output + u.output, usd: c.usd + u.usd }));
        },
      });
      if (ctrl.signal.aborted) return;
      // 少了欄位（例如沒有建議說法）也不會讓畫面出錯；連回覆的句子都沒有才算格式不對
      const turn = sanitizeTurn(res.data);
      if (!turn) throw new TutorError('收到的回覆格式不對，請再試一次。', 'invalid');
      setHistory([...msgs, { role: 'assistant', content: JSON.stringify(turn) }]);
      setEntries((list) => {
        const out = list.slice();
        // 回饋屬於我的上一句
        for (let i = out.length - 1; i >= 0; i--) {
          if (out[i].role === 'me') {
            if (!out[i].feedback) out[i] = { ...out[i], feedback: turn.feedback };
            break;
          }
          if (out[i].role === 'ai') break;
        }
        out.push({ role: 'ai', turn });
        return out;
      });
      // AI 的第一句（開場）沒有回應我說的話：畫面上不顯示回饋，播報也不念
      const answered = msgs[msgs.length - 1]?.content !== OPENING_MESSAGE;
      setHeard((h) => ({
        id: (h?.id ?? 0) + 1,
        ok: answered && turn.feedback.ok,
        corrected: answered && !turn.feedback.ok ? turn.feedback.corrected : '',
        ja: turn.reply,
        zh: settingsStore.get().showTranslation ? turn.translation : '',
        done: turn.done,
      }));
      // 回覆送到時可能已經切到別的模式：看不到的面板不出聲，免得打斷正在播放的發音
      if (isShown()) speak(turn.reply);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(toTutorError(e).message);
    } finally {
      // 只有最新的請求可以改狀態，避免舊請求把新請求的「思考中」關掉
      if (abort.current === ctrl) {
        abort.current = null;
        setBusy(false);
      }
    }
  };

  const start = (sc: Scenario) => {
    abort.current?.abort();
    abort.current = null;
    conversation.current += 1;
    setScenario(sc);
    setEntries([]);
    setCost(NO_COST);
    setError(null);
    setHeard(null);
    // 由學習者先開口的情境（接電話）：AI 不先說話，等學習者說第一句
    if (sc.learnerFirst) {
      setBusy(false);
      setHistory([]);
      return;
    }
    const msgs: Msg[] = [{ role: 'user', content: OPENING_MESSAGE }];
    setHistory(msgs);
    void send(msgs, sc);
  };

  const leave = () => {
    abort.current?.abort();
    abort.current = null;
    conversation.current += 1;
    setBusy(false);
    setScenario(null);
    setEntries([]);
    setHistory([]);
    setError(null);
    setCost(NO_COST);
  };

  // 網址指定的情境就直接開場。用計時器排程，開發模式的 StrictMode 掛載兩次時也只會送出一次。
  // 參數用過就清掉（接上同一個情境的舊對話時也是），之後重新掛載不會再開場。
  useEffect(() => {
    const sc = boot.start;
    if (!sc) {
      scenarioParam.current = null;
      return;
    }
    const t = window.setTimeout(() => {
      scenarioParam.current = null;
      start(sc);
    }, 0);
    return () => window.clearTimeout(t);
    // 只在第一次掛載時檢查
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  // 新訊息出現時，把輸入框捲到畫面下緣，最新的回覆和建議就在它上方（設定了減少動態效果就直接跳過去）
  useEffect(() => {
    if (!entries.length && !busy) return;
    composerRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'end' });
  }, [entries, busy, error]);

  const submit = () => {
    const text = input.trim();
    if (!text || busy || !scenario) return;
    // 上一句沒有得到回覆（出錯、被拒絕或中斷）：新的這句取代它，不要兩句一起送，被拒絕的那句也不會每次都再送一遍
    const last = history[history.length - 1];
    const replace = last?.role === 'user' && last.content !== OPENING_MESSAGE;
    // AI 還沒開口（開場出錯或按了停止）學生就先說：不送開場的指示，不然這句會被當成「學生還沒說話」，一律回「說得很好」
    const noOpening = history.length === 1 && last?.content === OPENING_MESSAGE;
    setInput('');
    setEntries((list) => [...(replace && list.length && list[list.length - 1].role === 'me' ? list.slice(0, -1) : list), { role: 'me', text }]);
    const msgs: Msg[] = [...(noOpening ? [] : replace ? history.slice(0, -1) : history), { role: 'user', content: text }];
    setHistory(msgs);
    void send(msgs, scenario);
    // 按「送出」時按鈕會換成「停止」：焦點放回輸入框，接著打下一句
    requestAnimationFrame(() => refocus(inputRef.current, { textEntry: true }));
  };

  const retry = () => {
    if (!scenario || busy) return;
    if (history[history.length - 1]?.role !== 'user') {
      setError(null);
      return;
    }
    void send(history, scenario);
  };

  /** 停止：還沒得到回覆的那句話放回輸入框，對話紀錄回到上一步 */
  const stop = () => {
    if (!stopGuard.ready()) return;
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
    const last = history[history.length - 1];
    if (last && last.role === 'user' && last.content !== OPENING_MESSAGE) {
      setHistory(history.slice(0, -1));
      setEntries((list) => (list.length && list[list.length - 1].role === 'me' ? list.slice(0, -1) : list));
      // 等待時已經打了下一句就保留，不要蓋掉
      setInput((cur) => (cur.trim() ? cur : last.content));
    }
    requestAnimationFrame(() => refocus(inputRef.current, { textEntry: true }));
  };

  if (!scenario) {
    const list = SCENARIOS.filter((s) => filter === 'all' || s.purpose === filter);
    return (
      <section aria-labelledby="h-pick">
        <div className="h2row">
          <h2 id="h-pick" className="h-sub" ref={pickHeading} tabIndex={-1}>
            選一個情境
          </h2>
          <Segmented
            size="sm"
            label="用途"
            value={filter}
            onChange={setFilter}
            options={[{ value: 'all' as const, label: '全部' }, ...(Object.keys(PURPOSE_LABEL) as Purpose[]).map((p) => ({ value: p, label: PURPOSE_LABEL[p] }))]}
          />
        </div>
        <div className="scenario-grid">
          {list.map((s) => (
            <button key={s.id} type="button" className="card scenario" onClick={() => start(s)}>
              <span className="pill">{PURPOSE_LABEL[s.purpose]}</span>
              <span className="sc-title">{s.title}</span>
              <span className="sc-setup">{s.setup}</span>
              <span className="sc-goal">
                <b>目標</b>
                {s.goal}
              </span>
            </button>
          ))}
        </div>
        <p className="small">
          程度：{LEVEL_LABEL[level]}。每次 AI 回覆會附上{level === 'kana' ? '羅馬拼音' : '假名讀音'}、中文翻譯，以及對你上一句的批改。
        </p>
      </section>
    );
  }

  const last = [...entries].reverse().find((e) => e.role === 'ai')?.turn;
  // 參考說法：AI 上一句附的；由學習者先開口的情境，還沒開始時用情境準備好的
  const starter = scenario.learnerFirst && !entries.length && !busy ? scenario.learnerFirst : null;
  const suggestions = last ? (last.done ? [] : last.suggestions) : (starter?.suggestions ?? []);

  return (
    <section className="chat" aria-label={`情境會話：${scenario.title}`}>
      <div className="chat-head card">
        <div>
          <p className="eyebrow">
            {PURPOSE_LABEL[scenario.purpose]} · {LEVEL_LABEL[level]}
          </p>
          <h2 ref={chatHeading} tabIndex={-1}>
            {scenario.title}
          </h2>
          <p className="muted">
            <b>目標</b>　{scenario.goal}
          </p>
        </div>
        <div className="chat-head-tools">
          <Switch id="sw-reading" checked={settings.showReading} onChange={(v) => updateSettings({ showReading: v })}>
            假名讀音
          </Switch>
          <Switch id="sw-trans" checked={settings.showTranslation} onChange={(v) => updateSettings({ showTranslation: v })}>
            中文翻譯
          </Switch>
          {level === 'kana' ? (
            <Switch id="sw-romaji" checked={settings.showRomaji} onChange={(v) => updateSettings({ showRomaji: v })}>
              羅馬拼音
            </Switch>
          ) : null}
          <div className="btn-row">
            <button type="button" className="btn btn-sm" onClick={() => start(scenario)}>
              <Icon name="refresh" size={16} /> 重新開始
            </button>
            <button type="button" className="btn btn-sm" onClick={leave}>
              換情境
            </button>
          </div>
        </div>
      </div>

      <div className="sr-only" aria-live="polite">
        {heard ? (
          <p key={heard.id}>
            {heard.ok ? '說得很好。' : null}
            {heard.corrected ? (
              <>
                更自然的說法：<span lang="ja">{heard.corrected}</span>
                {/[。．.!?！？]$/.test(heard.corrected) ? '' : '。'}
              </>
            ) : null}
            AI 說：<span lang="ja">{heard.ja}</span>
            {heard.zh ? `（${heard.zh}）` : ''}
            {heard.done ? '情境完成！' : ''}
          </p>
        ) : null}
      </div>
      {/* 等待中的狀態另外播報：回覆來了以後上面那一區才念回覆 */}
      <div className="sr-only" aria-live="polite">
        {busy ? <p>{WAIT_LABEL[phase]}</p> : null}
      </div>
      <div className="chat-list">
        {entries.map((e, i) =>
          e.role === 'ai' && e.turn ? (
            <div key={i} className="bubble-row ai">
              <div className="bubble ai-bubble">
                <div className="b-top">
                  <p className="b-ja" lang="ja">
                    {level === 'kana' && e.turn.reading && sameKana(e.turn.reading, e.turn.reply) ? e.turn.reading : e.turn.reply}
                  </p>
                  <SpeakIcon text={e.turn.reply} label="播放這句" />
                </div>
                {settings.showReading && e.turn.reading && !sameKana(e.turn.reading, e.turn.reply) ? (
                  <p className="b-reading" lang="ja">
                    {e.turn.reading}
                  </p>
                ) : null}
                {romajiOn ? <RomajiLine reading={e.turn.reading || e.turn.reply} /> : null}
                {settings.showTranslation ? <p className="b-zh">{e.turn.translation}</p> : null}
              </div>
            </div>
          ) : (
            <div key={i} className="bubble-row me">
              <div className="bubble me-bubble">
                <p lang={hasKana(e.text ?? '') ? 'ja' : undefined}>{e.text}</p>
              </div>
              {e.feedback ? (
                e.feedback.ok ? (
                  <p className="fb-ok">
                    <Icon name="check" size={15} /> 說得很好
                  </p>
                ) : (
                  <div className="fb-card">
                    <p className="fb-label">更自然的說法</p>
                    <div className="b-top">
                      <p className="b-ja" lang="ja">
                        {level === 'kana' && e.feedback.reading && sameKana(e.feedback.reading, e.feedback.corrected) ? e.feedback.reading : e.feedback.corrected}
                      </p>
                      {e.feedback.corrected ? <SpeakIcon text={e.feedback.corrected} label="播放更正後的句子" /> : null}
                    </div>
                    {settings.showReading && e.feedback.reading && !sameKana(e.feedback.reading, e.feedback.corrected) ? (
                      <p className="b-reading" lang="ja">
                        {e.feedback.reading}
                      </p>
                    ) : null}
                    {romajiOn && e.feedback.corrected ? <RomajiLine reading={e.feedback.reading || e.feedback.corrected} /> : null}
                    {e.feedback.explanation ? <p className="fb-why">{e.feedback.explanation}</p> : null}
                  </div>
                )
              ) : null}
            </div>
          ),
        )}
        {starter ? (
          <div className="chat-starter">
            <p>{starter.hint}</p>
          </div>
        ) : null}
        {busy ? (
          <div className="bubble-row ai">
            <div className="bubble ai-bubble typing">
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              {/* 連不上時會等比較久：寫出來，知道還在連線 */}
              {phase === 'connect' ? <span className="typing-label">正在連線…</span> : null}
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="chat-error" role="alert">
            <p>{error}</p>
            <button type="button" className="btn btn-sm" onClick={retry}>
              再試一次
            </button>
          </div>
        ) : null}
      </div>

      {last?.done && !busy ? (
        <div className="done-banner">
          <Hanamaru show className="hm-inline" />
          <div>
            <p className="done-title">情境完成！</p>
            <p className="small">換一個情境，或重新開始用不同的說法再練一次。</p>
          </div>
          <button type="button" className="btn" onClick={leave}>
            換情境
          </button>
        </div>
      ) : null}

      {suggestions.length && !busy ? (
        <div className="suggest">
          <p className="small">{starter ? '不知道怎麼說？點一個參考說法放進輸入框：' : '不知道怎麼回？點一個參考說法放進輸入框：'}</p>
          <div className="suggest-list">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                className="sugg"
                onClick={() => {
                  setInput(s.ja);
                  speak(s.ja);
                }}
              >
                <span lang="ja" className="sugg-ja">
                  {level === 'kana' && s.reading && sameKana(s.reading, s.ja) ? s.reading : s.ja}
                </span>
                {settings.showReading && s.reading && !sameKana(s.reading, s.ja) ? (
                  <span lang="ja" className="sugg-reading">
                    {s.reading}
                  </span>
                ) : null}
                {romajiOn ? <span className="sugg-romaji">{phraseRomaji(s.reading || s.ja)}</span> : null}
                <span className="sugg-zh">{s.zh}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <form
        ref={composerRef}
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          你的回答
        </label>
        <textarea
          id="chat-input"
          ref={inputRef}
          rows={2}
          value={input}
          placeholder="用日文回答；不會說可以先打中文或羅馬拼音"
          onChange={(e) => setInput(e.target.value)}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            // Safari 會先觸發 compositionend 再觸發 Enter 的 keydown，延後一點再解除
            window.setTimeout(() => {
              composing.current = false;
            }, 0);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey) return;
            if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            submit();
          }}
          lang="ja"
        />
        {/* 兩顆按鈕用不同的 key：避免 React 沿用同一個元素，按「停止」的那一下被當成「送出」。
            「停止」換上後的一小段時間不理會點擊（見 useStopGuard），連點兩下送出不會變成取消。 */}
        {busy ? (
          <button
            key="stop"
            type="button"
            className="btn"
            onClick={(e) => {
              e.preventDefault();
              stop();
            }}
          >
            <Icon name="stop" size={16} /> 停止
          </button>
        ) : (
          <button key="send" type="submit" className="btn btn-primary" disabled={!input.trim()}>
            <Icon name="send" size={17} /> 送出
          </button>
        )}
      </form>
      <p className="small cost-line">
        這段對話用了 {(cost.input + cost.output).toLocaleString()} 個 token，約 US${cost.usd.toFixed(4)}
      </p>
    </section>
  );
}

/* ================= 句子批改 ================= */

const VERDICT: Record<Correction['verdict'], { label: string; cls: string }> = {
  correct: { label: '正確', cls: 'v-correct' },
  minor: { label: '小錯誤', cls: 'v-minor' },
  wrong: { label: '需要修改', cls: 'v-wrong' },
};

/** 離開頁面時取消進行中的請求 */
function useAbortOnUnmount() {
  const ref = useRef<AbortController | null>(null);
  useEffect(() => () => ref.current?.abort(), []);
  return ref;
}

/** meaning：一起送出的「想表達的意思」（顯示在結果上，知道這次批改是照什麼意思改的） */
type CorrectionItem = { id: number; input: string; meaning?: string; result: Correction };

function loadCorrector(): { ja: string; meaning: string; results: CorrectionItem[] } {
  const raw = readSession().correct;
  const r: Record<string, unknown> = isObj(raw) ? raw : {};
  const results = (Array.isArray(r.results) ? r.results : []).flatMap((x: unknown, i: number): CorrectionItem[] => {
    if (!isObj(x) || typeof x.input !== 'string') return [];
    const result = sanitizeCorrection(x.result);
    const meaning = str(x.meaning);
    return result ? [{ id: num(x.id, i), input: x.input, ...(meaning ? { meaning } : {}), result }] : [];
  });
  return { ja: str(r.ja), meaning: str(r.meaning), results: results.slice(0, 10) };
}

function Corrector({ level, knownKana, grammar, isShown }: { level: TutorLevel; knownKana: string; grammar: string[]; isShown: () => boolean }) {
  const settings = useStore(settingsStore);
  const romajiOn = level === 'kana' && settings.showRomaji;
  const [saved] = useState(loadCorrector);
  const [ja, setJa] = useState(saved.ja);
  const [meaning, setMeaning] = useState(saved.meaning);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>('connect');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CorrectionItem[]>(saved.results);
  const abort = useAbortOnUnmount();
  /** 給螢幕閱讀器念的批改結果（畫面上的結果卡片不會自動念出來） */
  const [announce, setAnnounce] = useState({ id: 0, text: '' });
  const jaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    writeSession('correct', { ja, meaning, results });
  }, [ja, meaning, results]);

  const check = async () => {
    const text = ja.trim();
    const intended = meaning.trim();
    if (!text || busy) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy(true);
    setPhase('connect');
    setError(null);
    try {
      const res = await ask<unknown>({
        system: correctionSystem(level, knownKana, romajiOn, grammar),
        messages: [{ role: 'user', content: intended ? `${text}\n（我想表達：${intended}）` : text }],
        schema: CORRECTION_SCHEMA,
        maxTokens: 6000,
        effort: 'medium',
        signal: ctrl.signal,
        onConnect: () => {
          if (abort.current === ctrl) setPhase('reply');
        },
      });
      if (ctrl.signal.aborted) return;
      const result = sanitizeCorrection(res.data);
      if (!result) throw new TutorError('收到的回覆格式不對，請再試一次。', 'invalid');
      setResults((r) => [{ id: Date.now(), input: text, ...(intended ? { meaning: intended } : {}), result }, ...r].slice(0, 10));
      // 「想表達的意思」是這一句的：清掉，寫下一句時不會把舊的意思一起送出（這次用的意思顯示在結果上）
      if (intended) setMeaning((cur) => (cur.trim() === intended ? '' : cur));
      // 每次都換一個新的段落：再批改一次、結果一樣時也會念
      setAnnounce((a) => ({ id: a.id + 1, text: `批改完成：${VERDICT[result.verdict].label}。${result.corrected}` }));
      // 切到別的模式時不出聲
      if (result.corrected && isShown()) speak(result.corrected);
    } catch (e) {
      if (!ctrl.signal.aborted) setError(toTutorError(e).message);
    } finally {
      if (abort.current === ctrl) {
        abort.current = null;
        setBusy(false);
      }
      // 「批改」在等待時停用，焦點會掉：放回句子的輸入框，接著寫下一句
      requestAnimationFrame(() => refocus(jaRef.current, { textEntry: true }));
    }
  };

  const stop = () => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
  };

  return (
    <section className="corrector" aria-labelledby="h-correct">
      <h2 id="h-correct" className="h-sub">
        寫一句日文，讓 AI 幫你改
      </h2>
      <form
        className="card correct-form"
        onSubmit={(e) => {
          e.preventDefault();
          void check();
        }}
      >
        <label htmlFor="cj">日文句子</label>
        <textarea id="cj" ref={jaRef} rows={2} lang="ja" value={ja} onChange={(e) => setJa(e.target.value)} placeholder="例：わたしは たいわんじんです。" />
        <label htmlFor="cm">想表達的意思（選填）</label>
        <input id="cm" type="text" value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="例：我是台灣人。" />
        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={busy || !ja.trim()}>
            {busy ? (phase === 'connect' ? '連線中…' : '批改中…') : '批改'}
          </button>
          {busy ? (
            <button key="stop" type="button" className="btn" onClick={stop}>
              <Icon name="stop" size={16} /> 停止
            </button>
          ) : null}
        </div>
        {error ? (
          <p className="key-status tone-mark" role="alert">
            {error}
          </p>
        ) : null}
      </form>
      <div className="sr-only" aria-live="polite">
        {announce.text ? <p key={announce.id}>{announce.text}</p> : null}
      </div>

      {results.map((r) => {
        const v = VERDICT[r.result.verdict] ?? VERDICT.minor;
        return (
          <article key={r.id} className="card correction">
            <p className="c-input">
              <span className="c-label">你寫的</span>
              <span lang="ja">{r.input}</span>
              <span className={`verdict ${v.cls}`}>{v.label}</span>
            </p>
            {r.meaning ? <p className="c-meaning">想表達：{r.meaning}</p> : null}
            <div className="b-top">
              <p className="c-fixed" lang="ja">
                {level === 'kana' && r.result.reading && sameKana(r.result.reading, r.result.corrected) ? r.result.reading : r.result.corrected}
              </p>
              <SpeakIcon text={r.result.corrected} label="播放更正後的句子" />
            </div>
            {settings.showReading && r.result.reading && !sameKana(r.result.reading, r.result.corrected) ? (
              <p className="b-reading" lang="ja">
                {r.result.reading}
              </p>
            ) : null}
            {romajiOn ? <RomajiLine reading={r.result.reading || r.result.corrected} /> : null}
            <p className="b-zh">{r.result.translation}</p>
            {r.result.issues.length ? (
              <ul className="issues">
                {r.result.issues.map((is, j) => (
                  <li key={j}>
                    <span className="is-fix" lang="ja">
                      <s>{is.part}</s> → <b>{is.fix}</b>
                    </span>
                    <span className="is-why">{is.why}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {r.result.alternatives.length ? (
              <div className="alts">
                <p className="c-label">其他說法</p>
                <ul>
                  {r.result.alternatives.map((a, j) => (
                    <li key={j}>
                      <span className="pill">{a.style}</span>
                      <button type="button" className="say-inline" lang="ja" onClick={() => speak(a.ja)}>
                        {a.ja}
                      </button>
                      {settings.showReading && a.reading && !sameKana(a.reading, a.ja) ? (
                        <span className="small" lang="ja">
                          {a.reading}
                        </span>
                      ) : null}
                      {romajiOn ? <span className="small">{phraseRomaji(a.reading || a.ja)}</span> : null}
                      <span className="small">{a.zh}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {r.result.tip ? <p className="tip">{r.result.tip}</p> : null}
          </article>
        );
      })}
    </section>
  );
}

/* ================= AI 出題 ================= */

type QuizFocus = 'mixed' | 'kana' | 'vocab';

function loadQuiz(): { focus: QuizFocus; questions: QuizQuestion[]; idx: number; picked: number | null; score: number } {
  const raw = readSession().quiz;
  const r: Record<string, unknown> = isObj(raw) ? raw : {};
  const questions = sanitizeQuiz({ questions: r.questions });
  // idx 等於題數代表已經做完、正在看結果
  const idx = Math.min(questions.length, Math.max(0, Math.round(num(r.idx))));
  const q = questions[idx];
  const p = num(r.picked, -1);
  const picked = q && Number.isInteger(p) && p >= 0 && p < q.choices.length ? p : null;
  const score = Math.min(questions.length, Math.max(0, Math.round(num(r.score))));
  return { focus: oneOf(r.focus, ['mixed', 'kana', 'vocab'] as const, 'mixed'), questions, idx, picked, score };
}

function AiQuiz({ level }: { level: TutorLevel }) {
  const [phase, setPhase] = useState<Phase>('connect');
  const lessons = useStore(lessonStore);
  const kana = useStore(kanaStore);
  const srs = useStore(srsStore);
  const [saved] = useState(loadQuiz);
  const [focus, setFocus] = useState<QuizFocus>(saved.focus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>(saved.questions);
  const [idx, setIdx] = useState(saved.idx);
  const [picked, setPicked] = useState<number | null>(saved.picked);
  const [score, setScore] = useState(saved.score);
  const abort = useAbortOnUnmount();

  useEffect(() => {
    writeSession('quiz', { focus, questions, idx, picked, score });
  }, [focus, questions, idx, picked, score]);

  const learned = learnedKana(lessons) || KANA_LESSONS[0].newKana.join('');
  const weakKana = useMemo(
    () =>
      Object.entries(kana)
        .filter(([, e]) => e.w > 0 && e.s < 3)
        .sort((a, b) => b[1].w - a[1].w)
        .slice(0, 8)
        .map(([k]) => k.slice(2)),
    [kana],
  );

  const words = useMemo(() => {
    const all = DECKS.flatMap((d) => d.items);
    const seen = all
      .filter((it) => srs.cards[it.id]?.reps)
      .sort((a, b) => (srs.cards[b.id]?.lapses ?? 0) - (srs.cards[a.id]?.lapses ?? 0) || (srs.cards[a.id]?.due ?? 0) - (srs.cards[b.id]?.due ?? 0))
      .slice(0, 25);
    if (seen.length >= 8) return seen;
    // 還沒背單字：從 N5 挑只用學過假名寫得出來的詞
    const allowed = new Set(Array.from(learned + 'ー'));
    const pool = DECKS[0].items.filter((it) => Array.from(it.kana).every((c) => allowed.has(c)));
    return [...seen, ...pool.slice(0, 25 - seen.length)];
  }, [srs, learned]);

  const generate = async () => {
    if (busy) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy(true);
    setPhase('connect');
    setError(null);
    try {
      const res = await ask<unknown>({
        system: quizSystem(level),
        messages: [
          {
            role: 'user',
            content: quizUserMessage({
              level,
              focus,
              learnedKana: learned,
              weakKana,
              // 只學過假名：單字也只給假名（給漢字又要它不用漢字，指示互相矛盾）
              words: words.map((w) => ({ ja: level === 'kana' ? w.kana : (w.kanji ?? w.kana), kana: w.kana, zh: w.zh })),
            }),
          },
        ],
        schema: QUIZ_SCHEMA,
        maxTokens: 8000,
        effort: 'medium',
        signal: ctrl.signal,
        onConnect: () => {
          if (abort.current === ctrl) setPhase('reply');
        },
      });
      if (ctrl.signal.aborted) return;
      const qs = sanitizeQuiz(res.data);
      if (!qs.length) throw new TutorError('這次出的題目格式不對，請再按一次。', 'invalid');
      setQuestions(qs);
      setIdx(0);
      setPicked(null);
      setScore(0);
    } catch (e) {
      if (!ctrl.signal.aborted) setError(toTutorError(e).message);
    } finally {
      if (abort.current === ctrl) {
        abort.current = null;
        setBusy(false);
      }
    }
  };

  const stop = () => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
  };

  const q = questions[idx];
  const finished = questions.length > 0 && idx >= questions.length;

  // 作答後選項停用、按了「下一題」按鈕就不見：焦點分別放到「下一題」、新題目、成績
  const nextBtn = useRef<HTMLButtonElement>(null);
  const promptRef = useRef<HTMLParagraphElement>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const quizStep = useRef(`${questions.length}:${idx}:${picked}`);
  useEffect(() => {
    const step = `${questions.length}:${idx}:${picked}`;
    if (quizStep.current === step) return;
    quizStep.current = step;
    refocus(picked !== null ? nextBtn.current : finished ? resultRef.current : promptRef.current);
  }, [questions.length, idx, picked, finished]);

  return (
    <section className="aiquiz" aria-labelledby="h-aiquiz">
      <div className="h2row">
        <h2 id="h-aiquiz" className="h-sub">
          依你的弱點出 5 題
        </h2>
        <Segmented
          size="sm"
          label="出題重點"
          value={focus}
          onChange={setFocus}
          options={[
            { value: 'mixed', label: '混合' },
            { value: 'kana', label: '假名' },
            { value: 'vocab', label: '單字' },
          ]}
        />
      </div>
      <p className="small">
        會參考你學過的假名（{learned.length} 個）、常錯的字{weakKana.length ? `（${weakKana.join('、')}）` : ''}和學過的單字。
      </p>

      {!questions.length || finished ? (
        <div className="card quiz-start">
          {finished ? (
            <p className="q-result" ref={resultRef} tabIndex={-1}>
              答對 <b>{score}</b>／{questions.length} 題
            </p>
          ) : null}
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => void generate()} disabled={busy}>
              {busy ? (phase === 'connect' ? '連線中…' : '出題中…') : finished ? '再出 5 題' : '開始出題'}
            </button>
            {busy ? (
              <button key="stop" type="button" className="btn" onClick={stop}>
                <Icon name="stop" size={16} /> 停止
              </button>
            ) : null}
          </div>
          {error ? (
            <p className="key-status tone-mark" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="card quiz">
          <div className="q-top">
            <span>
              第 {idx + 1}／{questions.length} 題
            </span>
            <span>
              答對 <b>{score}</b>
            </span>
          </div>
          <p className="aq-prompt" ref={promptRef} tabIndex={-1}>
            {q.prompt}
          </p>
          {q.ja ? (
            <div className="aq-ja">
              <span lang="ja">{q.ja}</span>
              <SpeakIcon text={q.ja} />
            </div>
          ) : null}
          <div className="q-opts">
            {q.choices.map((c, i) => {
              const cls = picked === null ? '' : i === q.answer ? (picked === i ? 'is-right' : 'is-answer') : picked === i ? 'is-wrong' : '';
              return (
                <button
                  key={i}
                  type="button"
                  className={`opt aq-opt ${cls}`}
                  disabled={picked !== null}
                  onClick={() => {
                    setPicked(i);
                    if (i === q.answer) setScore((s) => s + 1);
                  }}
                >
                  <span className="n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span lang={choiceLang(q, c)}>{c}</span>
                </button>
              );
            })}
          </div>
          {/* 一直留著的播報區：作答後才放進文字，螢幕閱讀器才會念出來 */}
          <div aria-live="polite">
            {picked !== null ? (
              <p className="q-fb">
                {picked === q.answer ? <span className="ok">正解！</span> : <span className="ng">正確答案是 <span lang={choiceLang(q, q.choices[q.answer])}>{q.choices[q.answer]}</span>。</span>} {q.explanation}
              </p>
            ) : null}
          </div>
          {picked !== null ? (
            <>
              <button
                type="button"
                className="btn btn-primary"
                ref={nextBtn}
                onClick={() => {
                  setIdx((n) => n + 1);
                  setPicked(null);
                }}
              >
                {idx + 1 < questions.length ? '下一題' : '看結果'} <Icon name="arrow-right" size={17} />
              </button>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
