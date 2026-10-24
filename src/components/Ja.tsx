import { Fragment } from 'react';
import { parseJa, type JaText } from '../lib/ja';

/**
 * 顯示日文句子（JaText）：《》裡的讀音顯示成振假名，〔〕是句型的空格。
 * 振假名可以整頁隱藏（.furi-off，見 app.css），隱藏時仍佔位置，切換時版面不跳動。
 */
export function Ja({ text, className, as: Tag = 'span' }: { text: JaText; className?: string; as?: 'span' | 'p' }) {
  return (
    <Tag lang="ja" className={className}>
      <JaParts text={text} />
    </Tag>
  );
}

/** 只有內容、外面不包元素（給已經標了 lang="ja" 的地方用） */
export function JaParts({ text }: { text: JaText }) {
  return (
    <>
      {parseJa(text).map((s, i) => {
        if ('slot' in s)
          return (
            <span key={i} className="slot" lang="zh-Hant-TW">
              {s.slot}
            </span>
          );
        const body =
          'r' in s ? (
            <ruby>
              {s.t}
              <rp>（</rp>
              <rt>{s.r}</rt>
              <rp>）</rp>
            </ruby>
          ) : (
            s.t
          );
        // ⟦⟧：考題要考的詞，加底線
        return s.u ? (
          <u key={i} className="ja-target">
            {body}
          </u>
        ) : (
          <Fragment key={i}>{body}</Fragment>
        );
      })}
    </>
  );
}
