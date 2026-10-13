import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { vocabById } from '../data/vocab';
import { clearVocabMiss, kanaStore, logActivity, missStore, settingsStore, srsStore, writingStore } from '../state';
import { readJSON, useStore } from '../state/store';
import { vocabMistakes, weakKanaKeys, writingMistakes } from '../lib/mistakes';
import { romaji } from '../lib/romaji';
import { speak } from '../lib/speech';
import { POS_LABEL, VERB_GROUP_LABEL, speechText } from '../lib/vocab';
import { usePageTitle } from '../lib/title';
import { focusLost, revealAnswer } from '../lib/flashcard';
import { PracticeTabs } from '../components/PracticeTabs';
import { SpeakIcon } from '../components/Speak';
import { Icon } from '../components/Icon';

/** 單字清單先列這麼多，其他按「顯示全部」 */
const WORDS_SHOWN = 30;

export default function Mistakes() {
  usePageTitle('錯題本');
  const kana = useStore(kanaStore);
  const misses = useStore(missStore);
  const srs = useStore(srsStore);
  const writing = useStore(writingStore);
  const [drill, setDrill] = useState<string[] | null>(null);
  const [allWords, setAllWords] = useState(false);
  const drillBtn = useRef<HTMLButtonElement>(null);
  const vocabHeading = useRef<HTMLHeadingElement>(null);

  // 結束加強練習回到清單時，焦點放回「加強練習」（都練完了就放到單字的標題）
  const wasDrilling = useRef(false);
  useEffect(() => {
    if (wasDrilling.current && !drill && focusLost()) (drillBtn.current ?? vocabHeading.current)?.focus({ preventScroll: true });
    wasDrilling.current = !!drill;
  }, [drill]);

  const weak = weakKanaKeys(kana);
  const words = vocabMistakes(misses, srs.cards).filter((m) => vocabById(m.id));
  const write = writingMistakes(writing);

  return (
    <div className="wrap">
      <PracticeTabs />
      <header className="ph ph-tight">
        <h1>錯題本</h1>
        <p className="lede">
          答錯的假名、常忘的單字、寫錯的字都收在這裡，集中練。練熟了會自動拿掉：假名連對 3 次、單字按「記住了」、手寫再寫一次沒有錯。
        </p>
      </header>

      {drill ? (
        <VocabDrill ids={drill} onClose={() => setDrill(null)} />
      ) : (
        <>
          <section className="block" aria-labelledby="h-mk-kana">
            <div className="h2row">
              <h2 id="h-mk-kana">
                假名 <span className="pill">{weak.length}</span>
              </h2>
              {weak.length ? (
                <Link className="btn btn-primary" to="/practice?focus=weak">
                  只練這些字 <Icon name="arrow-right" size={17} />
                </Link>
              ) : null}
            </div>
            {weak.length ? (
              <div className="weak">
                {weak.map((k) => {
                  const ch = k.slice(2);
                  return (
                    <button key={k} type="button" className="wchip" onClick={() => speak(ch)}>
                      <span lang="ja">{ch}</span>
                      <small>錯 {kana[k].w}</small>
                      <span className="sr-only">次，點一下聽發音</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="muted">
                目前沒有答錯的假名。做<Link to="/practice">假名測驗</Link>時答錯的字會收到這裡。
              </p>
            )}
          </section>

          <section className="block" aria-labelledby="h-mk-vocab">
            <div className="h2row">
              <h2 id="h-mk-vocab" ref={vocabHeading} tabIndex={-1}>
                單字 <span className="pill">{words.length}</span>
              </h2>
              {words.length ? (
                <button type="button" className="btn btn-primary" ref={drillBtn} onClick={() => setDrill(words.map((w) => w.id))}>
                  加強練習 <Icon name="arrow-right" size={17} />
                </button>
              ) : null}
            </div>
            {words.length ? (
              <>
                <ul className="mk-words">
                  {(allWords ? words : words.slice(0, WORDS_SHOWN)).map((m) => {
                    const it = vocabById(m.id)!;
                    return (
                      <li key={m.id}>
                        <SpeakIcon text={speechText(it)} label={`念「${it.kana}」`} />
                        <div className="mk-body">
                          <p>
                            <span className="mk-w" lang="ja">
                              {it.kanji ?? it.kana}
                            </span>
                            {it.kanji ? (
                              <span className="mk-k" lang="ja">
                                {it.kana}
                              </span>
                            ) : null}
                          </p>
                          <p className="mk-zh">{it.zh}</p>
                        </div>
                        <span className="mk-n">忘了 {m.n} 次</span>
                      </li>
                    );
                  })}
                </ul>
                {!allWords && words.length > WORDS_SHOWN ? (
                  <button type="button" className="linkbtn" onClick={() => setAllWords(true)}>
                    顯示全部 {words.length} 個
                  </button>
                ) : null}
                <p className="small">加強練習只是多看幾次，不會改變單字卡的複習排程。</p>
              </>
            ) : (
              <p className="muted">
                目前沒有常忘的單字。<Link to="/vocab">複習單字卡</Link>時按「忘記了」的卡片會收到這裡。
              </p>
            )}
          </section>

          <section className="block" aria-labelledby="h-mk-write">
            <h2 id="h-mk-write">
              手寫 <span className="pill">{write.length}</span>
            </h2>
            {write.length ? (
              <div className="weak">
                {write.map((w) => (
                  <Link key={w.ch} className="wchip" to={`/writing?char=${encodeURIComponent(w.ch)}`}>
                    <span lang="ja">{w.ch}</span>
                    <small>錯 {w.strokes} 筆</small>
                    <span className="sr-only">，去重寫</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="muted">
                目前沒有寫錯的字。<Link to="/writing">手寫描字</Link>時寫錯的字會收到這裡。
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** 單字加強練習：看字回想意思，不改變複習排程；「記住了」從錯題本拿掉，「還是忘了」排到最後再考一次 */
function VocabDrill({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const settings = useStore(settingsStore);
  const [queue, setQueue] = useState(ids);
  const [flipped, setFlipped] = useState(false);
  const [turn, setTurn] = useState(0);
  const [tally, setTally] = useState({ known: 0, again: 0 });
  const id = queue[0];
  const item = id ? vocabById(id) : undefined;
  const actionsRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const meaningRef = useRef<HTMLParagraphElement>(null);
  const showRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);

  // 換卡（或同一張卡再出現）時翻回正面並念一次（和單字複習一樣看「自動發音」的設定）
  useEffect(() => {
    setFlipped(false);
    const it = id ? vocabById(id) : undefined;
    if (it && readJSON('nk.autoplay') !== false) speak(speechText(it));
  }, [id, turn]);

  // 開始練習時焦點放到「顯示答案」；翻面後把答案捲進畫面、焦點放到答案；練完放到「回錯題本」
  const shown = useRef<{ flipped: boolean; turn: number } | null>(null);
  useEffect(() => {
    const first = shown.current === null;
    if (!first && shown.current!.flipped === flipped && shown.current!.turn === turn) return;
    shown.current = { flipped, turn };
    if (flipped) {
      revealAnswer(meaningRef.current, actionsRef.current);
      if (focusLost()) backRef.current?.focus({ preventScroll: true });
    } else if (focusLost()) {
      (showRef.current ?? doneRef.current)?.focus({ preventScroll: true });
    }
  }, [flipped, turn]);

  const answer = useCallback(
    (ok: boolean) => {
      if (!id || !flipped) return;
      logActivity('review');
      if (ok) clearVocabMiss(id);
      setQueue((q) => (ok ? q.slice(1) : [...q.slice(1), id]));
      setTally((t) => (ok ? { ...t, known: t.known + 1 } : { ...t, again: t.again + 1 }));
      // 和換卡一起翻回正面，下一張的答案才不會先閃一下
      setFlipped(false);
      setTurn((n) => n + 1);
    },
    [id, flipped],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !item) return;
      const t = e.target instanceof Element ? e.target : null;
      if ((e.key === ' ' || e.key === 'Enter') && !flipped && !t?.closest('a, button, input, select, textarea')) {
        e.preventDefault();
        setFlipped(true);
      } else if (flipped && (e.key === '1' || e.key === '2')) {
        e.preventDefault();
        answer(e.key === '2');
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        speak(speechText(item));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, flipped, answer]);

  if (!item) {
    return (
      <div className="card review-done" role="status">
        <h2>這一輪都記住了</h2>
        <p>
          練了 {ids.length} 個單字{tally.again ? `（中間有 ${tally.again} 次還是忘了，又多看了幾遍）` : ''}，都按了「記住了」，已經從錯題本拿掉。之後複習時又忘記，會再收進來。
        </p>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" ref={doneRef} onClick={onClose}>
            回錯題本
          </button>
          <Link className="btn" to="/review/all">
            去複習到期的單字卡
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section className="card flash" aria-label="單字加強練習">
      <div className="flash-badges">
        <span className="pill pill-accent">加強練習</span>
        <span className="pill">還有 {queue.length} 張</span>
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
        <div className="flash-back" ref={backRef} tabIndex={-1}>
          <p className="f-zh" ref={meaningRef}>
            {item.zh}
          </p>
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
          <button type="button" className="btn btn-primary btn-wide" ref={showRef} onClick={() => setFlipped(true)}>
            顯示答案 <span className="kbd">空白鍵</span>
          </button>
        ) : (
          <div className="grades drill-grades" role="group" aria-label="記住了嗎">
            <button type="button" className="grade grade-again" onClick={() => answer(false)}>
              <span className="g-label">還是忘了</span>
              <span className="g-ivl">等一下再考一次</span>
              <span className="kbd" aria-hidden="true">
                1
              </span>
            </button>
            <button type="button" className="grade grade-good" onClick={() => answer(true)}>
              <span className="g-label">記住了</span>
              <span className="g-ivl">從錯題本拿掉</span>
              <span className="kbd" aria-hidden="true">
                2
              </span>
            </button>
          </div>
        )}
      </div>
      <div className="btn-row drill-foot">
        <button type="button" className="linkbtn" onClick={onClose}>
          結束練習
        </button>
        <span className="small">用鍵盤：空白鍵看答案，1 還是忘了，2 記住了，R 重聽</span>
      </div>
    </section>
  );
}
