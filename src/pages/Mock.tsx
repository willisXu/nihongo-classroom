import { memo, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { mock } from '../data/mock/n4';
import type { DrillItem } from '../data/types';
import { DrillBlock, type Result } from '../components/Drill';
import { ReadingBlock } from '../components/Reading';
import { Rich } from '../components/Rich';
import { usePageTitle } from '../lib/title';
import { jumpToElement } from '../lib/jump';

/** 這個正確率以上，代表這一科準備得不錯（只是參考：正式考試的分數是換算的） */
const TARGET = 0.7;

// 每答一題，頁面就重算成績、重畫一次：題組和短文的 props 沒變就不跟著重畫（不然 51 題每次都全部重畫）
const ExamDrill = memo(DrillBlock);
const ExamReading = memo(ReadingBlock);

/** 跳到某一科或成績。直接跳、不平滑捲動：畫面外的題組還沒排版，平滑捲動會停在錯的地方（見 lib/jump.ts） */
function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (el) jumpToElement(el);
}

const pct = (a: number, b: number) => (b ? Math.round((a * 100) / b) : 0);

/**
 * N4 模擬考：照 JLPT N4 的題型（文字・語彙、文法、讀解、聽解）的原創題目。
 * 每一題答完馬上看對錯；最下面照科目算正確率，答錯的題目列出要複習的課。紀錄不存（重新整理就重來）。
 */
