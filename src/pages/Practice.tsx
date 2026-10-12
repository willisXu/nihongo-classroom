import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LESSONS, lessonById } from '../data/lessons';
import { SEION_ROWS } from '../data/kana';
import { kanaLevel, kanaStore, lessonStore, recordKana, type KanaStats } from '../state';
import { readJSON, useStore, writeJSON } from '../state/store';
import {
  ALL_ROW_IDS, ROW_CHOICES, SEI_ROW_IDS, buildPool, hintFor, makeOptions, normalizeRows, pickItem,
  type QuizItem, type QuizMode, type QuizOption, type QuizScript,
} from '../lib/kanaQuiz';
import { countMastered, HIRA_KEYS, KATA_KEYS, nextLesson } from '../lib/progress';
import { speak } from '../lib/speech';
import { Masu, Segmented } from '../components/Controls';
import { Hanamaru } from '../components/Hanamaru';
import { Icon } from '../components/Icon';
import { PracticeTabs } from '../components/PracticeTabs';
import { usePageTitle } from '../lib/title';

interface QuizPrefs {
  script: QuizScript;
  mode: QuizMode;
  rows: string[];
}

function loadPrefs(): QuizPrefs {
  const raw = readJSON('nk.quiz') as Partial<QuizPrefs> | undefined;
  const rows = Array.isArray(raw?.rows) ? normalizeRows(raw!.rows.filter((r): r is string => typeof r === 'string')) : [];
  return {
    script: raw?.script === 'k' || raw?.script === 'mix' ? raw.script : 'h',
    mode: raw?.mode === 'listen' ? 'listen' : 'see',
    rows: rows.length ? rows : ['a', 'k', 's'],
  };
}

interface Q {
  item: QuizItem | null;
  options: QuizOption[];
  picked: number | null;
  hint: boolean;
}

