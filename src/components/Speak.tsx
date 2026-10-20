import { useCallback, useRef, useState, type ReactNode } from 'react';
import { speak } from '../lib/speech';
import { Icon } from './Icon';
import { JaParts } from './Ja';

/** 點了會亮一下，提示「正在念」 */
export function usePlayFlash(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const flash = useCallback(() => {
    setOn(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOn(false), 650);
  }, []);
  return [on, flash];
}

/** 帶喇叭圖示的發音按鈕 */
export function SpeakButton({ text, children = '播放', className = '' }: { text: string; children?: ReactNode; className?: string }) {
  const [on, flash] = usePlayFlash();
  return (
    <button
      type="button"
      className={`playbtn ${on ? 'is-playing' : ''} ${className}`}
      onClick={() => {
        speak(text);
        flash();
      }}
    >
      <Icon name="speaker" size={17} />
      {children}
    </button>
  );
}

/** 只有圖示的小發音鍵 */
export function SpeakIcon({ text, label }: { text: string; label?: string }) {
  const [on, flash] = usePlayFlash();
  return (
    <button
      type="button"
      className={`iconbtn ${on ? 'is-playing' : ''}`}
      aria-label={label ?? `播放 ${text}`}
      onClick={(e) => {
        e.stopPropagation();
        speak(text);
        flash();
      }}
    >
      <Icon name="speaker" size={17} />
    </button>
  );
}

/** 句子裡可以點來發音的日文（text 可以用《》標讀音） */
export function SayInline({ text, say }: { text: string; say?: string }) {
  const [on, flash] = usePlayFlash();
  return (
    <button
      type="button"
      className={`say-inline ${on ? 'is-playing' : ''}`}
      lang="ja"
      onClick={() => {
        speak(say ?? text);
        flash();
      }}
    >
      <JaParts text={text} />
    </button>
  );
}
