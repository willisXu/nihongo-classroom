/**
 * 初級課程（第 9 課起）的課文區塊：會話、短文、文法、例句、單字、漢字。練習題在 Drill.tsx。
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DialogLine, Example, KanjiEntry, ReadingLine, VocabEntry } from '../data/types';
import { kanjiInfo } from '../data/kanji';
import { courseLessonById } from '../data/lessons/meta';
import { srsStore } from '../state';
import { useStore } from '../state/store';
import { jaSpeech, wordSay, type JaText } from '../lib/ja';
import { speak, stopSpeaking } from '../lib/speech';
import { getStrokePaths } from '../lib/strokes';
import { Ja } from './Ja';
import { Rich } from './Rich';
import { SpeakIcon, usePlayFlash } from './Speak';
import { Switch } from './Controls';
import { Icon } from './Icon';

/** 例句要念的文字 */
export const exampleSay = (ex: { ja: JaText; say?: string }) => ex.say ?? jaSpeech(ex.ja);


/* ---------------- 例句 ---------------- */

export function ExampleList({ items }: { items: Example[] }) {
  return (
    <ol className="ex-list">
      {items.map((ex, i) => (
        <li key={i} className="ex">
          <SpeakIcon text={exampleSay(ex)} label="播放例句" />
          <div className="ex-body">
            <Ja text={ex.ja} className="ex-ja" as="p" />
            <p className="ex-zh">{ex.zh}</p>
            {ex.note ? (
              <p className="ex-note">
                <Rich text={ex.note} />
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ExamplesBlock({ title, items }: { title?: string; items: Example[] }) {
  return (
    <div className="ex-block">
      {title ? <h3 className="rowtitle">{title}</h3> : null}
      <ExampleList items={items} />
    </div>
  );
}

/* ---------------- 文法 ---------------- */

export function GrammarBlock({ title, form, points, examples }: { title: string; form: JaText; points: string[]; examples: Example[] }) {
  return (
    <article className="gram">
      <h3 className="gram-title">{title}</h3>
      <p className="gram-form">
        <Ja text={form} />
      </p>
      {points.length ? (
        <ul className="gram-points">
          {points.map((p, i) => (
            <li key={i}>
              <Rich text={p} />
            </li>
          ))}
        </ul>
      ) : null}
      {examples.length ? <ExampleList items={examples} /> : null}
    </article>
  );
}

/* ---------------- 會話 ---------------- */

/** 說話的人：名字是日文時用日文字型 */
function Who({ name }: { name: string }) {
  return /[ぁ-ヿ一-鿿]/u.test(name) ? <Ja text={name} className="dlg-who" /> : <span className="dlg-who">{name}</span>;
}

/** 一句一句念（會話、短文共用）：點一句念那一句，「播放整段」從頭念到尾 */
function useLinePlayer(lines: { ja: JaText; say?: string }[]) {
  /** 正在念第幾句（整段播放時）；null 是沒在播 */
  const [playing, setPlaying] = useState<number | null>(null);
  const [flashAt, setFlashAt] = useState<number | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // 離開頁面時停止念
  useEffect(() => () => stopSpeaking(), []);

  const say = (l: { ja: JaText; say?: string }) => l.say ?? jaSpeech(l.ja);

  const playFrom = (i: number) => {
    if (!alive.current) return;
    if (i >= lines.length) {
      setPlaying(null);
      return;
    }
    setPlaying(i);
    const ok = speak(say(lines[i]), { onEnd: () => playFrom(i + 1) });
    if (!ok) setPlaying(null);
  };

  const toggleAll = () => {
    if (playing !== null) {
      stopSpeaking();
      setPlaying(null);
    } else playFrom(0);
  };

  const playOne = (i: number) => {
    setPlaying(null);
    speak(say(lines[i]));
    setFlashAt(i);
    window.setTimeout(() => alive.current && setFlashAt((x) => (x === i ? null : x)), 650);
  };

  const isOn = (i: number) => playing === i || flashAt === i;
  return { playing, toggleAll, playOne, isOn };
}

function PlayAllTools({ playing, toggleAll, label, showZh, setShowZh }: { playing: number | null; toggleAll: () => void; label: string; showZh: boolean; setShowZh: (v: boolean) => void }) {
  const zhId = useId();
  return (
    <div className="dlg-tools">
      <button type="button" className={`btn btn-sm${playing !== null ? ' is-on' : ''}`} onClick={toggleAll} aria-pressed={playing !== null}>
        <Icon name={playing !== null ? 'stop' : 'play'} size={16} />
        {playing !== null ? '停止播放' : label}
      </button>
      <Switch id={zhId} checked={showZh} onChange={setShowZh}>
        顯示中文
      </Switch>
    </div>
  );
}

export function DialogBlock({ title, scene, lines }: { title?: string; scene?: string; lines: DialogLine[] }) {
  const [showZh, setShowZh] = useState(true);
  const { playing, toggleAll, playOne, isOn } = useLinePlayer(lines);

  return (
    <div className="dialog card">
      {title ? <h3 className="rowtitle">{title}</h3> : null}
      {scene ? (
        <p className="dlg-scene">
          <Rich text={scene} />
        </p>
      ) : null}
      <PlayAllTools playing={playing} toggleAll={toggleAll} label="播放整段會話" showZh={showZh} setShowZh={setShowZh} />
      <ol className="dlg-lines">
        {lines.map((l, i) => (
          <li key={i} className={`dlg-line${isOn(i) ? ' is-playing' : ''}`}>
            <Who name={l.who} />
            <div className="dlg-body">
              <button type="button" className="dlg-ja" onClick={() => playOne(i)}>
                <span className="sr-only">播放：</span>
                <Ja text={l.ja} />
              </button>
              {showZh ? <p className="dlg-zh">{l.zh}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------------- 短文 ---------------- */

/**
 * 告示、Email、傳單：像一張紙。中文翻譯預設收起來（先自己讀，看不懂再打開）。
 * exam：模擬考的讀解還沒答完時不能看中文、不能聽（點段落也不念），答完才出現。
 */
export function ReadingBlock({ title, scene, lines, exam = false }: { title?: string; scene?: string; lines: ReadingLine[]; exam?: boolean }) {
  const [showZh, setShowZh] = useState(false);
  const { playing, toggleAll, playOne, isOn } = useLinePlayer(lines);
  return (
    <div className="dialog reading card">
      {title ? <h3 className="rowtitle">{title}</h3> : null}
      {scene ? (
        <p className="dlg-scene">
          <Rich text={scene} />
        </p>
      ) : null}
      {exam ? <p className="small">先讀文章、回答下面的題目；全部答完才可以看中文、聽全文。</p> : <PlayAllTools playing={playing} toggleAll={toggleAll} label="播放全文" showZh={showZh} setShowZh={setShowZh} />}
      <div className="rd-sheet">
        {lines.map((l, i) => (
          <div key={i} className={`rd-line${isOn(i) ? ' is-playing' : ''}`}>
            {exam ? (
              <Ja text={l.ja} className="dlg-ja rd-ja" as="p" />
            ) : (
              <button type="button" className="dlg-ja rd-ja" onClick={() => playOne(i)}>
                <span className="sr-only">播放：</span>
                <Ja text={l.ja} />
              </button>
            )}
            {showZh && !exam ? <p className="dlg-zh">{l.zh}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 單字 ---------------- */

function VocabCard({ w }: { w: VocabEntry }) {
  const [on, flash] = usePlayFlash();
  return (
    <button
      type="button"
      className={`word vocab-word ${on ? 'is-playing' : ''}`}
      onClick={() => {
        speak(w.say ?? wordSay(w.ja));
        flash();
      }}
    >
      <span className="w-ja">
        <Ja text={w.ja} />
      </span>
      <span className="w-zh">{w.zh}</span>
      {w.note ? (
        <span className="w-note">
          <Rich text={w.note} inert />
        </span>
      ) : null}
    </button>
  );
}

export function VocabBlock({ title, items, note, lessonId }: { title?: string; items: VocabEntry[]; note?: string; lessonId?: number }) {
  const srs = useStore(srsStore);
  // 這一課的單字卡（每一組單字都算，連結只放在最後一組下面）
  const ids = lessonId ? courseLessonById(lessonId)?.words ?? [] : [];
  const learned = ids.filter((id) => (srs.cards[id]?.reps ?? 0) > 0).length;
  return (
    <div className="words-block">
      {title ? <h3 className="rowtitle">{title}</h3> : null}
      <div className="words vocab-words">
        {items.map((w, i) => (
          <VocabCard key={i} w={w} />
        ))}
      </div>
      {note ? (
        <p className="small">
          <Rich text={note} />
        </p>
      ) : null}
      {ids.length ? (
        <p className="small">
          <Link to={`/review/lesson-${lessonId}`}>用單字卡練這一課的 {ids.length} 個字</Link>
          {learned ? `（已經學過 ${learned} 個）` : ''}：照間隔複習排進每天的複習，記得更牢。
        </p>
      ) : null}
    </div>
  );
}

/* ---------------- 漢字 ---------------- */

/** 訓讀：送假名（・後面）顯示得淡一點，例如 た・べる */
function Kun({ r }: { r: string }) {
  const [stem, okuri] = r.split('・');
  return (
    <span className="kj-kun">
      {stem}
      {okuri ? <span className="okuri">{okuri}</span> : null}
    </span>
  );
}

function KanjiWord({ w }: { w: { ja: JaText; zh: string } }) {
  const [on, flash] = usePlayFlash();
  return (
    <li>
      <button
        type="button"
        className={`kj-word ${on ? 'is-playing' : ''}`}
        onClick={() => {
          speak(wordSay(w.ja));
          flash();
        }}
      >
        <Ja text={w.ja} />
        <span className="kj-wzh">{w.zh}</span>
      </button>
    </li>
  );
}

export function KanjiBlock({ items }: { items: KanjiEntry[] }) {
  const writable = items.filter((k) => getStrokePaths(k.ch)).map((k) => k.ch);
  return (
    <div className="kanji-block">
      <ul className="kanji-list">
        {items.map((entry) => {
          const strokes = getStrokePaths(entry.ch)?.length;
          // 讀音和意思在 data/kanji.ts（測試確認每個字都有）
          const k = { ...entry, zh: '', on: [] as string[], kun: [] as string[], ...kanjiInfo(entry.ch) };
          return (
            <li key={k.ch} className="kj card">
              <div className="kj-head">
                <span className="kj-ch" lang="ja">
                  {k.ch}
                </span>
                <div className="kj-meta">
                  <p className="kj-zh">{k.zh}</p>
                  <p className="small">
                    {strokes ? `${strokes} 畫` : null}
                    {strokes && k.tc ? ' · ' : null}
                    {k.tc ? (
                      <>
                        台灣寫作 <span className="kj-tc" lang="zh-Hant-TW">{k.tc}</span>
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
              <dl className="kj-read">
                {k.on.length ? (
                  <div>
                    <dt>音讀</dt>
                    <dd lang="ja">{k.on.join('、')}</dd>
                  </div>
                ) : null}
                {k.kun.length ? (
                  <div>
                    <dt>訓讀</dt>
                    <dd lang="ja">
                      {k.kun.map((r, i) => (
                        <span key={r}>
                          {i > 0 ? '、' : null}
                          <Kun r={r} />
                        </span>
                      ))}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <ul className="kj-words">
                {k.words.map((w) => (
                  <KanjiWord key={w.ja} w={w} />
                ))}
              </ul>
              {k.note ? (
                <p className="kj-note">
                  <Rich text={k.note} />
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {writable.length ? (
        <p className="small">
          <Link to={`/writing?chars=${encodeURIComponent(writable.join(''))}`}>用手寫描字照筆順寫這 {writable.length} 個字</Link>
        </p>
      ) : null}
    </div>
  );
}
