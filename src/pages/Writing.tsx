import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LESSON_META as LESSONS, lessonMetaById as lessonById } from '../data/lessons/meta';
import { kanaInfo, originText } from '../data/kana';
import type { Script } from '../data/types';
import { lessonStore, recordWriting, writingStore } from '../state';
import { readJSON, useStore, writeJSON } from '../state/store';
import { ROW_CHOICES, SEI_ROW_IDS, normalizeRows } from '../lib/kanaQuiz';
import { ALL_ROWS } from '../data/kana';
import { nextLesson } from '../lib/progress';
import { getStrokePaths } from '../lib/strokes';
import { speak } from '../lib/speech';
import { usePageTitle } from '../lib/title';
import { Segmented } from '../components/Controls';
import { Icon } from '../components/Icon';
import { PracticeTabs } from '../components/PracticeTabs';
import { TraceCanvas, type TraceMode, type TraceResult } from '../components/TraceCanvas';

/* ---------- 手寫才有的範圍：小字和長音（測驗不出） ---------- */
const SMALL_ROW = { id: 'small', h: 'ゃ・っ', k: 'ャ・ッ・ー', group: 'small' as const };
const WRITE_ROWS = [...ROW_CHOICES, SMALL_ROW];
const WRITE_ROW_IDS = WRITE_ROWS.map((r) => r.id);
const SMALL_CHARS: Record<Script, string[]> = {
  h: ['ゃ', 'ゅ', 'ょ', 'っ'],
  k: ['ャ', 'ュ', 'ョ', 'ッ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ー'],
};
/** 小字和長音不在五十音表裡：說明、聽發音時念的例子 */
const SMALL_INFO: Record<string, { r: string; note: string; say: string }> = {
  ゃ: { r: 'ya（小字）', note: '接在い段字後面合成一拍，例 きゃ kya', say: 'きゃ' },
  ゅ: { r: 'yu（小字）', note: '接在い段字後面合成一拍，例 きゅ kyu', say: 'きゅ' },
  ょ: { r: 'yo（小字）', note: '接在い段字後面合成一拍，例 きょ kyo', say: 'きょ' },
  っ: { r: '促音', note: '停一拍，下一個子音念兩次，例 きって kitte', say: 'きって' },
  ャ: { r: 'ya（小字）', note: '接在イ段字後面合成一拍，例 キャ kya', say: 'キャ' },
  ュ: { r: 'yu（小字）', note: '接在イ段字後面合成一拍，例 キュ kyu', say: 'キュ' },
  ョ: { r: 'yo（小字）', note: '接在イ段字後面合成一拍，例 キョ kyo', say: 'キョ' },
  ッ: { r: '促音', note: '停一拍，下一個子音念兩次，例 ベッド beddo', say: 'ベッド' },
  ァ: { r: 'a（小字）', note: '拼外國音，例 ファ fa', say: 'ファ' },
  ィ: { r: 'i（小字）', note: '拼外國音，例 ティ ti', say: 'ティ' },
  ゥ: { r: 'u（小字）', note: '拼外國音，例 トゥ tu', say: 'トゥ' },
  ェ: { r: 'e（小字）', note: '拼外國音，例 シェ she', say: 'シェ' },
  ォ: { r: 'o（小字）', note: '拼外國音，例 ウォ wo', say: 'ウォ' },
  ー: { r: '長音', note: '前一個音拉長一拍，例 コーヒー kōhī；橫寫是一橫', say: 'コーヒー' },
};

function smallScript(ch: string): Script | undefined {
  if (SMALL_CHARS.h.includes(ch)) return 'h';
  if (SMALL_CHARS.k.includes(ch)) return 'k';
  return undefined;
}

/** 範圍代號整理成固定順序（小字放最後） */
function normalizeWriteRows(rows: string[]): string[] {
  const out = normalizeRows(rows);
  return rows.includes('small') ? [...out, 'small'] : out;
}

/** 練習範圍內的字（手寫也練 ぢ、づ、を和小字，測驗則不出） */
function writingChars(rows: string[], script: Script): string[] {
  const chosen = new Set(normalizeWriteRows(rows));
  const out: string[] = [];
  for (const row of ALL_ROWS) {
    if (!chosen.has(row.id === 'nn' ? 'w' : row.id)) continue;
    for (const c of row.cells) {
      if (!c) continue;
      const ch = script === 'h' ? c.h : c.k;
      if (getStrokePaths(ch)) out.push(ch);
    }
  }
  if (chosen.has('small')) {
    for (const ch of SMALL_CHARS[script]) if (getStrokePaths(ch)) out.push(ch);
  }
  return out;
}

