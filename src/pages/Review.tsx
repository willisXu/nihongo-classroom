import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { vocabById } from '../data/vocab';
import { recordVocabMiss, saveCard, settingsStore, srsStore, updateSettings } from '../state';
import { useStore, readJSON, writeJSON } from '../state/store';
import {
  LEARN_AHEAD_MS, buildSession, formatMinutes, newCard, pickNext, previewLabel, review, GRADES, type CardState, type Grade, type Pending,
} from '../lib/srs';
import { studyDayKey, studyDayStart, addDays } from '../lib/date';
import { romaji } from '../lib/romaji';
import { speak } from '../lib/speech';
import { POS_LABEL, VERB_GROUP_LABEL, deckItemIds, deckTitle, speechText } from '../lib/vocab';
import { SpeakIcon } from '../components/Speak';
import { Switch } from '../components/Controls';
import { Icon } from '../components/Icon';
import { usePageTitle } from '../lib/title';

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
  return <Review key={`${deck}:${round}`} deck={deck} onRestart={() => setRound((r) => r + 1)} />;
}

/** 互動元件上的按鍵交給元件自己處理 */
function isInteractive(t: EventTarget | null): boolean {
  return t instanceof Element && !!t.closest('a, button, input, select, textarea, label, [contenteditable="true"]');
}
function isTextEntry(t: EventTarget | null): boolean {
  return t instanceof Element && !!t.closest('textarea, select, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"])');
}

function Review({ deck, onRestart }: { deck: string; onRestart: () => void }) {
  const settings = useStore(settingsStore);
  // 開場時決定牌組內容（全部牌組要看哪些重複的字已經學過）
  const ids = useMemo(() => deckItemIds(deck, srsStore.get().cards), [deck]);
  const [autoplay, setAutoplay] = useState<boolean>(() => readJSON('nk.autoplay') !== false);

  // 開場時決定這一輪的卡片（之後才到期的卡片，在結束畫面按「繼續複習」開下一輪）
  const [session] = useState(() => {
    const now = Date.now();
    return buildSession(srsStore.get().cards, ids, now, newLimitNow(now));
  });
  const [main, setMain] = useState<string[]>(session.main);
  const [learning, setLearning] = useState<Pending[]>(session.learning);
  const [currentId, setCurrentId] = useState<string | null>(session.first);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState({ cards: new Set<string>(), total: 0, again: 0 });
  const [now, setNow] = useState(Date.now());
  const [turn, setTurn] = useState(0);
  const actionsRef = useRef<HTMLDivElement>(null);

  const item = currentId ? vocabById(currentId) : undefined;
  const card: CardState | undefined = currentId ? srsStore.get().cards[currentId] : undefined;
  const isNew = !card || card.reps === 0;
  const early = !!card && card.reps > 0 && card.due > now;

  // 換卡（或同一張卡再出現）時翻回正面，並自動念一次
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;
  useEffect(() => {
    setFlipped(false);
    setNow(Date.now());
    const it = currentId ? vocabById(currentId) : undefined;
    if (it && autoplayRef.current) speak(speechText(it));
  }, [currentId, turn]);

  // 手機上翻面後，把評分按鈕捲進畫面
  useEffect(() => {
    if (flipped) actionsRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [flipped]);

  const grade = useCallback(
    (g: Grade) => {
      if (!currentId || !flipped) return;
      const t = Date.now();
      const before = srsStore.get().cards[currentId] ?? newCard(t);
      const wasNew = before.reps === 0;
      const after = review(before, g, t);
      saveCard(currentId, after, wasNew, { due: before.reps > 0 && before.step === -1, forgot: g === 'again' });
      // 按「忘記了」的卡片收進錯題本
      if (g === 'again') recordVocabMiss(currentId);
      const m = main.filter((x) => x !== currentId);
      let l = learning.filter((p) => p.id !== currentId);
      if (after.step >= 0 && after.due <= t + LEARN_AHEAD_MS) l = [...l, { id: currentId, due: after.due }];
      setMain(m);
      setLearning(l);
      setDone((d) => ({ cards: new Set(d.cards).add(currentId), total: d.total + 1, again: d.again + (g === 'again' ? 1 : 0) }));
      setCurrentId(pickNext(m, l, t));
      setTurn((n) => n + 1);
    },
    [currentId, flipped, main, learning],
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

  const cards = srsStore.get().cards;
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
            onChange={(v) => {
              setAutoplay(v);
              writeJSON('nk.autoplay', v);
            }}
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
              <h2>這一輪完成了</h2>
              <p>
                複習了 {done.cards.size} 張卡片、作答 {done.total} 次，其中 {done.total - done.again} 次記得（
                {Math.round(((done.total - done.again) / done.total) * 100)}%）。
              </p>
            </>
          ) : (
            <>
              <h2>{readyNow ? '又有卡片可以複習了' : '現在沒有要複習的卡片'}</h2>
              {!laterToday && !readyNow ? (
                <p>
                  {settingsStore.get().newPerDay === 0
                    ? '每天新卡設定為 0 張，到單字牌組頁調整後就能學新卡。'
                    : '今天的新卡已經學完，到期的卡片也都複習過了。明天再來。'}
                </p>
              ) : null}
            </>
          )}
          {readyNow ? <p>還有 {readyNow} 張卡片現在就可以複習（剛到期或快到期的學習中卡片）。</p> : null}
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
            {settings.showRomaji ? <p className="f-r">{romaji(item.kana)}</p> : null}
            <SpeakIcon text={speechText(item)} label="再聽一次" />
          </div>
          {flipped ? (
            <div className="flash-back">
              <p className="f-zh">{item.zh}</p>
              <p className="f-pos">
                {POS_LABEL[item.pos]}
                {item.verbGroup ? ` · ${VERB_GROUP_LABEL[item.verbGroup]}` : ''}
              </p>
              {item.ex ? (
                <div className="v-ex">
                  <SpeakIcon text={item.ex.ja} label="播放例句" />
                  <div>
                    <p lang="ja" className="v-ex-ja">
                      {item.ex.ja}
                    </p>
                    <p lang="ja" className="v-ex-kana">
                      {item.ex.kana}
                    </p>
                    <p className="v-ex-zh">{item.ex.zh}</p>
                  </div>
                </div>
              ) : null}
              {item.note ? <p className="v-note">{item.note}</p> : null}
            </div>
          ) : null}
          <div className="flash-actions" ref={actionsRef}>
            {!flipped ? (
              <button type="button" className="btn btn-primary btn-wide" onClick={() => setFlipped(true)}>
                顯示答案 <span className="kbd">空白鍵</span>
              </button>
            ) : (
              <div className="grades" role="group" aria-label="記得多少">
                {GRADES.map((g, i) => (
                  <button key={g} type="button" className={`grade grade-${g}`} onClick={() => grade(g)}>
                    <span className="g-label">{GRADE_LABEL[g]}</span>
                    <span className="g-ivl">{previewLabel(card ?? newCard(now), g, now)}</span>
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
