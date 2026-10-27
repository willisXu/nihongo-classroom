import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { COURSE_LESSONS, KANA_LESSONS, kanaLessonById } from '../data/lessons/meta';
import { kanaInfo, originText } from '../data/kana';
import { kanjiInfo } from '../data/kanji';
import type { Script } from '../data/types';
import { lessonStore, recordWriting, writingStore } from '../state';
import { readJSON, useStore, writeJSON } from '../state/store';
import { ROW_CHOICES, SEI_ROW_IDS } from '../lib/kanaQuiz';
import { EXTRA_ROWS, extraOf, lessonWriteRows, normalizeWriteRows, pickedChars, rowsFor, writingChars } from '../lib/writingScope';
import { kanaCourseDone, learnedKanji as learnedKanjiOf, nextCourseLesson, nextKanaLesson } from '../lib/progress';
import { isKanji } from '../lib/ja';
import { getStrokePaths } from '../lib/strokes';
import { speak } from '../lib/speech';
import { usePageTitle } from '../lib/title';
import { Segmented } from '../components/Controls';
import { Icon } from '../components/Icon';
import { PracticeTabs } from '../components/PracticeTabs';
import { TraceCanvas, type TraceMode, type TraceResult } from '../components/TraceCanvas';

/** 範圍的選項：五十音表的行，最後是只有手寫才練的兩組（見 lib/writingScope） */
const WRITE_ROWS = [...ROW_CHOICES, ...EXTRA_ROWS];
const WRITE_ROW_IDS = WRITE_ROWS.map((r) => r.id);
/** 小字和長音不在五十音表裡：說明、聽發音時念的例子 */
const SMALL_INFO: Record<string, { r: string; note: string; say: string }> = {
  ゃ: { r: 'ya（小字）', note: '接在い段字後面合成一拍，例 きゃ kya', say: 'きゃ' },
  ゅ: { r: 'yu（小字）', note: '接在い段字後面合成一拍，例 きゅ kyu', say: 'きゅ' },
  ょ: { r: 'yo（小字）', note: '接在い段字後面合成一拍，例 きょ kyo', say: 'きょ' },
  っ: { r: '促音', note: '本身不發音，停一拍（拼音把下一個子音寫兩次），例 きって kitte', say: 'きって' },
  ャ: { r: 'ya（小字）', note: '接在イ段字後面合成一拍，例 キャ kya', say: 'キャ' },
  ュ: { r: 'yu（小字）', note: '接在イ段字後面合成一拍，例 キュ kyu', say: 'キュ' },
  ョ: { r: 'yo（小字）', note: '接在イ段字後面合成一拍，例 キョ kyo', say: 'キョ' },
  ッ: { r: '促音', note: '本身不發音，停一拍（拼音把下一個子音寫兩次），例 ベッド beddo', say: 'ベッド' },
  ァ: { r: 'a（小字）', note: '拼外國音，例 ファ fa', say: 'ファ' },
  ィ: { r: 'i（小字）', note: '拼外國音，例 ティ ti', say: 'ティ' },
  ゥ: { r: 'u（小字）', note: '拼外國音，例 トゥ tu', say: 'トゥ' },
  ェ: { r: 'e（小字）', note: '拼外國音，例 シェ she', say: 'シェ' },
  ォ: { r: 'o（小字）', note: '拼外國音，例 ウォ wo', say: 'ウォ' },
  ー: { r: '長音', note: '前一個音拉長一拍，例 コーヒー kōhī；橫寫是一橫', say: 'コーヒー' },
  ヴ: { r: 'vu', note: '拼外國音的 v，多數人念成 ブ；例 ヴァイオリン，一般寫成 バイオリン', say: 'ヴァイオリン' },
};

/** 聽發音：小字單獨念不出來，改念例子；漢字念音讀和訓讀（單獨一個漢字，語音不知道要念哪一種） */
function sayFor(ch: string): string {
  const kj = kanjiInfo(ch);
  if (kj) return [...kj.on, ...kj.kun.map((r) => r.replace('・', ''))].join('、');
  return SMALL_INFO[ch]?.say ?? ch;
}

/** 字的按鈕列最多先顯示幾行：字很多時（學過的漢字可能有兩百多個）描字格會被擠到好幾個畫面以下 */
const STRIP_ROWS = 2;
/** 自選的字超過這麼多個，上面的說明只寫有幾個字，不一個一個列出來（下面的按鈕列已經有） */
const PICK_LIST_MAX = 16;

/** 單獨打開一個漢字（錯題本、首頁的連結 ?char=日）：練教這個字的那一課的漢字 */
function kanjiPick(ch: string | null) {
  if (!ch || !isKanji(ch)) return null;
  const l = COURSE_LESSONS.find((x) => x.kanji.includes(ch));
  return pickedChars(l?.kanji ?? ch);
}

interface WritePrefs {
  script: Script;
  rows: string[];
  mode: TraceMode;
}

