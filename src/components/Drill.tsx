/**
 * 課文裡的練習題（初級課程）：選擇題、排列句子、聽力。答完馬上看對錯和說明，最後算總分。
 * 答題紀錄不存：課程的練習是當場確認懂了沒有，要長期記住的單字交給單字卡。
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import type { DrillItem } from '../data/types';
import { jaSpeech } from '../lib/ja';
import { speak, stopSpeaking } from '../lib/speech';
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
 * 選擇題、聽力題的選項順序：每次打亂（課文裡正確答案常寫在第一個，照寫的順序顯示就變成「選第一個就對」）。
 * 回傳原本的選項編號，答案照原本的編號比對。
 */
export function optionOrder(n: number, rand: () => number = Math.random): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
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

const KANA_ONLY = /^[\u3041-\u309f\u30a0-\u30ffー]+$/u;

/** 標讀音：寫法和讀音最後相同的假名（送假名）不標，例如 建てられました＋たてられました → ｜建《た》てられました */
function withReading(base: string, reading: string): string {
  let n = 0;
  while (n < base.length - 1 && n < reading.length - 1 && base[base.length - 1 - n] === reading[reading.length - 1 - n] && KANA_ONLY.test(base[base.length - 1 - n])) n++;
  return `｜${base.slice(0, base.length - n)}《${reading.slice(0, reading.length - n)}》${base.slice(base.length - n)}`;
}

/**
 * ⟦⟧ 題（考念法、寫法）答完以後顯示的句子：把要考的詞換成「漢字《讀音》」。
 * 念法題：⟦切符⟧＋選項 きっぷ → 切符《きっぷ》；寫法題：⟦りょこう⟧＋選項 ⟦旅行⟧ → 旅行《りょこう》。
 * 其他（換句話說：⟦暗《くら》い⟧）照原句顯示。
 */
export function fillTarget(ja: string, option: string): string {
  const m = /⟦([^⟧]+)⟧/.exec(ja);
  if (!m) return ja;
  const inner = m[1];
  const opt = option.replace(/[⟦⟧]/g, '');
  if (!inner.includes('《') && !KANA_ONLY.test(inner) && KANA_ONLY.test(opt)) return ja.replace(m[0], withReading(inner, opt));
  if (KANA_ONLY.test(inner) && !KANA_ONLY.test(opt) && !opt.includes('《')) return ja.replace(m[0], withReading(opt, inner));
  return ja;
}

export type Result = boolean | null;

/** 記下第 i 題答對了沒有。firstOnly（模擬考）：只算第一次作答，之後不能改 */
export function withResult(results: Result[], i: number, ok: boolean, firstOnly = false): Result[] {
  if (firstOnly && results[i] !== null) return results;
  return results.map((r, j) => (j === i ? ok : r));
}

/**
 * 一組練習題。exam（模擬考）：只算第一次作答，沒有「再排一次」「全部重做」
 * （看過答案再重答，成績就不準了；要重新做整份考卷用頁面最下面的按鈕）。
 */
