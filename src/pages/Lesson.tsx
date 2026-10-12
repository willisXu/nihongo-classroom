import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LESSONS, lessonById } from '../data/lessons';
import { rowById, originText } from '../data/kana';
import type { KanaRow, LessonBlock, LessonWord, Script } from '../data/types';
import { lessonStore, setHomework, setLessonDone } from '../state';
import { useStore } from '../state/store';
import { romaji } from '../lib/romaji';
import { getStrokePaths } from '../lib/strokes';
import { speak } from '../lib/speech';
import { Rich } from '../components/Rich';
import { Masu, Stamp, Switch } from '../components/Controls';
import { SpeakButton, usePlayFlash } from '../components/Speak';
import { Icon } from '../components/Icon';

export default function LessonPage() {
  const { id } = useParams();
  const lesson = lessonById(Number(id));
  const progress = useStore(lessonStore);

  if (!lesson) {
    return (
      <div className="wrap">
        <header className="ph">
          <h1>找不到這一課</h1>
          <p className="lede">
            課程只有第 1 到第 {LESSONS.length} 課。<Link to="/lessons">回課程列表</Link>
          </p>
        </header>
      </div>
    );
  }

  const isDone = !!progress.done[lesson.id];
  const hwKeys = lesson.homework.map((_, i) => `${lesson.id}:${i}`);
  const hwDone = hwKeys.filter((k) => progress.hw[k]).length;
  const prev = lessonById(lesson.id - 1);
  const next = lessonById(lesson.id + 1);

  return (
    <div className="wrap">
      <header className="ph">
        <p className="eyebrow">
          第 {lesson.id} 課 · 約 {lesson.minutes} 分鐘{isDone ? ' · 已完成' : ''}
        </p>
        <h1>{lesson.headline}</h1>
        <p className="lede">
          <Rich text={lesson.summary} />
        </p>
        <ol className="toc">
          {lesson.sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                {s.title}
              </a>
            </li>
          ))}
          <li>
            <a
              href="#homework"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('homework')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              作業
            </a>
          </li>
        </ol>
        <div className="btn-row">
          <Link className="btn" to={`/practice?lesson=${lesson.id}`}>
            <Icon name="target" size={17} /> 練這一課的假名
          </Link>
          <Link className="btn" to={`/writing?lesson=${lesson.id}`}>
            <Icon name="pencil" size={17} /> 手寫這一課的字
          </Link>
        </div>
      </header>

      {lesson.sections.map((s, i) => (
        <section key={s.id} id={s.id} className="block" aria-labelledby={`h-${s.id}`}>
          <h2 id={`h-${s.id}`}>
            <span className="secnum" aria-hidden="true">
              {i + 1}
            </span>
            {s.title}
          </h2>
          {s.blocks.map((b, j) => (
            <Block key={j} block={b} />
          ))}
        </section>
      ))}

      <section id="homework" className="block" aria-labelledby="h-homework">
        <h2 id="h-homework">
          <span className="secnum" aria-hidden="true">
            {lesson.sections.length + 1}
          </span>
          今天的作業
        </h2>
        <ul className="hw">
          {lesson.homework.map((h, i) => {
            const key = `${lesson.id}:${i}`;
            return (
              <li key={key}>
                <label htmlFor={`hw-${key}`}>
                  <input id={`hw-${key}`} type="checkbox" checked={!!progress.hw[key]} onChange={(e) => setHomework(key, e.target.checked)} />
                  <span>
                    <Rich text={h} />
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="finish-row">
          {isDone ? (
            <>
              <p className="done-note">
                <Icon name="check" size={18} /> 這一課已完成
              </p>
              <button type="button" className="linkbtn" onClick={() => setLessonDone(lesson.id, false)}>
                改回未完成
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={() => setLessonDone(lesson.id, true)}>
                <Icon name="check" size={17} /> 完成第 {lesson.id} 課
              </button>
              <p className="small">
                作業完成 {hwDone}/{lesson.homework.length}
                {hwDone < lesson.homework.length ? '，做完再按也可以。' : '，可以進下一課了。'}
              </p>
            </>
          )}
        </div>
        {lesson.next ? (
          <div className="nextup">
            <p className="eyebrow">{next ? '下一課' : '接下來'}</p>
            <p>
              <Rich text={lesson.next} />
            </p>
          </div>
        ) : null}
      </section>

      <nav className="pager" aria-label="上一課與下一課">
        {prev ? (
          <Link className="btn" to={`/lessons/${prev.id}`}>
            <Icon name="arrow-left" size={17} /> 第 {prev.id} 課 <span lang="ja">{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link className="btn" to={`/lessons/${next.id}`}>
            第 {next.id} 課 <span lang="ja">{next.title}</span> <Icon name="arrow-right" size={17} />
          </Link>
        ) : (
          <Link className="btn" to="/vocab">
            去背 N5 單字 <Icon name="arrow-right" size={17} />
          </Link>
        )}
      </nav>
    </div>
  );
}

/* ---------------- 區塊 ---------------- */

function Block({ block }: { block: LessonBlock }) {
  switch (block.type) {
    case 'p':
      return (
        <p className="prose">
          <Rich text={block.text} />
        </p>
      );
    case 'kana':
      return <KanaBlock rows={block.rows} script={block.script} title={block.title} />;
    case 'callout':
      return (
        <div className="callout">
          <Stamp>{block.label}</Stamp>
          {block.items.length === 1 ? (
            <p>
              <Rich text={block.items[0]} />
            </p>
          ) : (
            <ul>
              {block.items.map((t, i) => (
                <li key={i}>
                  <Rich text={t} />
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    case 'words':
      return <WordsBlock title={block.title} items={block.items} note={block.note} maskable={block.maskable} loan={block.variant === 'loan'} />;
    case 'pairs':
      return (
        <div className="pairs-block">
          {block.title ? <h3 className="rowtitle">{block.title}</h3> : null}
          <ul className="pairs">
            {block.items.map((p, i) => (
              <li key={i}>
                <WordCard w={p.a} />
                <span className="pair-vs" aria-hidden="true">
                  ↔
                </span>
                <WordCard w={p.b} />
                {p.note ? (
                  <span className="pair-note">
                    <Rich text={p.note} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      );
    case 'sentence':
      return (
        <div className="card sent-card">
          <div className="sent-legend" aria-hidden="true">
            <span className="lg s-kanji">漢字</span>
            <span className="lg s-hira">平假名</span>
            <span className="lg s-kata">片假名</span>
          </div>
          <p className="sent" lang="ja">
            {block.segments.map((seg, i) =>
              seg.kind === 'plain' ? (
                <span key={i} className="seg seg-plain">
                  {seg.text}
                </span>
              ) : (
                <span key={i} className={`seg s-${seg.kind}`}>
                  <span>{seg.ruby ? <ruby>{seg.text}<rt>{seg.ruby}</rt></ruby> : seg.text}</span>
                  <span className="seg-l" lang="zh-Hant-TW">
                    {seg.kind === 'kanji' ? '漢' : seg.kind === 'hira' ? '平' : '片'}
                  </span>
                </span>
              ),
            )}
          </p>
          <div className="sent-foot">
            <SpeakButton text={block.say}>播放整句</SpeakButton>
            <p className="sent-read">
              <span className="rm">{block.romaji}</span>
              <span>{block.zh}</span>
            </p>
          </div>
        </div>
      );
    case 'scripts':
      return (
        <div className="trio">
          <article className="card tri h">
            <p className="tri-name">
              平假名<span lang="ja">ひらがな</span>
            </p>
            <p className="tri-eg" lang="ja">
              あいう
            </p>
            <p>由漢字的草書簡化而來，線條圓滑。日文原有的詞、助詞、動詞的語尾都用它，所以最先學。</p>
          </article>
          <article className="card tri k">
            <p className="tri-name">
              片假名<span lang="ja">カタカナ</span>
            </p>
            <p className="tri-eg" lang="ja">
              アイウ
            </p>
            <p>多半取漢字的一部分而來，線條有稜角。用來寫外來語、外國人名地名、擬聲詞，或表示強調。</p>
          </article>
          <article className="card tri c">
            <p className="tri-name">
              漢字<span lang="ja">かんじ</span>
            </p>
            <p className="tri-eg" lang="ja">
              私好駅
            </p>
            <p>和中文同源，意思常常猜得到，但讀音要另外學，同一個字常有好幾種念法。</p>
          </article>
        </div>
      );
    case 'fontcompare':
      return (
        <figure className="fontcmp-wrap">
          <div className="fontcmp">
            <div>
              <div className="fc-k hand" lang="ja">
                {block.chars}
              </div>
              <p className="fc-cap">手寫（教科書體）：筆畫分開</p>
            </div>
            <div>
              <div className="fc-k print" lang="ja">
                {block.chars}
              </div>
              <p className="fc-cap">電腦字型（黑體）：常連成一筆</p>
            </div>
          </div>
          {block.caption ? (
            <figcaption>
              <Rich text={block.caption} />
            </figcaption>
          ) : null}
        </figure>
      );
    case 'table':
      return (
        <div className="table-scroll">
          <table className="ltable">
            <thead>
              <tr>
                {block.head.map((h, i) => (
                  <th key={i} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>
                      <Rich text={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function KanaBlock({ rows, script, title }: { rows: string[]; script: Script; title?: string }) {
  const list = rows.map((r) => rowById(r)).filter((r): r is KanaRow => !!r);
  return (
    <div className="kana-block">
      {title ? (
        <h3 className="rowtitle" lang="ja">
          {title}
        </h3>
      ) : null}
      {list.map((row) => (
        <KanaRowView key={row.id} row={row} script={script} showLabel={list.length > 1} />
      ))}
    </div>
  );
}

function KanaRowView({ row, script, showLabel }: { row: KanaRow; script: Script; showLabel: boolean }) {
  const cells = row.cells;
  const filled = cells.filter((c): c is NonNullable<typeof c> => !!c);
  return (
    <div className="kana-row">
      {showLabel ? (
        <p className="row-label" lang="ja">
          {script === 'h' ? row.label : row.kLabel}
        </p>
      ) : null}
      <div className={`row5 ${filled.length < 5 ? 'row-sparse' : ''}`}>
        {cells.map((c, i) => {
          if (!c) return <span key={i} className="mbtn-empty" aria-hidden="true" />;
          const ch = script === 'h' ? c.h : c.k;
          const ghost = script === 'h' ? c.ho : c.ko ?? undefined;
          return <KanaButton key={ch} ch={ch} romaji={c.r} ghost={ghost} />;
        })}
      </div>
      {row.tip ? <p className="row-tip">{row.tip}</p> : null}
      {filled.some((c) => c.tip) ? (
        <ul className="knotes">
          {filled.map((c) => {
            const ch = script === 'h' ? c.h : c.k;
            const strokes = getStrokePaths(ch)?.length;
            const example = script === 'h' ? c.ex : c.kx;
            return (
              <li key={ch}>
                <span className="kn-k" lang="ja">
                  {ch}
                </span>
                <span className="kn-r">{c.r}</span>
                <span className="kn-t">
                  {script === 'h' ? (
                    <>
                      {c.zy ? <span className="zy">{c.zy}</span> : null}
                      {c.tip}
                    </>
                  ) : example ? (
                    <>
                      例：
                      <button type="button" className="say-inline" lang="ja" onClick={() => speak(example[0])}>
                        {example[0]}
                      </button>
                      （{example[1]}）
                    </>
                  ) : (
                    c.tip
                  )}
                </span>
                <span className="kn-o">
                  {originText(c, script)}
                  {strokes ? ` · ${strokes} 畫` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function KanaButton({ ch, romaji: r, ghost }: { ch: string; romaji: string; ghost?: string }) {
  const [on, flash] = usePlayFlash();
  return (
    <button
      type="button"
      className={`mbtn ${on ? 'is-playing' : ''}`}
      aria-label={`播放 ${ch}（${r}）`}
      onClick={() => {
        speak(ch);
        flash();
      }}
    >
      <Masu ch={ch} ghost={ghost} />
      <span className="romaji">{r}</span>
    </button>
  );
}

function WordsBlock({ title, items, note, maskable, loan }: { title?: string; items: LessonWord[]; note?: string; maskable?: boolean; loan?: boolean }) {
  const [mask, setMask] = useState(false);
  const [maskId] = useState(() => `mask-${Math.random().toString(36).slice(2, 8)}`);
  return (
    <div className="words-block">
      {title || maskable ? (
        <div className="h3row">
          {title ? <h3 className="rowtitle">{title}</h3> : <span />}
          {maskable ? (
            <Switch id={maskId} checked={mask} onChange={setMask}>
              遮住拼音
            </Switch>
          ) : null}
        </div>
      ) : null}
      <div className={`words ${mask ? 'mask-r' : ''} ${loan ? 'loans' : ''}`}>
        {items.map((w, i) => (
          <WordCard key={i} w={w} loan={loan} />
        ))}
      </div>
      {note ? (
        <p className="small">
          <Rich text={note} />
        </p>
      ) : null}
    </div>
  );
}

function WordCard({ w, loan }: { w: LessonWord; loan?: boolean }) {
  const [on, flash] = usePlayFlash();
  const r = w.r ?? romaji(w.ja);
  return (
    <button
      type="button"
      className={`word ${on ? 'is-playing' : ''}`}
      onClick={() => {
        speak(w.ja);
        flash();
      }}
    >
      {loan ? <span className="w-zh">{w.zh}</span> : null}
      <span className="w-ja" lang="ja">
        {w.ja}
      </span>
      <span className="w-r">{r}</span>
      {!loan ? (
        <span className="w-zh">
          {w.zh}
          {w.kanji && w.kanji !== w.zh ? (
            <span className="w-kanji" lang="ja">
              {' '}
              {w.kanji}
            </span>
          ) : null}
        </span>
      ) : null}
      {w.note ? <span className="w-note">{w.note}</span> : null}
    </button>
  );
}
