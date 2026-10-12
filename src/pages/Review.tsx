import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { vocabById } from '../data/vocab';
import { saveCard, settingsStore, srsStore, updateSettings } from '../state';
import { useStore, readJSON, writeJSON } from '../state/store';
import { buildQueue, newCard, previewLabel, review, GRADES, type Grade, type CardState } from '../lib/srs';
import { studyDayKey } from '../lib/date';
import { romaji } from '../lib/romaji';
import { speak } from '../lib/speech';
import { POS_LABEL, VERB_GROUP_LABEL, deckItemIds, deckTitle } from '../lib/vocab';
import { SpeakIcon } from '../components/Speak';
import { Switch } from '../components/Controls';
import { Icon } from '../components/Icon';

const GRADE_LABEL: Record<Grade, string> = { again: '忘記了', hard: '有點難', good: '記得', easy: '很簡單' };
/** 學習中的卡片若在這段時間內到期，就留在這一輪 */
const LEARN_AHEAD_MS = 20 * 60_000;

interface Pending {
  id: string;
  due: number;
}

export default function Review() {
  const { deck = 'all' } = useParams();
  const settings = useStore(settingsStore);
  const ids = useMemo(() => deckItemIds(deck), [deck]);
  const [autoplay, setAutoplay] = useState<boolean>(() => readJSON('nk.autoplay') !== false);

  // 開場時決定這一輪的卡片（之後新增的到期卡片下一輪再出現）
  const [session] = useState(() => {
    const now = Date.now();
    const srs = srsStore.get();
    const freshToday = srs.days[studyDayKey(now)]?.fresh ?? 0;
    const newLimit = Math.max(0, settingsStore.get().newPerDay - freshToday);
    const q = buildQueue(srs.cards, ids, now, newLimit);
    return { main: [...q.review, ...q.fresh], learning: q.learning.map((id) => ({ id, due: srs.cards[id]?.due ?? now })) };
  });
  const [main, setMain] = useState<string[]>(session.main);
  const [learning, setLearning] = useState<Pending[]>(session.learning);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState({ total: 0, again: 0 });
  const [now, setNow] = useState(Date.now());
  const [turn, setTurn] = useState(0);

  const pickNext = useCallback((m: string[], l: Pending[]): string | null => {
    const t = Date.now();
    const dueL = l.filter((p) => p.due <= t).sort((a, b) => a.due - b.due)[0];
    if (dueL) return dueL.id;
    if (m.length) return m[0];
    const ahead = l.filter((p) => p.due <= t + LEARN_AHEAD_MS).sort((a, b) => a.due - b.due)[0];
    return ahead?.id ?? null;
  }, []);

  useEffect(() => {
    setCurrentId(pickNext(session.main, session.learning));
  }, [pickNext, session]);

  const item = currentId ? vocabById(currentId) : undefined;
  const card: CardState | undefined = currentId ? srsStore.get().cards[currentId] : undefined;
  const isNew = !card || card.reps === 0;

  // 換卡（或同一張卡再出現）時翻回正面，並自動念一次
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;
  useEffect(() => {
    setFlipped(false);
    setNow(Date.now());
    const it = currentId ? vocabById(currentId) : undefined;
    if (it && autoplayRef.current) speak(it.kanji ?? it.kana);
  }, [currentId, turn]);

  const grade = useCallback(
    (g: Grade) => {
      if (!currentId || !flipped) return;
      const t = Date.now();
      const before = srsStore.get().cards[currentId] ?? newCard(t);
      const wasNew = before.reps === 0;
      const after = review(before, g, t);
      saveCard(currentId, after, wasNew);
      const m = main.filter((x) => x !== currentId);
      let l = learning.filter((p) => p.id !== currentId);
      if (after.step >= 0 && after.due <= t + LEARN_AHEAD_MS) l = [...l, { id: currentId, due: after.due }];
      setMain(m);
      setLearning(l);
      setDone((d) => ({ total: d.total + 1, again: d.again + (g === 'again' ? 1 : 0) }));
      setCurrentId(pickNext(m, l));
      setTurn((n) => n + 1);
    },
    [currentId, flipped, main, learning, pickNext],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (!item) return;
      if ((e.key === ' ' || e.key === 'Enter') && !flipped) {
        e.preventDefault();
        setFlipped(true);
      } else if (flipped && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        grade(GRADES[Number(e.key) - 1]);
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        speak(item.kanji ?? item.kana);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, flipped, grade]);

  const newLeft = main.filter((id) => !srsStore.get().cards[id] || srsStore.get().cards[id].reps === 0).length;
  const reviewLeft = main.length - newLeft;

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
                複習了 {done.total} 張，其中 {done.total - done.again} 次記得（{Math.round(((done.total - done.again) / done.total) * 100)}%）。
              </p>
              {learning.length ? <p className="small">還有 {learning.length} 張學習中的卡片，幾分鐘後會到期，可以等一下再回來。</p> : null}
            </>
          ) : (
            <>
              <h2>現在沒有要複習的卡片</h2>
              <p>
                {settingsStore.get().newPerDay === 0
                  ? '每天新卡設定為 0 張，到牌組頁調整後就能學新卡。'
                  : '今天的新卡已經學完，到期的卡片也都複習過了。明天再來。'}
              </p>
            </>
          )}
          <div className="btn-row">
            <Link className="btn btn-primary" to="/vocab">
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
            <SpeakIcon text={item.kanji ?? item.kana} label="再聽一次" />
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
          <div className="flash-actions">
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
