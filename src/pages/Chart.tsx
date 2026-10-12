import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DAKUON_ROWS, SEION_ROWS, VOWELS, YOON, kanaInfo, originText } from '../data/kana';
import type { KanaCell, Script } from '../data/types';
import { writingStore } from '../state';
import { useStore } from '../state/store';
import { speak } from '../lib/speech';
import { romaji } from '../lib/romaji';
import { getStrokePaths } from '../lib/strokes';
import { Masu, Segmented, Switch } from '../components/Controls';
import { SpeakButton } from '../components/Speak';
import { Icon } from '../components/Icon';
import { PracticeTabs } from '../components/PracticeTabs';
import { readJSON, writeJSON } from '../state/store';
import { usePageTitle } from '../lib/title';

interface ChartPrefs {
  script: Script;
  ghost: boolean;
  romaji: boolean;
}

function loadPrefs(): ChartPrefs {
  const raw = readJSON('nk.chart') as Partial<ChartPrefs> | undefined;
  return {
    script: raw?.script === 'k' ? 'k' : 'h',
    ghost: raw?.ghost !== false,
    romaji: raw?.romaji !== false,
  };
}

export default function Chart() {
  usePageTitle('五十音表');
  const [prefs, setPrefs] = useState<ChartPrefs>(loadPrefs);
  // 上次選的是片假名，就從「ア」開始
  const [sel, setSel] = useState(() => (prefs.script === 'k' ? 'ア' : 'あ'));
  const [sheetOpen, setSheetOpen] = useState(false);
  const writing = useStore(writingStore);
  const s = prefs.script;

  const update = (p: Partial<ChartPrefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    writeJSON('nk.chart', next);
    if (p.script) {
      const inf = kanaInfo(sel);
      if (inf) setSel(p.script === 'h' ? inf.cell.h : inf.cell.k);
    }
  };

  const pick = (ch: string) => {
    setSel(ch);
    speak(ch);
    setSheetOpen(true);
  };

  const cellBtn = (c: KanaCell, opts: { ghost?: boolean; yoon?: boolean } = {}) => {
    const ch = s === 'h' ? c.h : c.k;
    const g = opts.ghost ? (s === 'h' ? c.ho : c.ko ?? undefined) : undefined;
    return (
      <button
        key={ch}
        type="button"
        className={`gj-cell ${opts.yoon ? 'is-yoon' : ''} ${writing[ch] ? 'is-written' : ''}`}
        aria-pressed={sel === ch}
        onClick={() => pick(ch)}
      >
        {g && prefs.ghost ? (
          <span className="gj-ghost" aria-hidden="true">
            {g}
          </span>
        ) : null}
        <span className="gj-k" lang="ja">
          {ch}
        </span>
        {prefs.romaji ? <span className="gj-r">{c.r}</span> : <span className="sr-only">{c.r}</span>}
      </button>
    );
  };

  return (
    <div className="wrap">
      <PracticeTabs />
      <header className="ph">
        <p className="eyebrow">參考表</p>
        <h1>五十音表</h1>
        <p className="lede">點任何一格聽發音、看說明。淡淡的字是字源，可以關掉。</p>
      </header>
      <div className="toolbar">
        <Segmented
          label="顯示的文字"
          value={s}
          onChange={(v) => update({ script: v })}
          options={[
            { value: 'h', label: '平假名' },
            { value: 'k', label: '片假名' },
          ]}
        />
        <Switch id="chart-ghost" checked={prefs.ghost} onChange={(v) => update({ ghost: v })}>
          字源
        </Switch>
        <Switch id="chart-romaji" checked={prefs.romaji} onChange={(v) => update({ romaji: v })}>
          羅馬拼音
        </Switch>
      </div>

      <div className="chart-layout">
        <div className={`chart-main ${prefs.romaji ? '' : 'no-romaji'}`}>
          <h2 className="h-sub">清音</h2>
          <div className="gojuon">
            <div aria-hidden="true" />
            {VOWELS.map((v) => (
              <div key={v} className="gj-colh" aria-hidden="true">
                {v}
              </div>
            ))}
            {SEION_ROWS.map((row) => {
              const cells = row.id === 'nn' ? [row.cells[0], null, null, null, null] : row.cells;
              return [
                <div key={`${row.id}-h`} className="gj-rowh" lang="ja">
                  {s === 'h' ? row.label : row.kLabel}
                </div>,
                ...cells.map((c, i) => (c ? cellBtn(c, { ghost: true }) : <div key={`${row.id}-${i}`} aria-hidden="true" />)),
              ];
            })}
          </div>

          <h2 className="h-sub">濁音・半濁音</h2>
          <p className="row-tip">在清音右上角加兩點（濁點）或小圈（半濁點），聲音就跟著改變。</p>
          <div className="gojuon">
            <div aria-hidden="true" />
            {VOWELS.map((v) => (
              <div key={v} className="gj-colh" aria-hidden="true">
                {v}
              </div>
            ))}
            {DAKUON_ROWS.map((row) => [
              <div key={`${row.id}-h`} className="gj-rowh" lang="ja">
                {s === 'h' ? row.label : row.kLabel}
              </div>,
              ...row.cells.map((c, i) => (c ? cellBtn(c) : <div key={`${row.id}-${i}`} aria-hidden="true" />)),
            ])}
          </div>

          <h2 className="h-sub">拗音</h2>
          <p className="row-tip">小字的 ゃ、ゅ、ょ 和前一個字合成一拍，念成一個音。</p>
          <div className="yoon">
            <div aria-hidden="true" />
            {['ya', 'yu', 'yo'].map((v) => (
              <div key={v} className="gj-colh" aria-hidden="true">
                {v}
              </div>
            ))}
            {YOON.map((g) => [
              <div key={`${g.h}-h`} className="gj-rowh" lang="ja">
                {s === 'h' ? g.h : g.k}
              </div>,
              ...g.cells.map((c) => cellBtn(c, { yoon: true })),
            ])}
          </div>
        </div>

        <aside className={`detail card ${sheetOpen ? 'open' : ''}`} aria-live="polite">
          <Detail ch={sel} onClose={() => setSheetOpen(false)} written={writing[sel]?.n ?? 0} />
        </aside>
      </div>
    </div>
  );
}

