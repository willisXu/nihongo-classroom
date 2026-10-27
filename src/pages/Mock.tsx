import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { mock } from '../data/mock/n4';
import { DrillBlock, type Answer } from '../components/Drill';
import { ReadingBlock } from '../components/Reading';
import { Rich } from '../components/Rich';
import { usePageTitle } from '../lib/title';
import { jumpToElement } from '../lib/jump';
import { answeredCount, emptyMock, parseMockSaved, partKey, scoreMock, type MockSaved } from '../lib/mockSave';
import { MOCK_KEY } from '../state';
import { readJSON, removeKey, writeJSON } from '../state/store';

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

const md = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
};

/**
 * N4 模擬考：照 JLPT N4 的題型（文字・語彙、文法、讀解、聽解）的原創題目。
 * 每一題答完馬上看對錯（只算第一次作答）；最下面照科目算正確率，全部做完才列出要複習的課。
 * 作答存在瀏覽器裡（nk.mock，見 lib/mockSave.ts）：重新整理、去看課文再回來、手機把分頁收掉，都可以接著做；
 * 按「全部重新做」才清掉。
 */
export default function Mock() {
  usePageTitle('N4 模擬考');
  const [saved, setSaved] = useState<MockSaved>(() => parseMockSaved(mock, readJSON(MOCK_KEY)));
  /** 打開頁面時接著上次做了幾題（0：從頭開始） */
  const [resumed] = useState(() => answeredCount(saved));
  useEffect(() => {
    if (saved.started) writeJSON(MOCK_KEY, saved);
  }, [saved]);
  // 每一個題組一個固定的 callback（DrillBlock 每答一題就回報；固定才不會讓 memo 的題組跟著重畫）
  const handlers = useMemo(() => {
    const h: Record<string, (a: (Answer | null)[]) => void> = {};
    for (const s of mock.sections)
      for (const p of s.parts) {
        const key = partKey(s.id, p.id);
        h[key] = (a) => setSaved((cur) => ({ ...cur, started: cur.started || Date.now(), answers: { ...cur.answers, [key]: a } }));
      }
    return h;
  }, []);
  const total = mock.sections.reduce((n, s) => n + s.parts.reduce((m, p) => m + p.items.length, 0), 0);
  const minutes = mock.sections.reduce((n, s) => n + s.minutes, 0);

  const summary = useMemo(() => scoreMock(mock, saved), [saved]);
  const answeredAll = summary.rows.reduce((n, r) => n + r.answered, 0);
  const rightAll = summary.rows.reduce((n, r) => n + r.right, 0);
  const finished = answeredAll === total;

  // 全部重新做：先確認（會清掉存著的作答）；題目換 key 重新出（選項重新打亂），回到頁首（不必重新載入整頁）
  const [round, setRound] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const restart = () => {
    removeKey(MOCK_KEY);
    setSaved(emptyMock(mock));
    setRound((r) => r + 1);
    setConfirming(false);
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
        <p className="small">作答會存在這個瀏覽器裡：中途離開、重新整理，回來都可以接著做。分數只算每一題第一次的作答。</p>
        {resumed && round === 0 ? (
          <p className="tip">
            接著 {md(saved.started)}開始的作答（做了 {resumed}／{total} 題）。想從頭做，按最下面的「全部重新做」。
          </p>
        ) : null}
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
          {s.parts.map((p) => {
            const key = partKey(s.id, p.id);
            return (
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
                  exam={(saved.answers[key] ?? []).filter((a) => a !== null).length < p.items.length}
                />
              ) : null}
              <ExamDrill items={p.items} saved={saved.answers[key]} onAnswers={handlers[key]} exam />
            </div>
            );
          })}
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
        {/* 做完才列出要複習的課：做到一半就看，等於提示了還沒做的題目考哪一課 */}
        {finished && summary.review.length ? (
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
        {confirming ? (
          <div className="btn-row" role="group" aria-label="確定要從頭做嗎">
            <p className="small">要清掉這 {answeredAll} 題的作答，從頭做嗎？</p>
            <button type="button" className="btn btn-primary" onClick={restart}>
              清掉，從頭做
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(false)} autoFocus>
              取消
            </button>
          </div>
        ) : (
          <div className="btn-row">
            <button type="button" className="btn" disabled={answeredAll === 0} onClick={() => setConfirming(true)}>
              全部重新做
            </button>
            <Link className="btn" to="/lessons">
              回到課程
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
