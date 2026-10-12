import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CONVERSATION_SCHEMA, CORRECTION_SCHEMA, LEVEL_LABEL, OPENING_MESSAGE, PURPOSE_LABEL, QUIZ_SCHEMA, SCENARIOS,
  conversationSystem, correctionSystem, quizSystem, quizUserMessage, sanitizeQuiz,
  type ConversationTurn, type Correction, type Purpose, type QuizQuestion, type Scenario,
} from '../data/tutor';
import { DECKS } from '../data/vocab';
import { LESSONS } from '../data/lessons';
import {
  addUsage, apiKeyStore, kanaStore, lessonStore, settingsStore, srsStore, updateSettings, type TutorLevel,
} from '../state';
import { useStore } from '../state/store';
import { TutorError, callJSON, estimateCost, toTutorError } from '../lib/claude';
import { learnedKana, suggestedLevel } from '../lib/progress';
import { speak } from '../lib/speech';
import { ApiKeySetup } from '../components/ApiKeySetup';
import { Segmented, Switch } from '../components/Controls';
import { SpeakIcon } from '../components/Speak';
import { Hanamaru } from '../components/Hanamaru';
import { Icon } from '../components/Icon';

type Mode = 'chat' | 'correct' | 'quiz';
type Msg = { role: 'user' | 'assistant'; content: string };

function useLevel(): [TutorLevel, TutorLevel | 'auto'] {
  const settings = useStore(settingsStore);
  const lessons = useStore(lessonStore);
  const level = settings.tutorLevel === 'auto' ? suggestedLevel(lessons) : settings.tutorLevel;
  return [level, settings.tutorLevel];
}

/** 呼叫一次 Claude，並把用量記下來（即使回覆格式不對也已經計費） */
function ask<T>(opts: { system: string; messages: Msg[]; schema: Record<string, unknown>; maxTokens: number; effort: 'low' | 'medium'; signal?: AbortSignal }) {
  const model = settingsStore.get().model;
  return callJSON<T>({
    apiKey: apiKeyStore.get(),
    model,
    ...opts,
    onUsage: (i, o) => addUsage(model, i, o),
  });
}

export default function Tutor() {
  const apiKey = useStore(apiKeyStore);
  const [params, setParams] = useSearchParams();
  // 網址參數只在進來時讀一次，讀完就清掉，避免切換或返回時重新開場（會再收一次費）
  const [initial] = useState(() => ({
    scenario: params.get('scenario'),
    mode: (params.get('mode') === 'correct' ? 'correct' : params.get('mode') === 'quiz' ? 'quiz' : 'chat') as Mode,
  }));
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [level, levelPref] = useLevel();
  const lessons = useStore(lessonStore);

  useEffect(() => {
    if (params.get('scenario') || params.get('mode')) setParams({}, { replace: true });
  }, [params, setParams]);

  return (
    <div className="wrap">
      <header className="ph">
        <p className="eyebrow">Claude · AI 日文家教</p>
        <h1>AI 日文家教</h1>
        <p className="lede">情境會話練開口、句子批改練寫作、AI 出題練弱點。程度會配合你的進度，卡住時可以先用中文說。</p>
      </header>

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
              onChange={setMode}
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
                <option value="auto">自動（目前：{LEVEL_LABEL[suggestedLevel(lessons)]}）</option>
                {(Object.keys(LEVEL_LABEL) as TutorLevel[]).map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </option>
                ))}
              </select>
            </label>
            <UsageLine />
          </div>
          {/* 三個模式都保持掛載，切換時不會丟掉對話或重新呼叫 API */}
          <div hidden={mode !== 'chat'}>
            <Conversation level={level} initialScenario={initial.scenario} />
          </div>
          <div hidden={mode !== 'correct'}>
            <Corrector level={level} />
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