function Detail({ ch, onClose, written }: { ch: string; onClose: () => void; written: number }) {
  const inf = kanaInfo(ch);
  if (!inf) return null;
  const c = inf.cell;
  const s = inf.script;
  const other = s === 'h' ? c.k : c.h;
  const strokes = getStrokePaths(ch)?.length;
  let ghost: string | undefined;
  let tip = '';
  let ex: [string, string] | null | undefined;
  let exLabel = '例字';
  if (inf.kind === 'sei') {
    ghost = s === 'h' ? c.ho : c.ko ?? undefined;
    tip = c.tip ?? '';
    ex = s === 'h' ? c.ex : c.kx;
    if (ch === 'ヲ') tip += ' 片假名的 ヲ 現在很少用到。';
  } else if (inf.kind === 'daku') {
    tip = inf.row?.tip ?? '';
    ex = c.ex;
    if (s === 'k') exLabel = '例字（平假名）';
  } else {
    tip = '小字的 ゃ、ゅ、ょ 和前一個字合成一拍，念成一個音。例如 き＋ゃ＝きゃ（kya），不是 ki-ya 兩個音。';
  }
  return (
    <>
      <div className="d-head">
        <Masu ch={ch} ghost={ghost} className={`d-masu ${inf.kind === 'yoon' ? 'is-yoon' : ''}`} />
        <div className="d-id">
          <p className="d-r">{c.r}</p>
          <SpeakButton text={ch} />
        </div>
        <button type="button" className="d-close iconbtn" aria-label="關閉說明" onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <p className="d-tip">
        {inf.kind === 'sei' && c.zy ? <span className="zy">近似 {c.zy}</span> : null}
        {tip}
      </p>
      <dl className="d-meta">
        {inf.kind === 'sei' ? (
          <div>
            <dt>字源</dt>
            <dd>{originText(c, s)}</dd>
          </div>
        ) : null}
        {strokes ? (
          <div>
            <dt>筆畫</dt>
            <dd>{strokes} 畫</dd>
          </div>
        ) : null}
        <div>
          <dt>{s === 'h' ? '片假名' : '平假名'}</dt>
          <dd className="d-other" lang="ja">
            {other}
          </dd>
        </div>
      </dl>
      {ex ? (
        <div className="d-exwrap">
          <p className="d-label">{exLabel}</p>
          <button type="button" className="d-ex" onClick={() => speak(ex![0])}>
            <span className="ex-ja" lang="ja">
              {ex[0]}
            </span>
            <span className="ex-t">
              {romaji(ex[0])} · {ex[1]}
            </span>
          </button>
        </div>
      ) : null}
      {strokes ? (
        <Link className="btn btn-block" to={`/writing?char=${encodeURIComponent(ch)}`}>
          <Icon name="pencil" size={17} /> 練習寫這個字{written ? `（已寫 ${written} 次）` : ''}
        </Link>
      ) : null}
    </>
  );
}
