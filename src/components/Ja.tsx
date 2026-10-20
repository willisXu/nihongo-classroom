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
      {parseJa(text).map((s, i) =>
        'slot' in s ? (
          <span key={i} className="slot" lang="zh-Hant-TW">
            {s.slot}
          </span>
        ) : 'r' in s ? (
          <ruby key={i}>
            {s.t}
            <rp>（</rp>
            <rt>{s.r}</rt>
            <rp>）</rp>
          </ruby>
        ) : (
          <Fragment key={i}>{s.t}</Fragment>
        ),
      )}
    </>
  );
}