export default function Mock() {
  usePageTitle('N4 模擬考');
  const [results, setResults] = useState<Record<string, Result[]>>({});
  // 每一個題組一個固定的 callback（DrillBlock 每答一題就回報）
  const handlers = useMemo(() => {
    const h: Record<string, (r: Result[]) => void> = {};
    for (const s of mock.sections) for (const p of s.parts) h[`${s.id}/${p.id}`] = (r) => setResults((all) => ({ ...all, [`${s.id}/${p.id}`]: r }));
    return h;
  }, []);
  const total = mock.sections.reduce((n, s) => n + s.parts.reduce((m, p) => m + p.items.length, 0), 0);
  const minutes = mock.sections.reduce((n, s) => n + s.minutes, 0);

  const summary = useMemo(() => {
    const review = new Set<number>();
    const rows = mock.sections.map((s) => {
      let answered = 0;
      let right = 0;
      let count = 0;
      for (const p of s.parts) {
        const r = results[`${s.id}/${p.id}`] ?? [];
        p.items.forEach((it: DrillItem, i) => {
          count += 1;
          if (r[i] === null || r[i] === undefined) return;
          answered += 1;
          if (r[i]) right += 1;
          else if (it.lesson) review.add(it.lesson);
        });
      }
      return { id: s.id, title: s.title, count, answered, right };
    });
    return { rows, review: [...review].sort((a, b) => a - b) };
  }, [results]);
  const answeredAll = summary.rows.reduce((n, r) => n + r.answered, 0);
  const rightAll = summary.rows.reduce((n, r) => n + r.right, 0);
  const finished = answeredAll === total;

  // 全部重新做：題目換 key 重新出（選項重新打亂），成績清空，回到頁首（不必重新載入整頁）
  const [round, setRound] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const restart = () => {
    setResults({});
    setRound((r) => r + 1);
    window.scrollTo(0, 0);
    // 按下的按鈕在頁尾：焦點也回到最上面，鍵盤和讀屏軟體從頭開始
    titleRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="wrap mock">
      <header className="ph">
        <p className="eyebrow">模擬考 · {total} 題 · 約 {minutes} 分鐘</p>
        <h1 ref={titleRef} tabIndex={-1}>
          {mock.title}
        </h1>
        <p className="lede">
          <Rich text={mock.intro} />
        </p>
        <nav className="lesson-jump" aria-label="跳到">
          {mock.sections.map((s) => (
            <button key={s.id} type="button" className="chip-btn" onClick={() => jumpTo(`mock-${s.id}`)}>
              {s.title}
            </button>
          ))}
          <button type="button" className="chip-btn chip-next" onClick={() => jumpTo('mock-result')}>
            看成績
          </button>
        </nav>
      </header>

      {mock.sections.map((s) => (
        // round：全部重新做時題目重新出
        <section key={`${round}/${s.id}`} className="lesson-group mock-section" aria-labelledby={`mock-${s.id}`}>
          <div className="lg-head">
            <h2 id={`mock-${s.id}`} tabIndex={-1}>
              {s.title}
            </h2>
            <p className="small">
              建議 {s.minutes} 分鐘 · {s.parts.reduce((n, p) => n + p.items.length, 0)} 題
            </p>
          </div>
          {s.intro ? (
            <p className="prose">
              <Rich text={s.intro} />
            </p>
          ) : null}
          {s.parts.map((p) => (
            <div key={p.id} className="mock-part">
              <h3 className="unit-h">{p.title}</h3>
              {p.intro ? (
                <p className="prose">
                  <Rich text={p.intro} />
                </p>
              ) : null}
              {p.reading ? (
                <ExamReading
                  title={p.reading.title}
                  lines={p.reading.lines}
                  // 讀解：題目全部答完才可以看中文、聽全文
                  exam={(results[`${s.id}/${p.id}`] ?? []).filter((r) => r !== null).length < p.items.length}
                />
              ) : null}
              <ExamDrill items={p.items} onResults={handlers[`${s.id}/${p.id}`]} exam />
            </div>
          ))}
        </section>
      ))}

      <section className="card mock-result" aria-labelledby="mock-result">
        <h2 id="mock-result" tabIndex={-1}>
          成績
        </h2>
        <table className="mock-table">
          <thead>
            <tr>
              <th scope="col">科目</th>
              <th scope="col">做了</th>
              <th scope="col">答對</th>
              <th scope="col">正確率</th>
            </tr>
          </thead>
          <tbody>
            {/* 正確率＝答對／已作答（作答途中 5 題全對是 100%，不是 5／18）；全部做完時就是照總題數算。這一科做完才標「準備得不錯」 */}
            {summary.rows.map((r) => (
              <tr key={r.id} className={r.answered === r.count && r.right / r.count >= TARGET ? 'is-ok' : undefined}>
                <th scope="row">{r.title}</th>
                <td>
                  {r.answered}／{r.count}
                </td>
                <td>{r.right}</td>
                <td>{r.answered ? `${pct(r.right, r.answered)}%` : '—'}</td>
              </tr>
            ))}
            <tr className="mock-total">
              <th scope="row">全部</th>
              <td>
                {answeredAll}／{total}
              </td>
              <td>{rightAll}</td>
              <td>{answeredAll ? `${pct(rightAll, answeredAll)}%` : '—'}</td>
            </tr>
          </tbody>
        </table>
        {finished ? (
          <p>
            {summary.rows.every((r) => r.right / r.count >= TARGET)
              ? `每一科都有 ${TARGET * 100}% 以上，N4 的範圍掌握得不錯，可以開始準備報名了。`
              : `正確率不到 ${TARGET * 100}% 的科目，先回去複習再做一次。`}
          </p>
        ) : (
          <p className="small">每一題答完就會算進來；每一科正確率 {TARGET * 100}% 以上，代表這一科準備得不錯。</p>
        )}
        {finished && summary.rows.some((r) => r.id === 'vocab' && r.right / r.count < TARGET) ? (
          <p>
            文字・語彙不到 {TARGET * 100}%：考試範圍裡課程沒有教到的詞整理在
            <Link to="/vocab/n4plus">JLPT N4 補充單字</Link>，背完再做一次。
          </p>
        ) : null}
        {summary.review.length ? (
          <p>
            答錯的題目出自：
            {summary.review.map((n, i) => (
              <span key={n}>
                {i ? '、' : ''}
                <Link to={`/lessons/${n}`}>第 {n} 課</Link>
              </span>
            ))}
            ，可以回去看那一課的文法和例句。
          </p>
        ) : null}
        <p className="small">
          這份模擬考是照日本語能力試驗 N4 的題型自己出的題目，不是官方試題；正式考試的分數是換算的，這裡的正確率只能當參考。官方的樣題在
          <a href="https://www.jlpt.jp/samples/forlearners.html" target="_blank" rel="noreferrer">
            JLPT 官方網站
          </a>
          。
        </p>
        <div className="btn-row">
          <button type="button" className="btn" onClick={restart}>
            全部重新做
          </button>
          <Link className="btn" to="/lessons">
            回到課程
          </Link>
        </div>
      </section>
    </div>
  );
}