function loadPrefs(): WritePrefs {
  const raw = readJSON('nk.write') as Partial<WritePrefs> | undefined;
  const script: Script = raw?.script === 'k' ? 'k' : 'h';
  const rows = Array.isArray(raw?.rows) ? rowsFor(normalizeWriteRows(raw!.rows.filter((r): r is string => typeof r === 'string')), script) : [];
  return {
    script,
    rows: rows.length ? rows : ['a', 'k', 's'],
    mode: raw?.mode === 'recall' ? 'recall' : 'trace',
  };
}

export default function Writing() {
  usePageTitle('手寫描字');
  const [params, setParams] = useSearchParams();
  const writing = useStore(writingStore);
  const lessons = useStore(lessonStore);
  // 課文「長得像的字」帶一組字過來（?chars=）：這次只練這幾個字，按範圍、換文字就回到一般的行。
  // 只是暫時的：存起來的範圍（prefs）不動，下次打開還是原本的
  const [pick, setPick] = useState(() => (params.get('lesson') ? null : pickedChars(params.get('chars')) ?? kanjiPick(params.get('char'))));
  const [prefs, setPrefs] = useState<WritePrefs>(() => {
    const p = loadPrefs();
    const l = kanaLessonById(Number(params.get('lesson')));
    if (l) return { ...p, script: l.quiz.script, rows: lessonWriteRows(l.newKana) };
    if (pick) return p;
    const ch = params.get('char');
    const inf = ch ? kanaInfo(ch) : undefined;
    if (inf && inf.row) {
      const row = inf.row.id === 'nn' ? 'w' : inf.row.id;
      return { ...p, script: inf.script, rows: p.rows.includes(row) ? rowsFor(p.rows, inf.script) : [row] };
    }
    const extra = ch ? extraOf(ch) : undefined;
    if (extra) return { ...p, script: extra.script, rows: p.rows.includes(extra.row) ? rowsFor(p.rows, extra.script) : [extra.row] };
    return p;
  });
  /** 畫面上的文字：自選一組字時照那組字 */
  const script: Script = pick?.script ?? prefs.script;
  const chars = useMemo(() => pick?.chars ?? writingChars(prefs.rows, prefs.script), [pick, prefs.rows, prefs.script]);
  const [current, setCurrent] = useState<string>(() => {
    const ch = params.get('char');
    return ch && getStrokePaths(ch) ? ch : chars[0] ?? 'あ';
  });
  const [demoKey, setDemoKey] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [result, setResult] = useState<TraceResult | null>(null);
  /** 從課文、首頁、錯題本的連結帶字進來（網址參數等一下就會清掉，先記下來） */
  const [fromLink] = useState(() => !!(params.get('lesson') || params.get('char') || params.get('chars')));
  const mainRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const stripId = useId();
  /** 按鈕列一行放得下幾個字（量出來之前是 0：全部顯示） */
  const [perRow, setPerRow] = useState(0);
  const [stripOpen, setStripOpen] = useState(false);

  useEffect(() => writeJSON('nk.write', prefs), [prefs]);
  useEffect(() => {
    if (params.get('lesson') || params.get('char') || params.get('chars')) setParams({}, { replace: true });
  }, [params, setParams]);

  // 範圍改變後，目前的字不在範圍內就換成第一個
  useEffect(() => {
    if (!chars.includes(current) && chars.length) setCurrent(chars[0]);
  }, [chars, current]);

  useEffect(() => setResult(null), [current, prefs.mode, resetKey]);

  // 量按鈕列一行放得下幾個字（轉向、改變視窗大小時重量）
  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const measure = () => {
      const btn = el.querySelector<HTMLElement>('.cs-btn');
      if (!btn || !btn.offsetWidth) return;
      const gap = Number.parseFloat(getComputedStyle(el).columnGap) || 0;
      setPerRow(Math.max(1, Math.floor((el.clientWidth + gap) / (btn.offsetWidth + gap))));
    };
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 從連結帶字進來：把描字格捲進畫面（手機上設定和字的按鈕在上面，格子常常在畫面外）。
  // 等到下一個畫面再捲：Layout 換頁時會先捲回頂端
  useEffect(() => {
    if (!fromLink) return;
    const id = requestAnimationFrame(() => {
      const el = mainRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(id);
  }, [fromLink]);

  const idx = chars.indexOf(current);
  // 字比兩行多：先只顯示目前這個字所在的那一段（照順序切，換到下一段才整段換），按「顯示全部」再展開
  const stripMax = perRow * STRIP_ROWS;
  const stripLong = perRow > 0 && chars.length > stripMax;
  const stripFrom = stripLong && !stripOpen ? Math.min(Math.floor(Math.max(idx, 0) / stripMax) * stripMax, chars.length - stripMax) : 0;
  const stripChars = stripLong && !stripOpen ? chars.slice(stripFrom, stripFrom + stripMax) : chars;
  const go = (delta: number) => {
    if (!chars.length) return;
    const n = chars[(idx + delta + chars.length) % chars.length];
    setCurrent(n);
  };

  const inf = kanaInfo(current);
  const small = SMALL_INFO[current];
  const kj = kanjiInfo(current);
  const kanjiMode = !!pick && pick.chars.some(isKanji);
  const courseNow = kanaCourseDone(lessons) ? nextCourseLesson(lessons) : undefined;
  const learnedKanji = learnedKanjiOf(lessons);
  const stat = writing[current];
  const strokes = getStrokePaths(current)?.length ?? 0;
  const upcoming = nextKanaLesson(lessons);
  const lessonChoices = KANA_LESSONS.filter((l) => l.id <= (upcoming?.id ?? Infinity));
  const writtenInScope = chars.filter((c) => writing[c]).length;

  const toggleRow = (id: string) => {
    if (pick) {
      // 從「長得像的字」回到一般範圍：只選按下的這一行（文字照畫面上看到的）
      setPick(null);
      setPrefs((p) => ({ ...p, script, rows: [id] }));
      return;
    }
    const rows = rowsFor(prefs.rows, prefs.script);
    const has = rows.includes(id);
    if (has && rows.length === 1) return;
    setPrefs((p) => ({ ...p, rows: has ? rows.filter((r) => r !== id) : WRITE_ROW_IDS.filter((r) => r === id || rows.includes(r)) }));
  };
  // 這種文字有字的範圍才顯示（平假名沒有「拼外國音」那一組）
  const rowChips = WRITE_ROWS.filter((r) => (script === 'k' ? r.k : r.h));

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
            // 在練漢字時，平假名、片假名都不算選了（按下去就回到那種假名的範圍）
            value={kanjiMode ? null : script}
            onChange={(v) => {
              setPick(null);
              setPrefs((p) => {
                // 換成平假名時，「拼外國音」那一組沒有字：拿掉，都沒有了就從 あ行 開始
                const rows = rowsFor(p.rows, v);
                return { ...p, script: v, rows: rows.length ? rows : ['a'] };
              });
            }}
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
            {rowChips.map((r, i) => (
              <span key={r.id} className="rchip-wrap">
                {i > 0 && r.group !== rowChips[i - 1].group ? <span className="rsep" aria-hidden="true" /> : null}
                <button type="button" className="rchip" aria-pressed={!pick && prefs.rows.includes(r.id)} lang="ja" onClick={() => toggleRow(r.id)}>
                  {script === 'k' ? r.k : r.h}
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
              onClick={() => {
                setPick(null);
                setPrefs((p) => ({ ...p, script: l.quiz.script, rows: lessonWriteRows(l.newKana) }));
              }}
            >
              第 {l.id} 課
            </button>
          ))}
          <button
            type="button"
            className="linkbtn"
            onClick={() => {
              setPick(null);
              setPrefs((p) => ({ ...p, script, rows: SEI_ROW_IDS }));
            }}
          >
            清音全部
          </button>
          {courseNow?.kanji ? (
            <button type="button" className="linkbtn" onClick={() => setPick(pickedChars(courseNow.kanji))}>
              第 {courseNow.id} 課的漢字
            </button>
          ) : null}
          {learnedKanji ? (
            <button type="button" className="linkbtn" onClick={() => setPick(pickedChars(learnedKanji))}>
              學過的漢字
            </button>
          ) : null}
        </div>
        {pick ? (
          <p className="pick-note">
            <span>
              {kanjiMode ? `現在練 ${pick.chars.length} 個漢字` : `現在只練課文裡長得像的 ${pick.chars.length} 個字`}
              {pick.chars.length <= PICK_LIST_MAX ? (
                <>
                  ：<span lang="ja">{pick.chars.join('、')}</span>
                </>
              ) : null}
            </span>
            <button type="button" className="linkbtn" onClick={() => setPick(null)}>
              回到原本的範圍
            </button>
          </p>
        ) : null}
      </div>

      <div ref={stripRef} id={stripId} className="char-strip" role="group" aria-label={`選擇要寫的字（已寫過 ${writtenInScope}/${chars.length}）`}>
        {stripChars.map((c) => {
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
      {stripLong ? (
        <button
          type="button"
          className="linkbtn"
          aria-expanded={stripOpen}
          aria-controls={stripId}
          onClick={() => {
            setStripOpen(!stripOpen);
            // 收起後按鈕列一下子變短，剛按的按鈕會跑到畫面外：捲回按鈕列
            if (stripOpen) requestAnimationFrame(() => stripRef.current?.scrollIntoView({ block: 'nearest' }));
          }}
        >
          {stripOpen ? '收起' : `顯示全部 ${chars.length} 個字`}
        </button>
      ) : null}

      <div className="write-layout">
        <div ref={mainRef} className="write-main">
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
              <p className="ws-r">{inf?.cell.r ?? small?.r ?? kj?.zh}</p>
              <p className="small">
                {strokes} 畫{inf && inf.kind === 'sei' ? ` · ${originText(inf.cell, inf.script)}` : small ? ` · ${small.note}` : ''}
              </p>
              {kj ? (
                <p className="small ws-kanji">
                  {kj.on.length ? (
                    <span>
                      音讀 <span lang="ja">{kj.on.join('、')}</span>
                    </span>
                  ) : null}
                  {kj.kun.length ? (
                    <span>
                      訓讀 <span lang="ja">{kj.kun.map((r) => r.replace('・', '')).join('、')}</span>
                    </span>
                  ) : null}
                </p>
              ) : null}
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