function Conversation({ level, initialScenario }: { level: TutorLevel; initialScenario: string | null }) {
  const settings = useStore(settingsStore);
  const [scenario, setScenario] = useState<Scenario | null>(() => SCENARIOS.find((s) => s.id === initialScenario) ?? null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  /** 已送出的對話紀錄；最後一則若是 user，代表還在等（或等失敗了，可以重試） */
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cost, setCost] = useState({ input: 0, output: 0 });
  const [filter, setFilter] = useState<Purpose | 'all'>('all');
  const abort = useRef<AbortController | null>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const composing = useRef(false);

  const send = async (msgs: Msg[], sc: Scenario) => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy(true);
    setError(null);
    try {
      const res = await ask<ConversationTurn>({
        system: conversationSystem(sc, level),
        messages: msgs,
        schema: CONVERSATION_SCHEMA,
        maxTokens: 4000,
        effort: 'low',
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      setCost((c) => ({ input: c.input + res.usage.input, output: c.output + res.usage.output }));
      const turn = res.data;
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
      speak(turn.reply);
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
    setScenario(sc);
    setEntries([]);
    setCost({ input: 0, output: 0 });
    setError(null);
    const msgs: Msg[] = [{ role: 'user', content: OPENING_MESSAGE }];
    setHistory(msgs);
    void send(msgs, sc);
  };

  const leave = () => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
    setScenario(null);
    setEntries([]);
    setHistory([]);
    setError(null);
  };

  // 從首頁帶情境進來就直接開始。用計時器排程，開發模式的 StrictMode 掛載兩次時也只會送出一次。
  useEffect(() => {
    if (!scenario || entries.length || history.length) return;
    const t = window.setTimeout(() => start(scenario), 0);
    return () => window.clearTimeout(t);
    // 只在第一次掛載時檢查
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  // 新訊息出現時，把輸入框捲到畫面下緣，最新的回覆和建議就在它上方
  useEffect(() => {
    if (!entries.length && !busy) return;
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [entries, busy, error]);

  const submit = () => {
    const text = input.trim();
    if (!text || busy || !scenario) return;
    setInput('');
    setEntries((list) => [...list, { role: 'me', text }]);
    const msgs: Msg[] = [...history, { role: 'user', content: text }];
    setHistory(msgs);
    void send(msgs, scenario);
  };

  const retry = () => {
    if (!scenario || busy || !history.length) return;
    void send(history, scenario);
  };

  /** 停止：還沒得到回覆的那句話放回輸入框，對話紀錄回到上一步 */
  const stop = () => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
    const last = history[history.length - 1];
    if (last && last.role === 'user' && last.content !== OPENING_MESSAGE) {
      setHistory(history.slice(0, -1));
      setEntries((list) => (list.length && list[list.length - 1].role === 'me' ? list.slice(0, -1) : list));
      setInput(last.content);
    }
  };

  if (!scenario) {
    const list = SCENARIOS.filter((s) => filter === 'all' || s.purpose === filter);
    return (
      <section aria-labelledby="h-pick">
        <div className="h2row">
          <h2 id="h-pick" className="h-sub">
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
        <p className="small">程度：{LEVEL_LABEL[level]}。每次 AI 回覆會附上假名讀音、中文翻譯，以及對你上一句的批改。</p>
      </section>
    );
  }

  const last = [...entries].reverse().find((e) => e.role === 'ai')?.turn;

  return (
    <section className="chat" aria-label={`情境會話：${scenario.title}`}>
      <div className="chat-head card">
        <div>
          <p className="eyebrow">
            {PURPOSE_LABEL[scenario.purpose]} · {LEVEL_LABEL[level]}
          </p>
          <h2>{scenario.title}</h2>
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

      <div className="chat-list" aria-live="polite">
        {entries.map((e, i) =>
          e.role === 'ai' && e.turn ? (
            <div key={i} className="bubble-row ai">
              <div className="bubble ai-bubble">
                <div className="b-top">
                  <p className="b-ja" lang="ja">
                    {e.turn.reply}
                  </p>
                  <SpeakIcon text={e.turn.reply} label="播放這句" />
                </div>
                {settings.showReading && e.turn.reading && e.turn.reading.replace(/\s/g, '') !== e.turn.reply.replace(/\s/g, '') ? (
                  <p className="b-reading" lang="ja">
                    {e.turn.reading}
                  </p>
                ) : null}
                {settings.showTranslation ? <p className="b-zh">{e.turn.translation}</p> : null}
              </div>
            </div>
          ) : (
            <div key={i} className="bubble-row me">
              <div className="bubble me-bubble">
                <p lang="ja">{e.text}</p>
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
                        {e.feedback.corrected}
                      </p>
                      {e.feedback.corrected ? <SpeakIcon text={e.feedback.corrected} label="播放更正後的句子" /> : null}
                    </div>
                    {e.feedback.explanation ? <p className="fb-why">{e.feedback.explanation}</p> : null}
                  </div>
                )
              ) : null}
            </div>
          ),
        )}
        {busy ? (
          <div className="bubble-row ai">
            <div className="bubble ai-bubble typing">
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="sr-only">AI 正在回覆</span>
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

      {last && last.suggestions.length && !last.done && !busy ? (
        <div className="suggest">
          <p className="small">不知道怎麼回？點一個參考說法放進輸入框：</p>
          <div className="suggest-list">
            {last.suggestions.map((s, i) => (
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
                  {s.ja}
                </span>
                {settings.showReading && s.reading.replace(/\s/g, '') !== s.ja.replace(/\s/g, '') ? (
                  <span lang="ja" className="sugg-reading">
                    {s.reading}
                  </span>
                ) : null}
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
        {/* 兩顆按鈕用不同的 key：避免 React 沿用同一個元素，按「停止」的那一下被當成「送出」 */}
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
        這段對話用了 {(cost.input + cost.output).toLocaleString()} 個 token，約 US${estimateCost(settings.model, cost.input, cost.output).toFixed(4)}
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

function Corrector({ level }: { level: TutorLevel }) {
  const settings = useStore(settingsStore);
  const [ja, setJa] = useState('');
  const [meaning, setMeaning] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ id: number; input: string; result: Correction }[]>([]);
  const abort = useAbortOnUnmount();

  const check = async () => {
    const text = ja.trim();
    if (!text || busy) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy(true);
    setError(null);
    try {
      const res = await ask<Correction>({
        system: correctionSystem(level),
        messages: [{ role: 'user', content: meaning.trim() ? `${text}\n（我想表達：${meaning.trim()}）` : text }],
        schema: CORRECTION_SCHEMA,
        maxTokens: 6000,
        effort: 'medium',
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      setResults((r) => [{ id: Date.now(), input: text, result: res.data }, ...r].slice(0, 10));
      if (res.data.corrected) speak(res.data.corrected);
    } catch (e) {
      if (!ctrl.signal.aborted) setError(toTutorError(e).message);
    } finally {
      if (abort.current === ctrl) {
        abort.current = null;
        setBusy(false);
      }
    }
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
        <textarea id="cj" rows={2} lang="ja" value={ja} onChange={(e) => setJa(e.target.value)} placeholder="例：わたしは たいわんじんです。" />
        <label htmlFor="cm">想表達的意思（選填）</label>
        <input id="cm" type="text" value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="例：我是台灣人。" />
        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={busy || !ja.trim()}>
            {busy ? '批改中…' : '批改'}
          </button>
        </div>
        {error ? (
          <p className="key-status tone-mark" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      {results.map((r) => {
        const v = VERDICT[r.result.verdict] ?? VERDICT.minor;
        return (
          <article key={r.id} className="card correction">
            <p className="c-input">
              <span className="c-label">你寫的</span>
              <span lang="ja">{r.input}</span>
              <span className={`verdict ${v.cls}`}>{v.label}</span>
            </p>
            <div className="b-top">
              <p className="c-fixed" lang="ja">
                {r.result.corrected}
              </p>
              <SpeakIcon text={r.result.corrected} label="播放更正後的句子" />
            </div>
            {settings.showReading ? (
              <p className="b-reading" lang="ja">
                {r.result.reading}
              </p>
            ) : null}
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

function AiQuiz({ level }: { level: TutorLevel }) {
  const lessons = useStore(lessonStore);
  const kana = useStore(kanaStore);
  const srs = useStore(srsStore);
  const [focus, setFocus] = useState<'mixed' | 'kana' | 'vocab'>('mixed');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const abort = useAbortOnUnmount();

  const learned = learnedKana(lessons) || LESSONS[0].newKana.join('');
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
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy(true);
    setError(null);
    try {
      const res = await ask<unknown>({
        system: quizSystem(),
        messages: [
          {
            role: 'user',
            content: quizUserMessage({
              level,
              focus,
              learnedKana: learned,
              weakKana,
              words: words.map((w) => ({ ja: w.kanji ?? w.kana, kana: w.kana, zh: w.zh })),
            }),
          },
        ],
        schema: QUIZ_SCHEMA,
        maxTokens: 8000,
        effort: 'medium',
        signal: ctrl.signal,
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

  const q = questions[idx];
  const finished = questions.length > 0 && idx >= questions.length;

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
            <p className="q-result">
              答對 <b>{score}</b>／{questions.length} 題
            </p>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={() => void generate()} disabled={busy}>
            {busy ? '出題中…' : finished ? '再出 5 題' : '開始出題'}
          </button>
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
          <p className="aq-prompt">{q.prompt}</p>
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
                  <span lang={/[぀-ヿ一-鿿]/.test(c) ? 'ja' : undefined}>{c}</span>
                </button>
              );
            })}
          </div>
          {picked !== null ? (
            <>
              <p className="q-fb" aria-live="polite">
                {picked === q.answer ? <span className="ok">正解！</span> : <span className="ng">正確答案是 {q.choices[q.answer]}。</span>} {q.explanation}
              </p>
              <button
                type="button"
                className="btn btn-primary"
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