export function DrillBlock({ title, intro, items, onResults, exam = false }: { title?: string; intro?: string; items: DrillItem[]; onResults?: (results: Result[]) => void; exam?: boolean }) {
  const [round, setRound] = useState(0);
  const [results, setResults] = useState<Result[]>(() => items.map(() => null));
  // 模擬考：每答一題就把結果交給頁面算總分
  useEffect(() => onResults?.(results), [results, onResults]);
  const answered = results.filter((r) => r !== null).length;
  const right = results.filter((r) => r === true).length;
  const record = (i: number, ok: boolean) => setResults((rs) => withResult(rs, i, ok, exam));
  // 「全部重做」按下後就消失了：題目重新出好以後，焦點移到第 1 題
  const listRef = useRef<HTMLOListElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    listRef.current?.querySelector<HTMLElement>('.dq')?.focus();
  }, [round]);
  return (
    <div className="drill">
      {title ? <h3 className="rowtitle">{title}</h3> : null}
      {intro ? (
        <p className="prose">
          <Rich text={intro} />
        </p>
      ) : null}
      <ol className="drill-list" key={round} ref={listRef}>
        {items.map((it, i) => (
          <li key={i} className="drill-item card">
            <DrillQuestion item={it} n={i + 1} exam={exam} onAnswer={(ok) => record(i, ok)} />
          </li>
        ))}
      </ol>
      <div className="drill-foot" aria-live="polite">
        {answered === items.length ? (
          <p className={`drill-score${right === items.length ? ' is-perfect' : ''}`}>
            {right === items.length ? `全部答對！${items.length} 題都對了。` : `答對 ${right}／${items.length} 題。錯的題目看一下說明${exam ? '。' : '，再做一次。'}`}
          </p>
        ) : (
          <p className="small">
            做了 {answered}／{items.length} 題
          </p>
        )}
        {answered > 0 && !exam ? (
          <button
            type="button"
            className="linkbtn"
            onClick={() => {
              refocus.current = true;
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

function DrillQuestion({ item, n, exam, onAnswer }: { item: DrillItem; n: number; exam: boolean; onAnswer: (ok: boolean) => void }) {
  switch (item.kind) {
    case 'choice':
      return <ChoiceQ item={item} n={n} onAnswer={onAnswer} />;
    case 'order':
      return <OrderQ item={item} n={n} exam={exam} onAnswer={onAnswer} />;
    case 'listen':
      return <ListenQ item={item} n={n} onAnswer={onAnswer} />;
    case 'talk':
      return <TalkQ item={item} n={n} onAnswer={onAnswer} />;
  }
}

/** focusRef：答完要把焦點移過來時才給（排列題按「檢查」以後，原本的按鈕都不見了） */
function Verdict({ ok, children, focusRef }: { ok: boolean; children?: ReactNode; focusRef?: Ref<HTMLDivElement> }) {
  return (
    <div ref={focusRef} tabIndex={focusRef ? -1 : undefined} className={`drill-verdict ${ok ? 'is-ok' : 'is-ng'}`} role="status">
      <p className="dv-title">
        <Icon name={ok ? 'check' : 'close'} size={16} /> {ok ? '答對了' : '再想想'}
      </p>
      {children}
    </div>
  );
}

/** 答完以後選項上給讀螢幕軟體的說明：正確答案只用顏色標出來，聽的人不知道是哪一個 */
function OptionMark({ right, mine }: { right: boolean; mine: boolean }) {
  return (
    <>
      {right ? <span className="sr-only">（正確答案）</span> : null}
      {mine ? <span className="sr-only">（你的答案）</span> : null}
    </>
  );
}

/** 聽力題答錯時寫出答案：判定區顯示的是聽到的句子，看不出該選哪一個 */
function AnswerLine({ options, ja, answer }: { options: string[]; ja?: boolean; answer: number }) {
  return <p>答案：{ja ? <Ja text={options[answer]} /> : options[answer]}</p>;
}

function ChoiceQ({ item, n, onAnswer }: { item: Extract<DrillItem, { kind: 'choice' }>; n: number; onAnswer: (ok: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const qid = useId();
  const done = picked !== null;
  const ok = picked === item.answer;
  const blank = !!item.ja && /＿＿/.test(item.ja);
  const full = item.ja ? (blank ? fillBlank(item.ja, item.options[item.answer]) : fillTarget(item.ja, item.options[item.answer])) : null;
  // 答完的句子裡看得到答案：填空題、寫法題（換成漢字）。換句話說（句子不變）、念法題（答案是振假名，可能關掉了）、
  // 沒有句子的題目，答錯時另外寫出答案（不然只有選項的顏色標出哪個對）
  const answerInSentence = !!full && full !== item.ja && (blank || !KANA_ONLY.test(item.options[item.answer]));
  // 第一次畫出來時打亂一次，之後重畫（例如切換振假名）都不變
  const [order] = useState(() => optionOrder(item.options.length));
  return (
    <div className="dq" role="group" aria-labelledby={qid} tabIndex={-1}>
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
        {order.map((i) => (
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
            <Ja text={item.options[i]} />
            {done ? <OptionMark right={i === item.answer} mine={i === picked} /> : null}
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
          ) : null}
          {!ok && !answerInSentence ? (
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

/** 聽力題的選項：中文，或日文（optionsJa） */
function AnswerOptions({ options, ja, order, answer, picked, onPick }: { options: string[]; ja?: boolean; order: number[]; answer: number; picked: number | null; onPick: (i: number) => void }) {
  const done = picked !== null;
  const ok = picked === answer;
  return (
    <div className={`dq-opts${ja ? '' : ' dq-opts-zh'}`}>
      {order.map((i) => (
        <button
          key={i}
          type="button"
          className={`dq-opt${done && i === answer ? ' is-right' : ''}${done && i === picked && !ok ? ' is-wrong' : ''}`}
          aria-disabled={done || undefined}
          aria-pressed={picked === i}
          onClick={() => {
            if (done) return;
            onPick(i);
          }}
        >
          {ja ? <Ja text={options[i]} /> : options[i]}
          {done ? <OptionMark right={i === answer} mine={i === picked} /> : null}
        </button>
      ))}
    </div>
  );
}

/** 課程裡的角色：女生（リン、鈴木さん、山田さん）、男生（田中さん、中村さん、高橋部長、マイク、森さん） */
const FEMALE = /女|リン|鈴木|山田/;
const MALE = /男|田中|中村|高橋|マイク|森/;

/** 對話裡的人用不同的音高念：男生低一點、女生高一點（「男の人」「女の人」和課程角色），其他的照出現順序輪流 */
export function talkPitch(lines: { who: string }[]): number[] {
  const order: string[] = [];
  return lines.map(({ who }) => {
    if (MALE.test(who)) return 0.8;
    if (FEMALE.test(who)) return 1.15;
    if (!order.includes(who)) order.push(who);
    return order.indexOf(who) % 2 ? 1.15 : 0.85;
  });
}

function TalkQ({ item, n, onAnswer }: { item: Extract<DrillItem, { kind: 'talk' }>; n: number; onAnswer: (ok: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const qid = useId();
  const done = picked !== null;
  const ok = picked === item.answer;
  const [order] = useState(() => optionOrder(item.options.length));
  const pitch = useMemo(() => talkPitch(item.lines), [item.lines]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopSpeaking();
    };
  }, []);
  const play = (rate?: number) => {
    stopSpeaking();
    const next = (i: number) => {
      if (!alive.current || i >= item.lines.length) return setPlaying(false);
      const ln = item.lines[i];
      // 被別的發音（另一題對話、單字…）取代時，按鈕回到「播放對話」
      const started = speak(ln.say ?? jaSpeech(ln.ja), { rate, pitch: pitch[i], onEnd: () => next(i + 1), onStop: () => alive.current && setPlaying(false) });
      if (!started) setPlaying(false);
    };
    setPlaying(true);
    next(0);
  };
  return (
    <div className="dq" role="group" aria-labelledby={qid} tabIndex={-1}>
      <div id={qid} className="dq-q">
        <span className="dq-n">第 {n} 題</span>
        <p className="dq-ask">
          <Rich text={item.q} />
        </p>
      </div>
      <div className="btn-row">
        <button type="button" className="btn btn-sm" onClick={() => (playing ? (stopSpeaking(), setPlaying(false)) : play())} aria-pressed={playing}>
          <Icon name={playing ? 'stop' : 'speaker'} size={17} /> {playing ? '停止' : '播放對話'}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => play(0.6)}>
          慢速
        </button>
      </div>
      <AnswerOptions options={item.options} ja={item.optionsJa} order={order} answer={item.answer} picked={picked} onPick={(i) => {
        setPicked(i);
        onAnswer(i === item.answer);
      }} />
      {done ? (
        <Verdict ok={ok}>
          <ul className="dq-talk">
            {item.lines.map((ln, i) => (
              <li key={i}>
                <Ja text={ln.who} className="dq-who" />
                <Ja text={ln.ja} />
              </li>
            ))}
          </ul>
          {!ok ? <AnswerLine options={item.options} ja={item.optionsJa} answer={item.answer} /> : null}
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

function OrderQ({ item, n, exam, onAnswer }: { item: Extract<DrillItem, { kind: 'order' }>; n: number; exam: boolean; onAnswer: (ok: boolean) => void }) {
  // 第一次畫出來時打亂一次，之後重畫都不變
  const [order] = useState(() => shuffled(item.tiles, Math.random, item.also));
  const [picked, setPicked] = useState<number[]>([]);
  const [checked, setChecked] = useState<boolean | null>(null);
  const qid = useId();
  const answer = item.tiles.join('');
  // 排對了顯示自己排的句子（可能是另一種也對的順序），排錯了顯示正確答案
  const mine = picked.map((i) => item.tiles[i]).join('');
  const full = checked ? mine : answer;
  const bank = order.filter((i) => !picked.includes(i));
  const lineRef = useRef<HTMLDivElement>(null);
  const bankRef = useRef<HTMLDivElement>(null);
  const checkRef = useRef<HTMLButtonElement>(null);
  const verdictRef = useRef<HTMLDivElement>(null);
  // 按下的詞、「檢查」「重排」「再排一次」都會從畫面上拿掉，焦點會掉到頁首：畫好以後移到接著要按的地方
  const focusNext = useRef<(() => HTMLElement | null | undefined) | null>(null);
  useEffect(() => {
    const target = focusNext.current?.();
    focusNext.current = null;
    target?.focus();
  });
  const tilesIn = (el: HTMLElement | null) => [...(el?.querySelectorAll<HTMLElement>('.tile') ?? [])];
  const firstInBank = () => tilesIn(bankRef.current)[0];
  /** 選了第 at 個詞：焦點到同一個位置的下一個詞（選的是最後一個就往前一個），都選完了到「檢查」 */
  const pick = (i: number, at: number) => {
    setPicked((p) => [...p, i]);
    focusNext.current = () => {
      const left = tilesIn(bankRef.current);
      return left.length ? left[Math.min(at, left.length - 1)] : checkRef.current;
    };
  };
  /** 拿掉排好的第 at 個詞：焦點留在排好的句子裡，全部拿掉了到第一個可以選的詞 */
  const unpick = (i: number, at: number) => {
    setPicked((p) => p.filter((x) => x !== i));
    focusNext.current = () => {
      const placed = tilesIn(lineRef.current);
      return placed.length ? placed[Math.min(at, placed.length - 1)] : firstInBank();
    };
  };
  const check = () => {
    const ok = orderCorrect(item.tiles, picked, item.also);
    setChecked(ok);
    onAnswer(ok);
    focusNext.current = () => verdictRef.current;
  };
  return (
    <div className="dq" role="group" aria-labelledby={qid} tabIndex={-1}>
      <div id={qid} className="dq-q">
        <span className="dq-n">第 {n} 題</span>
        <p className="dq-ask">排成句子：{item.zh}</p>
      </div>
      <div ref={lineRef} className="dq-line" role="group" aria-label="排好的句子">
        {picked.length ? (
          picked.map((i, k) => (
            <button
              key={`${i}-${k}`}
              type="button"
              className="tile is-placed"
              disabled={checked !== null}
              onClick={() => unpick(i, k)}
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
          <div ref={bankRef} className="dq-bank" role="group" aria-label="可以用的詞">
            {bank.map((i, at) => (
              <button key={i} type="button" className="tile" onClick={() => pick(i, at)}>
                <Ja text={item.tiles[i]} />
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button ref={checkRef} type="button" className="btn btn-sm btn-primary" disabled={picked.length !== item.tiles.length} onClick={check}>
              檢查
            </button>
            {picked.length ? (
              <button
                type="button"
                className="linkbtn"
                onClick={() => {
                  setPicked([]);
                  focusNext.current = firstInBank;
                }}
              >
                重排
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <Verdict ok={checked} focusRef={verdictRef}>
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
          {/* 模擬考只算第一次：判定區已經顯示答案，再排一次就不準了 */}
          {!checked && !exam ? (
            <button
              type="button"
              className="linkbtn"
              onClick={() => {
                setPicked([]);
                setChecked(null);
                focusNext.current = firstInBank;
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
  const [order] = useState(() => optionOrder(item.options.length));
  return (
    <div className="dq" role="group" aria-labelledby={qid} tabIndex={-1}>
      <div id={qid} className="dq-q">
        <span className="dq-n">第 {n} 題</span>
        <p className="dq-ask">{item.q ? <Rich text={item.q} /> : '聽聽看，選出意思'}</p>
      </div>
      <div className="btn-row">
        <button type="button" className="btn btn-sm" onClick={() => speak(say)}>
          <Icon name="speaker" size={17} /> 播放
        </button>
        <button type="button" className="btn btn-sm" onClick={() => speak(say, { rate: 0.6 })}>
          慢速
        </button>
      </div>
      <AnswerOptions options={item.options} ja={item.optionsJa} order={order} answer={item.answer} picked={picked} onPick={(i) => {
        setPicked(i);
        onAnswer(i === item.answer);
      }} />
      {done ? (
        <Verdict ok={ok}>
          <div className="dv-sent">
            <button type="button" className="iconbtn" aria-label="再播一次" onClick={() => speak(say)}>
              <Icon name="speaker" size={17} />
            </button>
            <Ja text={item.ja} />
          </div>
          {!ok ? <AnswerLine options={item.options} ja={item.optionsJa} answer={item.answer} /> : null}
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
