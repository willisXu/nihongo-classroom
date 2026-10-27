import { useId, type Ref } from 'react';
import type { VocabItem } from '../data/types';
import { POS_LABEL, VERB_GROUP_LABEL, exampleSpeech, masuForm } from '../lib/vocab';
import { SpeakIcon } from './Speak';

/**
 * 單字卡的背面：意思、詞性（動詞加上ます形）、例句、用法提醒。
 * 複習頁和錯題本的加強練習共用：只改一邊的話，兩邊顯示的會不一樣。
 * backRef：翻面後焦點放在這裡（螢幕閱讀器會念出來）；meaningRef：翻面後把意思捲進畫面（見 lib/flashcard.ts）。
 */
export function CardBack({
  item,
  backRef,
  meaningRef,
}: {
  item: VocabItem;
  backRef?: Ref<HTMLDivElement>;
  meaningRef?: Ref<HTMLParagraphElement>;
}) {
  const masu = masuForm(item);
  const exId = useId();
  return (
    <div className="flash-back" ref={backRef} tabIndex={-1}>
      <p className="f-zh" ref={meaningRef}>
        {item.zh}
      </p>
      <p className="f-pos">
        {POS_LABEL[item.pos]}
        {item.verbGroup ? ` · ${VERB_GROUP_LABEL[item.verbGroup]}` : ''}
        {masu ? (
          <>
            {' · ます形 '}
            <span lang="ja">{masu}</span>
          </>
        ) : null}
      </p>
      {item.ex ? (
        <div className="v-ex">
          <SpeakIcon text={exampleSpeech(item.ex)} label="播放例句" describedBy={exId} />
          <div>
            <p lang="ja" className="v-ex-ja" id={exId}>
              {item.ex.ja}
            </p>
            {/* 例句全是假名時，讀音和原句一樣，不重複顯示 */}
            {item.ex.kana !== item.ex.ja ? (
              <p lang="ja" className="v-ex-kana">
                {item.ex.kana}
              </p>
            ) : null}
            <p className="v-ex-zh">{item.ex.zh}</p>
          </div>
        </div>
      ) : null}
      {item.note ? <p className="v-note">{item.note}</p> : null}
    </div>
  );
}
