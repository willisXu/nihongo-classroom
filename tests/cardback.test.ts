// 單字卡背面（複習頁、錯題本的加強練習共用）
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardBack } from '../src/components/CardBack';
import { vocabById } from '../src/data/vocab';

const html = (id: string) => renderToStaticMarkup(createElement(CardBack, { item: vocabById(id)! }));

describe('單字卡背面', () => {
  it('例句全是假名時，讀音那一行不重複', () => {
    const kanaOnly = html('n5-0006'); // どうもありがとうございます。
    expect(kanaOnly.match(/class="v-ex-ja"/g)).toHaveLength(1);
    expect(kanaOnly).not.toContain('v-ex-kana');
    // 例句有漢字時照常顯示讀音
    expect(html('n5-0590')).toContain('<p lang="ja" class="v-ex-kana">まいあさパンをたべます。</p>');
  });

  it('動詞加上ます形，其他詞性沒有', () => {
    expect(html('n5-0590')).toContain('ます形 <span lang="ja">食べます</span>');
    expect(html('n5-0006')).not.toContain('ます形');
  });
});
