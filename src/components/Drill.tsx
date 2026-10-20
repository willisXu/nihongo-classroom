/**
 * 課文裡的練習題（N5 課程）：選擇題、排列句子、聽力。答完馬上看對錯和說明，最後算總分。
 * 答題紀錄不存：課程的練習是當場確認懂了沒有，要長期記住的單字交給單字卡。
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import type { DrillItem } from '../data/types';
import { jaSpeech } from '../lib/ja';
import { speak } from '../lib/speech';
import { Ja } from './Ja';
import { Rich } from './Rich';
import { Icon } from './Icon';

const sameSeq = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** 打亂順序（保證和原本、和 avoid 裡的順序都不一樣，只有一個時照舊） */
export function shuffled<T>(list: T[], rand: () => number = Math.random, avoid: T[][] = []): number[] {
  const idx = list.map((_, i) => i);
  if (list.length < 2) return idx;
  for (let tries = 0; tries < 8; tries++) {
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    // 排出來的句子要和正確答案不一樣（同樣的詞換位置不算）
    const seq = idx.map((i) => list[i]);
    if (![list, ...avoid].some((a) => sameSeq(a, seq))) return idx;
  }
  return [...idx.slice(1), idx[0]];
}

/**
 * 排列句子：排出來的詞（文字）和正確答案、或 also 裡另一種也自然的順序一樣就算對
 * （兩個一樣的詞互換也算對）
 */
export function orderCorrect(tiles: string[], picked: number[], also: string[][] = []): boolean {
  if (picked.length !== tiles.length) return false;
  const got = picked.map((i) => tiles[i]);
  return [tiles, ...also].some((a) => sameSeq(a, got));
}

/** 選擇題的題目句：＿＿ 換成選項（答完之後顯示完整的句子） */
export function fillBlank(ja: string, option: string): string {
  return ja.replace(/＿＿+/, option);
}

type Result = boolean | null;

export function DrillBlock({ title, intro, items }: { title?: string; intro?: string; items: DrillItem[] }) {
  const [round, setRound] = useState(0);
  const [results, setResults] = useState<Result[]>(() => items.map(() => null));
  const answered = results.filter((r) => r !== null).length;
  const right = results.filter((r) => r === true).length;
  const record = (i: number, ok: boolean) => setResults((rs) => rs.map((r, j) => (j === i ? ok : r)));
  return (
    <div className="drill">
      {title ? <h3 className="rowtitle">{title}</h3> : null}
      {intro ? (
        <p className="prose">
          <Rich text={intro} />
        </p>
      ) : null}
      <ol className="drill-list" key={round}>
        {items.map((it, i) => (
          <li key={i} className="drill-item card">
            <DrillQuestion item={it} n={i + 1} onAnswer={(ok) => record(i, ok)} />
          </li>
        ))}
      </ol>
      <div className="drill-foot" aria-live="polite">
        {answered === items.length ? (
          <p className={`drill-score${right === items.length ? ' is-perfect' : ''}`}>
            {right === items.length ? `全部答對！${items.length} 題都對了。` : `答對 ${right}／${items.length} 題。錯的題目看一下說明，再做一次。`}
          </p>
        ) : (
          <p className="small">
            做了 {answered}／{items.length} 題
          </p>
        )}
        {answered > 0 ? (
          <button
            type="button"
            className="linkbtn"
            onClick={() => {
              setResults(items.map(() => null));
              setRound((r) => r + 1);
            }}
          >
            全部重做
          </button>
        ) : null}
      </div>
    </div>
  );
}

function DrillQuestion({ item, n, onAnswer }: { item: DrillItem; n: number; onAnswer: (ok: boolean) => void }) {
  switch (item.kind) {
    case 'choice':
      return <ChoiceQ item={item} n={n} onAnswer={onAnswer} />;
    case 'order':
      return <OrderQ item={item} n={n} onAnswer={onAnswer} />;
    case 'listen':
      return <ListenQ item={item} n={n} onAnswer={onAnswer} />;
  }
}

function Verdict({ ok, children }: { ok: boolean; children?: ReactNode }) {
  return (
    <div className={`drill-verdict ${ok ? 'is-ok' : 'is-ng'}`} role="status">
      <p className="dv-title">
        <Icon name={ok ? 'check' : 'close'} size={16} /> {ok ? '答對了' : '再想想'}
      </p>
      {children}
    </div>
  );
}