/** 聽發音：小字單獨念不出來，改念例子 */
function sayFor(ch: string): string {
  return SMALL_INFO[ch]?.say ?? ch;
}

interface WritePrefs {
  script: Script;
  rows: string[];
  mode: TraceMode;
}

function loadPrefs(): WritePrefs {
  const raw = readJSON('nk.write') as Partial<WritePrefs> | undefined;
  const rows = Array.isArray(raw?.rows) ? normalizeWriteRows(raw!.rows.filter((r): r is string => typeof r === 'string')) : [];
  return {
    script: raw?.script === 'k' ? 'k' : 'h',
    rows: rows.length ? rows : ['a', 'k', 's'],
    mode: raw?.mode === 'recall' ? 'recall' : 'trace',
  };
}

export default function Writing() {
  usePageTitle('手寫描字');
  const [params, setParams] = useSearchParams();
  const writing = useStore(writingStore);
  const lessons = useStore(lessonStore);
  const [prefs, setPrefs] = useState<WritePrefs>(() => {
    const p = loadPrefs();
    const l = lessonById(Number(params.get('lesson')));
    if (l) return { ...p, script: l.quiz.script, rows: normalizeRows(l.quiz.rows) };
    const ch = params.get('char');
    const inf = ch ? kanaInfo(ch) : undefined;
    if (inf && inf.row) {
      const row = inf.row.id === 'nn' ? 'w' : inf.row.id;
      return { ...p, script: inf.script, rows: p.rows.includes(row) ? p.rows : [row] };
    }
    const small = ch ? smallScript(ch) : undefined;
    if (small) return { ...p, script: small, rows: p.rows.includes('small') ? p.rows : ['small'] };
    return p;
  });
  const chars = useMemo(() => writingChars(prefs.rows, prefs.script), [prefs.rows, prefs.script]);
  const [current, setCurrent] = useState<string>(() => {
    const ch = params.get('char');
    return ch && getStrokePaths(ch) ? ch : chars[0] ?? 'あ';
  });
  const [demoKey, setDemoKey] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [result, setResult] = useState<TraceResult | null>(null);

  useEffect(() => writeJSON('nk.write', prefs), [prefs]);
  useEffect(() => {
    if (params.get('lesson') || params.get('char')) setParams({}, { replace: true });
  }, [params, setParams]);

  // 範圍改變後，目前的字不在範圍內就換成第一個
  useEffect(() => {
    if (!chars.includes(current) && chars.length) setCurrent(chars[0]);
  }, [chars, current]);

  useEffect(() => setResult(null), [current, prefs.mode, resetKey]);

  const idx = chars.indexOf(current);
  const go = (delta: number) => {
    if (!chars.length) return;
    const n = chars[(idx + delta + chars.length) % chars.length];
    setCurrent(n);
  };

  const inf = kanaInfo(current);
  const small = SMALL_INFO[current];
  const stat = writing[current];
  const strokes = getStrokePaths(current)?.length ?? 0;
  const upcoming = nextLesson(lessons);
  const lessonChoices = LESSONS.filter((l) => l.id <= (upcoming?.id ?? LESSONS.length));
  const writtenInScope = chars.filter((c) => writing[c]).length;

  const toggleRow = (id: string) => {
    const has = prefs.rows.includes(id);
    if (has && prefs.rows.length === 1) return;
    setPrefs((p) => ({ ...p, rows: has ? p.rows.filter((r) => r !== id) : WRITE_ROW_IDS.filter((r) => r === id || p.rows.includes(r)) }));
  };

  const onComplete = (r: TraceResult) => {
    recordWriting(r.char, prefs.mode, r.mistakes);
    setResult(r);
    speak(sayFor(r.char));
  };

  return (
    <div className="wrap">
      <PracticeTabs />
      <header className="ph ph-tight">
        <h1>手寫描字</h1>
        <p className="lede">照筆順一筆一筆寫，寫錯會告訴你原因。描熟了就切到「默寫」，不看字自己寫。</p>
      </header>

      <div className="settings">
        <div className="set-row">
          <span className="set-l">文字</span>
          <Segmented
            label="文字"
            value={prefs.script}
            onChange={(v) => setPrefs((p) => ({ ...p, script: v }))}
            options={[
              { value: 'h', label: '平假名' },
              { value: 'k', label: '片假名' },
            ]}
          />
          <Segmented
            label="模式"
            value={prefs.mode}
            onChange={(v) => setPrefs((p) => ({ ...p, mode: v }))}
            options={[
              { value: 'trace', label: '描字' },
              { value: 'recall', label: '默寫' },
            ]}
          />
        </div>
        <div className="set-row">
          <span className="set-l">範圍</span>
          <div className="rchips" role="group" aria-label="練習範圍">
            {WRITE_ROWS.map((r, i) => (
              <span key={r.id} className="rchip-wrap">
                {i > 0 && r.group !== WRITE_ROWS[i - 1].group ? <span className="rsep" aria-hidden="true" /> : null}
                <button type="button" className="rchip" aria-pressed={prefs.rows.includes(r.id)} lang="ja" onClick={() => toggleRow(r.id)}>
                  {prefs.script === 'k' ? r.k : r.h}
                </button>
              </span>
            ))}
          </div>
        </div>
        <div className="quick">
          {lessonChoices.map((l) => (
            <button key={l.id} type="button" className="linkbtn" onClick={() => setPrefs((p) => ({ ...p, script: l.quiz.script, rows: normalizeRows(l.quiz.rows) }))}>
              第 {l.id} 課
            </button>
          ))}
          <button type="button" className="linkbtn" onClick={() => setPrefs((p) => ({ ...p, rows: SEI_ROW_IDS }))}>
            清音全部
          </button>
        </div>
      </div>

      <div className="char-strip" role="group" aria-label={`選擇要寫的字（已寫過 ${writtenInScope}/${chars.length}）`}>
        {chars.map((c) => {
          const st = writing[c];
          return (
            <button
              key={c}
              type="button"
              lang="ja"
              className={`cs-btn ${st ? (st.recall > 0 ? 'is-recalled' : 'is-written') : ''}`}
              aria-pressed={c === current}
              onClick={() => setCurrent(c)}
              title={st ? `描字 ${st.n} 次、默寫 ${st.recall} 次` : '還沒寫過'}
            >
              {c}
            </button>
          );
        })}
      </div>

      <div className="write-layout">
        <div className="write-main">
          <TraceCanvas char={current} mode={prefs.mode} onComplete={onComplete} demoKey={demoKey} resetKey={resetKey} size={360} />
          <div className="btn-row write-btns">
            <button type="button" className="btn" onClick={() => setDemoKey((k) => k + 1)}>
              <Icon name="play" size={16} /> 示範筆順
            </button>
            <button type="button" className="btn" onClick={() => setResetKey((k) => k + 1)}>
              <Icon name="refresh" size={17} /> 重寫
            </button>
            <button type="button" className="btn" onClick={() => speak(sayFor(current))}>
              <Icon name="speaker" size={17} /> 聽發音
            </button>
          </div>
        </div>

        <aside className="card write-side" aria-live="polite">
          <div className="ws-head">
            <span className="ws-ch" lang="ja">
              {current}
            </span>
            <div>
              <p className="ws-r">{inf?.cell.r ?? small?.r}</p>
              <p className="small">
                {strokes} 畫{inf && inf.kind === 'sei' ? ` · ${originText(inf.cell, inf.script)}` : small ? ` · ${small.note}` : ''}
              </p>
            </div>
          </div>
          {result ? (
            <div className={`ws-result ${result.mistakes === 0 ? 'is-perfect' : ''}`}>
              <p className="ws-result-title">{result.mistakes === 0 ? '全部一次寫對！' : `完成，寫錯 ${result.mistakes} 次`}</p>
              <p className="small">
                {prefs.mode === 'trace' && (stat?.n ?? 0) >= 3 && !stat?.recall
                  ? '這個字已經描了 3 次以上，試試切到「默寫」。'
                  : '再寫一次會更熟，或換下一個字。'}
              </p>
              <div className="btn-row">
                <button type="button" className="btn btn-primary" onClick={() => go(1)}>
                  下一個字 <Icon name="arrow-right" size={17} />
                </button>
                <button type="button" className="btn" onClick={() => setResetKey((k) => k + 1)}>
                  再寫一次
                </button>
              </div>
            </div>
          ) : (
            <ul className="ws-tips">
              <li>從藍色圓點開始寫，圓點上的數字是第幾筆。</li>
              <li>寫錯時紅線會消失，格子下方會說明原因；同一筆錯兩次會自動示範。</li>
              <li>{prefs.mode === 'recall' ? '默寫模式不顯示字，寫錯一次後才會出現起筆位置。' : '描熟了就切到「默寫」模式。'}</li>
            </ul>
          )}
          <p className="small ws-count">
            這個字描過 {stat?.n ?? 0} 次、默寫 {stat?.recall ?? 0} 次 · 這個範圍寫過 {writtenInScope}/{chars.length} 字
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn-sm" onClick={() => go(-1)} aria-label="上一個字">
              <Icon name="arrow-left" size={16} /> 上一個
            </button>
            <button type="button" className="btn btn-sm" onClick={() => go(1)} aria-label="下一個字">
              下一個 <Icon name="arrow-right" size={16} />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
