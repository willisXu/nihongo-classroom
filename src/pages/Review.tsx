import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { vocabById } from '../data/vocab';
import { lessonStore, recordVocabMiss, saveCard, settingsStore, srsStore, updateSettings } from '../state';
import { courseWords } from '../lib/progress';
import { useStore } from '../state/store';
import {
  LEARN_AHEAD_MS, buildSession, formatMinutes, limitFresh, newCard, pickNext, previewLabel, review, GRADES, type CardState, type Grade, type Pending,
} from '../lib/srs';
import { studyDayKey, studyDayStart, addDays } from '../lib/date';
import { speak } from '../lib/speech';
import { deckAllLearned, deckItemIds, deckTitle, romajiOf, speechText } from '../lib/vocab';
import { SpeakIcon } from '../components/Speak';
import { CardBack } from '../components/CardBack';
import { Switch } from '../components/Controls';
import { Icon } from '../components/Icon';
import { usePageTitle } from '../lib/title';
import { focusLost, revealAnswer } from '../lib/flashcard';

const GRADE_LABEL: Record<Grade, string> = { again: '忘記了', hard: '有點難', good: '記得', easy: '很簡單' };

/** 今天還能學幾張新卡 */
function newLimitNow(now: number): number {
  const freshToday = srsStore.get().days[studyDayKey(now)]?.fresh ?? 0;
  return Math.max(0, settingsStore.get().newPerDay - freshToday);
}

/** 牌組改變或按「繼續複習」時整個重新開始一輪 */
export default function ReviewRoute() {
  const { deck = 'all' } = useParams();
  const [round, setRound] = useState(0);
  usePageTitle(`單字複習：${deckTitle(deck)}`);
  return <Review key={`${deck}:${round}`} deck={deck} restarted={round > 0} onRestart={() => setRound((r) => r + 1)} />;
}

/**
 * 這一輪開始之後，另一個分頁（或另一個開著的複習頁）已經複習過這張卡：不要再出。
 * 不然同一張卡會被評兩次，間隔被拉得太長，「複習時記得」也重複算。
 * - 主要的卡（到期的複習卡、新卡）：最後複習時間和這一輪開始時不一樣
 * - 學習中的卡：到期時間和排進這一輪時不一樣
 */
function mainTaken(id: string, base: Map<string, number>, cards: Record<string, CardState | undefined>): boolean {
  return (cards[id]?.last ?? 0) !== (base.get(id) ?? 0);
}
function learningTaken(p: Pending, cards: Record<string, CardState | undefined>): boolean {
  return cards[p.id]?.due !== p.due;
}

/** 互動元件上的按鍵交給元件自己處理 */
function isInteractive(t: EventTarget | null): boolean {
  return t instanceof Element && !!t.closest('a, button, input, select, textarea, label, [contenteditable="true"]');
}
function isTextEntry(t: EventTarget | null): boolean {
  return t instanceof Element && !!t.closest('textarea, select, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"])');
}