function ChoiceQ({ item, n, onAnswer }: { item: Extract<DrillItem, { kind: 'choice' }>; n: number; onAnswer: (ok: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const qid = useId();
  const done = picked !== null;
  const ok = picked === item.answer;
  const full = item.ja ? fillBlank(item.ja, item.options[item.answer]) : null;
  return (
    <div className="dq" role="group" aria-labelledby={qid}>
      <div id={qid} className="dq-q">
        <span className="dq-n">第 {n} 題</span>
        {item.q ? (
          <p className="dq-ask">
            <Rich text={item.q} />
          </p>
        ) : null}
        {item.ja ? <Ja text={item.ja} className="dq-ja" as="p" /> : null}
        {item.zh && !done ? <p className="dq-zh">{item.zh}</p> : null}
      </div>
      <div className="dq-opts">
        {item.options.map((o, i) => (
          <button
            key={i}
            type="button"
            className={`dq-opt${done && i === item.answer ? ' is-right' : ''}${done && i === picked && !ok ? ' is-wrong' : ''}`}
            aria-disabled={done || undefined}
            aria-pressed={picked === i}
            onClick={() => {
              if (done) return;
              setPicked(i);
              onAnswer(i === item.answer);
            }}
          >
            <Ja text={o} />
          </button>
        ))}
      </div>
      {done ? (
        <Verdict ok={ok}>
          {full ? (
            <div className="dv-sent">
              <button type="button" className="iconbtn" aria-label="播放這一句" onClick={() => speak(jaSpeech(full))}>
                <Icon name="speaker" size={17} />
              </button>
              <Ja text={full} />
            </div>
          ) : !ok ? (
            <p>
              答案：<Ja text={item.options[item.answer]} />
            </p>
          ) : null}
          {item.zh ? <p className="dq-zh">{item.zh}</p> : null}
          {item.why ? (
            <p>
              <Rich text={item.why} />
            </p>
          ) : null}
        </Verdict>
      ) : null}
    </div>
  );
}

function OrderQ({ item, n, onAnswer }: { item: Extract<DrillItem, { kind: 'order' }>; n: number; onAnswer: (ok: boolean) => void }) {
  const order = useMemo(() => shuffled(item.tiles, Math.random, item.also), [item.tiles, item.also]);
  const [picked, setPicked] = useState<number[]>([]);
  const [checked, setChecked] = useState<boolean | null>(null);
  const qid = useId();
  const answer = item.tiles.join('');
  // 排對了顯示自己排的句子（可能是另一種也對的順序），排錯了顯示正確答案
  const mine = picked.map((i) => item.tiles[i]).join('');
  const full = checked ? mine : answer;
  const bank = order.filter((i) => !picked.includes(i));
  const check = () => {
    const ok = orderCorrect(item.tiles, picked, item.also);
    setChecked(ok);
    onAnswer(ok);
  };
  return (
    <div className="dq" role="group" aria-labelledby={qid}>
      <div id={qid} className="dq-q">
        <span className="dq-n">第 {n} 題</span>
        <p className="dq-ask">排成句子：{item.zh}</p>
      </div>
      <div className="dq-line" aria-label="排好的句子">
        {picked.length ? (
          picked.map((i, k) => (
            <button
              key={`${i}-${k}`}
              type="button"
              className="tile is-placed"
              disabled={checked !== null}
              onClick={() => setPicked((p) => p.filter((x) => x !== i))}
            >
              {/* 念出來的名稱要包含看得到的字（含振假名），所以不用 aria-label */}
              <span className="sr-only">拿掉：</span>
              <Ja text={item.tiles[i]} />
            </button>
          ))
        ) : (
          <span className="dq-hint">照順序點下面的詞</span>
        )}
      </div>
      {checked === null ? (
        <>
          <div className="dq-bank" aria-label="可以用的詞">
            {bank.map((i) => (
              <button key={i} type="button" className="tile" onClick={() => setPicked((p) => [...p, i])}>
                <Ja text={item.tiles[i]} />
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-sm btn-primary" disabled={picked.length !== item.tiles.length} onClick={check}>
              檢查
            </button>
            {picked.length ? (
              <button type="button" className="linkbtn" onClick={() => setPicked([])}>
                重排
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <Verdict ok={checked}>
          <div className="dv-sent">
            <button type="button" className="iconbtn" aria-label="播放這一句" onClick={() => speak(jaSpeech(full))}>
              <Icon name="speaker" size={17} />
            </button>
            <Ja text={full} />
          </div>
          {checked && full !== answer ? (
            <p className="dv-also">
              也可以說：
              <Ja text={answer} className="ja" />
            </p>
          ) : null}
          {item.why ? (
            <p>
              <Rich text={item.why} />
            </p>
          ) : null}
          {!checked ? (
            <button
              type="button"
              className="linkbtn"
              onClick={() => {
                setPicked([]);
                setChecked(null);
              }}
            >
              再排一次
            </button>
          ) : null}
        </Verdict>
      )}
    </div>
  );
}

function ListenQ({ item, n, onAnswer }: { item: Extract<DrillItem, { kind: 'listen' }>; n: number; onAnswer: (ok: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const qid = useId();
  const done = picked !== null;
  const ok = picked === item.answer;
  const say = item.say ?? jaSpeech(item.ja);
  return (
    <div className="dq" role="group" aria-labelledby={qid}>
      <div id={qid} className="dq-q">
        <span className="dq-n">第 {n} 題</span>
        <p className="dq-ask">聽聽看，選出意思</p>
      </div>
      <div className="btn-row">
        <button type="button" className="btn btn-sm" onClick={() => speak(say)}>
          <Icon name="speaker" size={17} /> 播放
        </button>
        <button type="button" className="btn btn-sm" onClick={() => speak(say, { rate: 0.6 })}>
          慢速
        </button>
      </div>
      <div className="dq-opts dq-opts-zh">
        {item.options.map((o, i) => (
          <button
            key={i}
            type="button"
            className={`dq-opt${done && i === item.answer ? ' is-right' : ''}${done && i === picked && !ok ? ' is-wrong' : ''}`}
            aria-disabled={done || undefined}
            aria-pressed={picked === i}
            onClick={() => {
              if (done) return;
              setPicked(i);
              onAnswer(i === item.answer);
            }}
          >
            {o}
          </button>
        ))}
      </div>
      {done ? (
        <Verdict ok={ok}>
          <div className="dv-sent">
            <button type="button" className="iconbtn" aria-label="再播一次" onClick={() => speak(say)}>
              <Icon name="speaker" size={17} />
            </button>
            <Ja text={item.ja} />
          </div>
          {item.why ? (
            <p>
              <Rich text={item.why} />
            </p>
          ) : null}
        </Verdict>
      ) : null}
    </div>
  );
}
