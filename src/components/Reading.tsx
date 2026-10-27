/**
 * 會話、短文（課文和模擬考共用）：一句一句念、播放整段、顯示中文。
 * 從 CourseBlocks.tsx 分出來：模擬考只需要短文，不必連漢字區塊用的筆順、漢字資料一起下載。
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { DialogLine, ReadingLine } from '../data/types';
import { jaSpeech, type JaText } from '../lib/ja';
import { speak, stopSpeaking } from '../lib/speech';
import { Ja } from './Ja';
import { Rich } from './Rich';
import { Switch } from './Controls';
import { Icon } from './Icon';

/* ---------------- 會話 ---------------- */

/** 說話的人：名字是日文時用日文字型 */
function Who({ name }: { name: string }) {
  return /[ぁ-ヿ一-鿿]/u.test(name) ? <Ja text={name} className="dlg-who" /> : <span className="dlg-who">{name}</span>;
}

/** 一句一句念（會話、短文共用）：點一句念那一句，「播放整段」從頭念到尾 */
function useLinePlayer(lines: { ja: JaText; say?: string }[]) {
  /** 正在念第幾句（整段播放時）；null 是沒在播 */
  const [playing, setPlaying] = useState<number | null>(null);
  const [flashAt, setFlashAt] = useState<number | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // 離開頁面時停止念
  useEffect(() => () => stopSpeaking(), []);

  const say = (l: { ja: JaText; say?: string }) => l.say ?? jaSpeech(l.ja);

  const playFrom = (i: number) => {
    if (!alive.current) return;
    if (i >= lines.length) {
      setPlaying(null);
      return;
    }
    setPlaying(i);
    // 被別的發音（單字、例句、別的會話）取代時，按鈕和反白的句子跟著停
    const ok = speak(say(lines[i]), { onEnd: () => playFrom(i + 1), onStop: () => alive.current && setPlaying(null) });
    if (!ok) setPlaying(null);
  };

  const toggleAll = () => {
    if (playing !== null) {
      stopSpeaking();
      setPlaying(null);
    } else playFrom(0);
  };

  const playOne = (i: number) => {
    setPlaying(null);
    speak(say(lines[i]));
    setFlashAt(i);
    window.setTimeout(() => alive.current && setFlashAt((x) => (x === i ? null : x)), 650);
  };

  const isOn = (i: number) => playing === i || flashAt === i;
  return { playing, toggleAll, playOne, isOn };
}

function PlayAllTools({ playing, toggleAll, label, showZh, setShowZh }: { playing: number | null; toggleAll: () => void; label: string; showZh: boolean; setShowZh: (v: boolean) => void }) {
  const zhId = useId();
  return (
    <div className="dlg-tools">
      <button type="button" className={`btn btn-sm${playing !== null ? ' is-on' : ''}`} onClick={toggleAll} aria-pressed={playing !== null}>
        <Icon name={playing !== null ? 'stop' : 'play'} size={16} />
        {playing !== null ? '停止播放' : label}
      </button>
      <Switch id={zhId} checked={showZh} onChange={setShowZh}>
        顯示中文
      </Switch>
    </div>
  );
}

export function DialogBlock({ title, scene, lines }: { title?: string; scene?: string; lines: DialogLine[] }) {
  const [showZh, setShowZh] = useState(true);
  const { playing, toggleAll, playOne, isOn } = useLinePlayer(lines);

  return (
    <div className="dialog card">
      {title ? <h3 className="rowtitle">{title}</h3> : null}
      {scene ? (
        <p className="dlg-scene">
          <Rich text={scene} />
        </p>
      ) : null}
      <PlayAllTools playing={playing} toggleAll={toggleAll} label="播放整段會話" showZh={showZh} setShowZh={setShowZh} />
      <ol className="dlg-lines">
        {lines.map((l, i) => (
          <li key={i} className={`dlg-line${isOn(i) ? ' is-playing' : ''}`}>
            <Who name={l.who} />
            <div className="dlg-body">
              <button type="button" className="dlg-ja" onClick={() => playOne(i)}>
                <span className="sr-only">播放：</span>
                <Ja text={l.ja} />
              </button>
              {showZh ? <p className="dlg-zh">{l.zh}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------------- 短文 ---------------- */

/**
 * 告示、Email、傳單：像一張紙。中文翻譯預設收起來（先自己讀，看不懂再打開）。
 * exam：模擬考的讀解還沒答完時不能看中文、不能聽（點段落也不念），答完才出現。
 */
export function ReadingBlock({ title, scene, lines, exam = false }: { title?: string; scene?: string; lines: ReadingLine[]; exam?: boolean }) {
  const [showZh, setShowZh] = useState(false);
  const { playing, toggleAll, playOne, isOn } = useLinePlayer(lines);
  return (
    <div className="dialog reading card">
      {title ? <h3 className="rowtitle">{title}</h3> : null}
      {scene ? (
        <p className="dlg-scene">
          <Rich text={scene} />
        </p>
      ) : null}
      {exam ? <p className="small">先讀文章、回答下面的題目；全部答完才可以看中文、聽全文。</p> : <PlayAllTools playing={playing} toggleAll={toggleAll} label="播放全文" showZh={showZh} setShowZh={setShowZh} />}
      <div className="rd-sheet">
        {lines.map((l, i) => (
          <div key={i} className={`rd-line${isOn(i) ? ' is-playing' : ''}`}>
            {exam ? (
              <Ja text={l.ja} className="dlg-ja rd-ja" as="p" />
            ) : (
              <button type="button" className="dlg-ja rd-ja" onClick={() => playOne(i)}>
                <span className="sr-only">播放：</span>
                <Ja text={l.ja} />
              </button>
            )}
            {showZh && !exam ? <p className="dlg-zh">{l.zh}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