export default function Practice() {
  usePageTitle('假名測驗');
  const [params, setParams] = useSearchParams();
  const stats = useStore(kanaStore);
  const lessons = useStore(lessonStore);
  const [prefs, setPrefs] = useState<QuizPrefs>(() => {
    const p = loadPrefs();
    const l = lessonById(Number(params.get('lesson')));
    return l ? { ...p, script: l.quiz.script, rows: normalizeRows(l.quiz.rows) } : p;
  });
  const pool = useMemo(() => buildPool(prefs.rows, prefs.script, prefs.mode), [prefs]);
  const [q, setQ] = useState<Q>({ item: null, options: [], picked: null, hint: false });
  const [round, setRound] = useState({ n: 0, right: 0, streak: 0 });
  const lastKey = useRef<string | null>(null);
  const armed = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    writeJSON('nk.quiz', prefs);
  }, [prefs]);

  // 從課程頁帶參數進來後，把網址清乾淨
  useEffect(() => {
    if (params.get('lesson')) setParams({}, { replace: true });
  }, [params, setParams]);

  const next = useCallback(
    (fromUser: boolean) => {
      window.clearTimeout(timer.current);
      if (pool.length < 2) {
        setQ({ item: null, options: [], picked: null, hint: false });
        return;
      }
      const item = pickItem(pool, kanaStore.get(), lastKey.current);
      lastKey.current = item.key;
      setQ({ item, options: makeOptions(item, pool, prefs.mode), picked: null, hint: false });
      if (prefs.mode === 'listen' && (fromUser || armed.current)) speak(item.ch);
    },
    [pool, prefs.mode],
  );

  // 範圍或題型改變時重新開始
  useEffect(() => {
    setRound({ n: 0, right: 0, streak: 0 });
    lastKey.current = null;
    next(false);
    return () => window.clearTimeout(timer.current);
  }, [next]);

  const answer = useCallback(
    (i: number) => {
      if (!q.item || q.picked !== null) return;
      armed.current = true;
      const opt = q.options[i];
      const ok = !!opt?.ok;
      recordKana(q.item.key, ok);
      setRound((r) => ({ n: r.n + 1, right: r.right + (ok ? 1 : 0), streak: ok ? r.streak + 1 : 0 }));
      setQ((s) => ({ ...s, picked: i }));
      if (ok) {
        if (prefs.mode === 'see') speak(q.item.ch);
        timer.current = window.setTimeout(() => next(false), prefs.mode === 'see' ? 1100 : 900);
      } else {
        speak(q.item.ch);
        window.setTimeout(() => nextBtn.current?.focus({ preventScroll: true }), 0);
      }
    },
    [q, prefs.mode, next],
  );

  // 鍵盤：1–4 作答、Enter 下一題、R 重聽
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (/^[1-4]$/.test(e.key)) {
        e.preventDefault();
        answer(Number(e.key) - 1);
      } else if (e.key === 'Enter' && q.picked !== null && !t?.closest('a, button, select')) {
        e.preventDefault();
        next(true);
      } else if ((e.key === 'r' || e.key === 'R') && prefs.mode === 'listen' && q.item) {
        e.preventDefault();
        armed.current = true;
        speak(q.item.ch);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answer, next, q, prefs.mode]);

  /** 範圍真的改變時才更新（重選同樣的範圍不會清掉這一輪的分數） */
  const applyScope = (script: QuizScript, rows: string[]) =>
    setPrefs((p) => {
      const next = rows.length ? rows : p.rows;
      if (p.script === script && next.length === p.rows.length && next.every((r, i) => r === p.rows[i])) return p;
      return { ...p, script, rows: next };
    });
  const setRows = (rows: string[]) => applyScope(prefs.script, rows);
  const toggleRow = (id: string) => {
    const has = prefs.rows.includes(id);
    if (has && prefs.rows.length === 1) return;
    setRows(has ? prefs.rows.filter((r) => r !== id) : ALL_ROW_IDS.filter((r) => r === id || prefs.rows.includes(r)));
  };

  const item = q.item;
  const answered = q.picked !== null;
  const correct = answered && item ? !!q.options[q.picked!]?.ok : false;
  const upcoming = nextLesson(lessons);
  const lessonChoices = LESSONS.filter((l) => l.id <= (upcoming?.id ?? LESSONS.length));

  return (
    <div className="wrap">
      <PracticeTabs />
      <header className="ph ph-tight">
        <h1>假名測驗</h1>
        <p className="lede">連續答對 3 次算「熟悉」。答錯的字會更常出現，直到你記住為止。</p>
      </header>

      <div className="practice-layout">
        <div className="quiz-col">
          <div className="settings">
            <div className="set-row">
              <span className="set-l">文字</span>
              <Segmented
                label="出題文字"
                value={prefs.script}
                onChange={(v) => setPrefs((p) => ({ ...p, script: v }))}
                options={[
                  { value: 'h', label: '平假名' },
                  { value: 'k', label: '片假名' },
                  { value: 'mix', label: '混合' },
                ]}
              />
            </div>
            <div className="set-row">
              <span className="set-l">題型</span>
              <Segmented
                label="題型"
                value={prefs.mode}
                onChange={(v) => {
                  armed.current = true;
                  setPrefs((p) => ({ ...p, mode: v }));
                }}
                options={[
                  { value: 'see', label: '看字選拼音' },
                  { value: 'listen', label: '聽音選假名' },
                ]}
              />
            </div>
            <div className="set-row">
              <span className="set-l">範圍</span>
              <div className="rchips" role="group" aria-label="出題範圍">
                {ROW_CHOICES.map((r, i) => (
                  <span key={r.id} className="rchip-wrap">
                    {i > 0 && r.group !== ROW_CHOICES[i - 1].group ? <span className="rsep" aria-hidden="true" /> : null}
                    <button type="button" className="rchip" aria-pressed={prefs.rows.includes(r.id)} lang="ja" onClick={() => toggleRow(r.id)}>
                      {prefs.script === 'k' ? r.k : r.h}
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <div className="quick">
              {lessonChoices.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="linkbtn"
                  onClick={() => applyScope(l.quiz.script, normalizeRows(l.quiz.rows))}
                >
                  第 {l.id} 課
                </button>
              ))}
              <button type="button" className="linkbtn" onClick={() => setRows(SEI_ROW_IDS)}>
                清音全部
              </button>
              <button type="button" className="linkbtn" onClick={() => setRows(ALL_ROW_IDS)}>
                清音＋濁音
              </button>
            </div>
          </div>

          <div className="card quiz">
            <div className="q-top">
              <span>第 {answered ? round.n : round.n + 1} 題</span>
              <span>
                答對 <b>{round.right}</b>／{round.n}
              </span>
              <span>
                連對 <b>{round.streak}</b>
              </span>
            </div>
            {!item ? (
              <p className="q-fb">範圍太小了，請在上面多選幾行。</p>
            ) : (
              <>
                <div className="q-prompt">
                  <div className="q-stage">
                    {prefs.mode === 'see' ? (
                      <Masu ch={item.ch} />
                    ) : (
                      <button
                        type="button"
                        className="q-listen"
                        aria-label="再聽一次"
                        onClick={() => {
                          armed.current = true;
                          speak(item.ch);
                        }}
                      >
                        <Icon name="speaker" size={64} />
                      </button>
                    )}
                    <Hanamaru show={answered && correct} />
                  </div>
                  {prefs.mode === 'listen' ? (
                    <p className="q-sub">{armed.current ? '聽發音，選出正確的假名（R 鍵重聽）' : '按喇叭聽發音，再選出正確的假名'}</p>
                  ) : q.hint ? (
                    <p className="q-hint">{hintFor(item)}</p>
                  ) : !answered ? (
                    <button type="button" className="linkbtn" onClick={() => setQ((s) => ({ ...s, hint: true }))}>
                      看提示
                    </button>
                  ) : null}
                </div>
                <div className="q-opts">
                  {q.options.map((o, i) => {
                    const isPicked = q.picked === i;
                    const cls = answered ? (isPicked ? (o.ok ? 'is-right' : 'is-wrong') : o.ok ? 'is-answer' : '') : '';
                    const listen = prefs.mode === 'listen';
                    return (
                      <button
                        key={`${item.key}-${o.ch}`}
                        type="button"
                        className={`opt ${listen ? 'ja' : ''} ${cls}`}
                        lang={listen ? 'ja' : undefined}
                        disabled={answered}
                        onClick={() => answer(i)}
                      >
                        <span className="n" aria-hidden="true">
                          {i + 1}
                        </span>
                        {listen ? o.ch : o.r}
                        <span className="mk" aria-hidden="true">
                          {answered && (isPicked || o.ok) ? (o.ok ? '◯' : '×') : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="q-fb" aria-live="polite">
                  {answered ? (
                    correct ? (
                      <>
                        <span className="ok">正解！</span>
                        <span lang="ja">{item.ch}</span> 念 {item.r}
                      </>
                    ) : (
                      <>
                        正確答案是{' '}
                        <span lang="ja" className="fb-big">
                          {item.ch}
                        </span>
                        （{item.r}）。{hintFor(item)}
                      </>
                    )
                  ) : null}
                </p>
                {answered && !correct ? (
                  <button ref={nextBtn} type="button" className="btn btn-primary" onClick={() => next(true)}>
                    下一題 <Icon name="arrow-right" size={17} />
                  </button>
                ) : null}
              </>
            )}
          </div>
          <p className="kbd-hint">用鍵盤：1–4 選答案，Enter 下一題，R 重聽</p>
        </div>

        <aside className="report">
          <h2>熟悉度</h2>
          <div className="legend">
            <span>
              <i className="lv0" />
              還沒練
            </span>
            <span>
              <i className="lv1" />
              練習中
            </span>
            <span>
              <i className="lv2" />
              熟悉（連對 3 次）
            </span>
          </div>
          <div className="mg-wrap">
            <MasteryGrid stats={stats} script="h" />
            <MasteryGrid stats={stats} script="k" />
          </div>
          <WeakList stats={stats} />
          <p className="small">
            練習紀錄存在這個瀏覽器。想換裝置，可到<Link to="/settings">設定</Link>匯出備份。
          </p>
          <div className="reset-row">
            {confirmReset ? (
              <>
                <span>確定要清除假名測驗紀錄？</span>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => {
                    kanaStore.reset();
                    setConfirmReset(false);
                  }}
                >
                  清除
                </button>
                <button type="button" className="linkbtn" onClick={() => setConfirmReset(false)}>
                  取消
                </button>
              </>
            ) : (
              <button type="button" className="linkbtn" onClick={() => setConfirmReset(true)}>
                清除假名測驗紀錄
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function MasteryGrid({ stats, script }: { stats: KanaStats; script: 'h' | 'k' }) {
  const keys = script === 'h' ? HIRA_KEYS : KATA_KEYS;
  const n = countMastered(stats, keys);
  return (
    <div>
      <p className="mg-title">
        {script === 'h' ? '平假名' : '片假名'} <b>{n}/46</b>
      </p>
      <div className="mgrid" aria-label={`${script === 'h' ? '平假名' : '片假名'}熟悉度`}>
        {SEION_ROWS.flatMap((row) => {
          const cells = row.id === 'nn' ? [row.cells[0], null, null, null, null] : row.cells;
          return cells.map((c, i) => {
            if (!c) return <span key={`${row.id}${i}`} className="mc void" aria-hidden="true" />;
            const ch = script === 'h' ? c.h : c.k;
            const key = `${script}:${ch}`;
            const e = stats[key];
            const lv = kanaLevel(stats, key);
            const title = e ? `${ch}：答對 ${e.c} 次、答錯 ${e.w} 次、目前連對 ${e.s}` : `${ch}：還沒練習`;
            return (
              <span key={key} className={`mc lv${lv}`} title={title} lang="ja">
                {ch}
              </span>
            );
          });
        })}
      </div>
    </div>
  );
}

function WeakList({ stats }: { stats: KanaStats }) {
  const weak = Object.entries(stats)
    .filter(([, e]) => e.w > 0 && e.s < 3)
    .sort((a, b) => b[1].w - b[1].c * 0.25 - (a[1].w - a[1].c * 0.25))
    .slice(0, 10);
  return (
    <div>
      <p className="mg-title">最常答錯</p>
      {weak.length ? (
        <div className="weak">
          {weak.map(([k, e]) => {
            const ch = k.slice(2);
            return (
              <button key={k} type="button" className="wchip" onClick={() => speak(ch)} aria-label={`${ch}，答錯 ${e.w} 次，點一下聽發音`}>
                <span lang="ja">{ch}</span>
                <small>錯 {e.w}</small>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="small">還沒有答錯的字。</p>
      )}
    </div>
  );
}