function Review({ deck, restarted, onRestart }: { deck: string; restarted: boolean; onRestart: () => void }) {
  const settings = useStore(settingsStore);
  // 其他分頁改了單字卡紀錄也會更新（見下面「另一個分頁已經複習過」）
  const srs = useStore(srsStore);
  // 開場時決定牌組內容（全部牌組要看哪些重複的字已經學過）
  // 新卡先出課程教過的字（N5 課程上到哪裡，單字卡就先教那幾課的字）
  const ids = useMemo(() => deckItemIds(deck, srsStore.get().cards, courseWords(lessonStore.get())), [deck]);
  const autoplay = settings.autoplay;

  // 開場時決定這一輪的卡片（之後才到期的卡片，在結束畫面按「繼續複習」開下一輪）
  const [session] = useState(() => {
    const now = Date.now();
    const cards = srsStore.get().cards;
    const s = buildSession(cards, ids, now, newLimitNow(now));
    // 每張主要的卡在這一輪開始時的最後複習時間
    return { ...s, base: new Map(s.main.map((id) => [id, cards[id]?.last ?? 0])) };
  });
  const [main, setMain] = useState<string[]>(session.main);
  const [learning, setLearning] = useState<Pending[]>(session.learning);
  const [currentId, setCurrentId] = useState<string | null>(session.first);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState({ cards: new Set<string>(), total: 0, again: 0 });
  const [now, setNow] = useState(Date.now());
  const [turn, setTurn] = useState(0);
  const actionsRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const meaningRef = useRef<HTMLParagraphElement>(null);
  const showRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  const item = currentId ? vocabById(currentId) : undefined;
  const card: CardState | undefined = currentId ? srs.cards[currentId] : undefined;
  const isNew = !card || card.reps === 0;
  const early = !!card && card.reps > 0 && card.due > now;

  // 換卡（或同一張卡再出現）時翻回正面，並自動念一次。
  // 分頁看得到才念：在另一個分頁複習時，這一頁在背景跟著換卡（見下面），不要也跟著出聲
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;
  useEffect(() => {
    setFlipped(false);
    setNow(Date.now());
    const it = currentId ? vocabById(currentId) : undefined;
    if (it && autoplayRef.current && document.visibilityState === 'visible') speak(speechText(it));
  }, [currentId, turn]);

  // 翻面後把答案捲進畫面（手機上不能被固定在下方的評分按鈕蓋住）。
  // 剛按的按鈕消失時，焦點放到答案（螢幕閱讀器會念出來）；評分後放回下一張的「顯示答案」，結束時放到結束畫面的標題
  const shown = useRef({ flipped, currentId });
  useEffect(() => {
    // 第一次顯示（剛進頁面）不動焦點；按「繼續複習」重新開始的話，那顆按鈕已經不見了，焦點放到「顯示答案」
    if (shown.current.flipped === flipped && shown.current.currentId === currentId) {
      if (restarted && focusLost()) (showRef.current ?? doneRef.current)?.focus({ preventScroll: true });
      return;
    }
    shown.current = { flipped, currentId };
    if (flipped) {
      revealAnswer(meaningRef.current, actionsRef.current);
      if (focusLost()) backRef.current?.focus({ preventScroll: true });
    } else if (focusLost()) {
      (showRef.current ?? doneRef.current)?.focus({ preventScroll: true });
    }
  }, [flipped, currentId, restarted]);

  // 另一個分頁已經複習過的卡片從這一輪拿掉；正在看的這張也是的話，直接換下一張。
  // 另一個分頁也在學新卡、今天的額度用完了：還沒開始的新卡也拿掉（正在看的那張留著）
  useEffect(() => {
    const m = limitFresh(
      main.filter((id) => !mainTaken(id, session.base, srs.cards)),
      srs.cards,
      newLimitNow(Date.now()),
      currentId,
    );
    const l = learning.filter((p) => !learningTaken(p, srs.cards));
    if (m.length === main.length && l.length === learning.length) return;
    setMain(m);
    setLearning(l);
    if (currentId && !m.includes(currentId) && !l.some((p) => p.id === currentId)) {
      setFlipped(false);
      setCurrentId(pickNext(m, l, Date.now()));
      setTurn((n) => n + 1);
    }
  }, [srs, main, learning, currentId, session.base]);

  const grade = useCallback(
    (g: Grade) => {
      if (!currentId || !flipped) return;
      const t = Date.now();
      const cardsNow = srsStore.get().cards;
      const pending = learning.find((p) => p.id === currentId);
      // 剛好在另一個分頁評過分（上面的整理還沒輪到）：這次不算，換下一張
      if (pending ? learningTaken(pending, cardsNow) : mainTaken(currentId, session.base, cardsNow)) {
        const m = limitFresh(main.filter((x) => x !== currentId), cardsNow, newLimitNow(t));
        const l = learning.filter((p) => p.id !== currentId);
        setMain(m);
        setLearning(l);
        setFlipped(false);
        setCurrentId(pickNext(m, l, t));
        setTurn((n) => n + 1);
        return;
      }
      const before = cardsNow[currentId] ?? newCard(t);
      const wasNew = before.reps === 0;
      const after = review(before, g, t, currentId);
      saveCard(currentId, after, wasNew, { due: before.reps > 0 && before.step === -1, forgot: g === 'again' });
      // 按「忘記了」的卡片收進錯題本
      if (g === 'again') recordVocabMiss(currentId);
      // 換下一張前再看一次今天的新卡額度（另一個分頁可能也學了新卡）
      const m = limitFresh(main.filter((x) => x !== currentId), srsStore.get().cards, newLimitNow(t));
      let l = learning.filter((p) => p.id !== currentId);
      if (after.step >= 0 && after.due <= t + LEARN_AHEAD_MS) l = [...l, { id: currentId, due: after.due }];
      setMain(m);
      setLearning(l);
      // 和換卡一起翻回正面，下一張的答案才不會先閃一下
      setFlipped(false);
      setDone((d) => ({ cards: new Set(d.cards).add(currentId), total: d.total + 1, again: d.again + (g === 'again' ? 1 : 0) }));
      setCurrentId(pickNext(m, l, t));
      setTurn((n) => n + 1);
    },
    [currentId, flipped, main, learning, session.base],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !item) return;
      if (e.key === ' ' || e.key === 'Enter') {
        if (isInteractive(e.target) || flipped) return;
        e.preventDefault();
        setFlipped(true);
        return;
      }
      if (isTextEntry(e.target)) return;
      if (flipped && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        grade(GRADES[Number(e.key) - 1]);
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        speak(speechText(item));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, flipped, grade]);

  const cards = srs.cards;
  const newLeft = main.filter((id) => !cards[id] || cards[id].reps === 0).length;
  const reviewLeft = main.length - newLeft;

  // 結束畫面每 30 秒（和切回這個分頁時）重新檢查一次：又有卡片到期就可以接著複習
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (item) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') setTick((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [item]);

  // 現在再開一輪會有幾張卡片（這一輪開始之後才到期的、學習中的）
  const readyNow = useMemo(() => {
    if (item) return 0;
    const t = Date.now();
    const s = buildSession(srsStore.get().cards, ids, t, newLimitNow(t));
    return s.main.length + s.learning.length;
  }, [item, ids, cards, tick]); // tick：定時重新計算

  // 今天稍晚才會到期的學習中卡片
  const laterToday = useMemo(() => {
    if (item) return null;
    const t = Date.now();
    const end = addDays(studyDayStart(t), 1);
    const due = ids
      .map((id) => cards[id])
      .filter((c): c is CardState => !!c && c.reps > 0 && c.step >= 0 && c.due > t + LEARN_AHEAD_MS && c.due < end)
      .map((c) => c.due)
      .sort((a, b) => a - b);
    return due.length ? { n: due.length, wait: due[0] - t } : null;
  }, [item, ids, cards, tick]);

  // 這組的字都學過了（沒有新卡了）：結束畫面不說「今天的新卡學完了、明天再來」
  const allLearned = useMemo(() => !item && deckAllLearned(deck, cards), [item, deck, cards]);

  return (
    <div className="wrap review-wrap">
      <header className="ph ph-tight">
        <p className="eyebrow">
          <Link to="/vocab">單字牌組</Link> · {deckTitle(deck)}
        </p>
        <div className="review-head">
          <h1>單字複習</h1>
          <p className="review-counts" aria-label={`新卡 ${newLeft}、學習中 ${learning.length}、複習 ${reviewLeft}`}>
            <span className="c-new">新 {newLeft}</span>
            <span className="c-learn">學習中 {learning.length}</span>
            <span className="c-rev">複習 {reviewLeft}</span>
          </p>
        </div>
        <div className="toolbar">
          <Switch
            id="rv-auto"
            checked={autoplay}
            onChange={(v) => updateSettings({ autoplay: v })}
          >
            自動發音
          </Switch>
          <Switch id="rv-romaji" checked={settings.showRomaji} onChange={(v) => updateSettings({ showRomaji: v })}>
            羅馬拼音
          </Switch>
        </div>
      </header>

      {!item ? (
        <div className="card review-done">
          {done.total ? (
            <>
              <h2 ref={doneRef} tabIndex={-1}>
                這一輪完成了
              </h2>
              <p>
                複習了 {done.cards.size} 張卡片、作答 {done.total} 次，其中 {done.total - done.again} 次記得（
                {Math.round(((done.total - done.again) / done.total) * 100)}%）。
              </p>
              {allLearned && !laterToday && !readyNow ? <p>這組的字都學過了，卡片到期時會再出現在這裡。</p> : null}
            </>
          ) : (
            <>
              <h2>{readyNow ? '又有卡片可以複習了' : allLearned ? '這組的字都學過了' : '現在沒有要複習的卡片'}</h2>
              {!laterToday && !readyNow ? (
                <p>
                  {allLearned
                    ? '沒有新卡了，到期的卡片也都複習過了。卡片到期時會再出現在這裡。'
                    : settingsStore.get().newPerDay === 0
                      ? '每天新卡設定為 0 張，到單字牌組頁調整後就能學新卡。'
                      : '今天的新卡已經學完，到期的卡片也都複習過了。明天再來。'}
                </p>
              ) : null}
            </>
          )}
          {/* 可能是剛到期的卡、學習中的卡，或過了凌晨 4 點的新卡：不指定是哪一種 */}
          {readyNow ? <p>還有 {readyNow} 張卡片現在就可以複習。</p> : null}
          {laterToday ? (
            <p className="small">
              還有 {laterToday.n} 張學習中的卡片，約 {formatMinutes(laterToday.wait)}後到期；這一頁開著的話，到期時會出現「繼續複習」。
            </p>
          ) : null}
          <div className="btn-row">
            {readyNow ? (
              <button type="button" className="btn btn-primary" onClick={onRestart}>
                繼續複習 <Icon name="arrow-right" size={17} />
              </button>
            ) : null}
            <Link className={`btn ${readyNow ? '' : 'btn-primary'}`} to="/vocab">
              回單字牌組
            </Link>
            <Link className="btn" to="/tutor">
              去和 AI 家教練會話
            </Link>
          </div>
        </div>
      ) : (
        <div className="card flash">
          <div className="flash-badges">
            {isNew ? <span className="pill pill-accent">新卡</span> : card && card.step >= 0 ? <span className="pill">學習中</span> : <span className="pill">複習</span>}
            {early ? <span className="pill">提早複習</span> : null}
            {item.topic ? <span className="pill">{item.topic}</span> : null}
          </div>
          <div className="flash-front">
            <p className="f-main" lang="ja">
              {item.kanji ?? item.kana}
            </p>
            {item.kanji ? (
              <p className="f-kana" lang="ja">
                {item.kana}
              </p>
            ) : null}
            {settings.showRomaji ? <p className="f-r">{romajiOf(item)}</p> : null}
            <SpeakIcon text={speechText(item)} label="再聽一次" />
          </div>
          {flipped ? (
            <CardBack item={item} backRef={backRef} meaningRef={meaningRef} />
          ) : null}
          <div className="flash-actions" ref={actionsRef}>
            {!flipped ? (
              <button type="button" className="btn btn-primary btn-wide" ref={showRef} onClick={() => setFlipped(true)}>
                顯示答案 <span className="kbd">空白鍵</span>
              </button>
            ) : (
              <div className="grades" role="group" aria-label="記得多少">
                {GRADES.map((g, i) => (
                  <button key={g} type="button" className={`grade grade-${g}`} onClick={() => grade(g)}>
                    <span className="g-label">{GRADE_LABEL[g]}</span>
                    <span className="g-ivl">{previewLabel(card ?? newCard(now), g, now, currentId ?? undefined)}</span>
                    <span className="kbd" aria-hidden="true">
                      {i + 1}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <p className="kbd-hint">
        用鍵盤：空白鍵看答案，1–4 選記得的程度，R 重聽 · <Icon name="refresh" size={14} /> 卡片間隔會依你的回答自動調整
      </p>
    </div>
  );
}
