/**
 * 初級課程（第 9 課起）的課文區塊：文法、例句、單字、漢字（會話、短文在 Reading.tsx）。練習題在 Drill.tsx。
 */
import { useId } from 'react';
import { Link } from 'react-router-dom';
import type { Example, KanjiEntry, VocabEntry } from '../data/types';
import { kanjiInfo } from '../data/kanji';
import { courseLessonById } from '../data/lessons/meta';
import { wordLearned } from '../data/vocab/meta';
import { srsStore } from '../state';
import { useStore } from '../state/store';
import { jaSpeech, wordSay, type JaText } from '../lib/ja';
import { speak } from '../lib/speech';
import { strokeCount } from '../data/strokeCounts';
import { Ja } from './Ja';
import { Rich } from './Rich';
import { SpeakIcon, usePlayFlash } from './Speak';

/** 例句要念的文字 */
export const exampleSay = (ex: { ja: JaText; say?: string }) => ex.say ?? jaSpeech(ex.ja);

/* ---------------- 例句 ---------------- */

export function ExampleList({ items }: { items: Example[] }) {
  const base = useId();
  return (
    <ol className="ex-list">
      {items.map((ex, i) => (
        <li key={i} className="ex">
          <SpeakIcon text={exampleSay(ex)} label="播放例句" describedBy={`${base}-${i}`} />
          <div className="ex-body">
            <Ja text={ex.ja} className="ex-ja" as="p" id={`${base}-${i}`} />
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

/* ---------------- 會話、短文（在 Reading.tsx） ---------------- */

export { DialogBlock, ReadingBlock } from './Reading';

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
  // 在別的牌組學過的同一個字也算學過（這一課的單字卡不會再把它當新卡）
  const learned = ids.filter((id) => wordLearned(srs.cards, id)).length;
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
  const writable = items.filter((k) => strokeCount(k.ch)).map((k) => k.ch);
  return (
    <div className="kanji-block">
      <ul className="kanji-list">
        {items.map((entry) => {
          const strokes = strokeCount(entry.ch);
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
