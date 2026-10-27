import { memo, use, useDeferredValue, useId, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { loadDeck } from '../data/vocab/load';
import type { VocabItem } from '../data/types';
import { settingsStore, srsStore, updateSettings } from '../state';
import { useStore } from '../state/store';
import type { CardState } from '../lib/srs';
import { daysBetween } from '../lib/date';
import {
  POS_LABEL, VERB_GROUP_LABEL, masuForm, groupByTopic, romajiOf, speechText, exampleSpeech, vocabSearchQuery, vocabSearchText,
} from '../lib/vocabItem';
import { SpeakIcon } from '../components/Speak';
import { Switch } from '../components/Controls';
import { Icon } from '../components/Icon';
import { usePageTitle } from '../lib/title';
import { useNow } from '../lib/useNow';

function statusOf(card: CardState | undefined, now: number): { label: string; cls: string } {
  if (!card || card.reps === 0) return { label: '未學', cls: '' };
  if (card.step >= 0) return { label: '學習中', cls: 'st-learning' };
  if (card.due <= now) return { label: '到期', cls: 'st-due' };
  const d = daysBetween(now, card.due);
  return { label: d <= 1 ? '明天' : `${d} 天後`, cls: card.ivl >= 21 ? 'st-mature' : 'st-review' };
}

export default function Deck() {
  const { deck: deckId } = useParams();
  // 只下載這一副牌組（第一次打開時顯示「載入中」，見 Layout 的 Suspense）
  const deck = use(loadDeck(deckId ?? ''));
  const srs = useStore(srsStore);
  const settings = useStore(settingsStore);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<string>('');
  // 打字時先更新輸入框，列表晚一點再跟上，打字不會卡
  const deferredQuery = useDeferredValue(query);
  // 回到這個分頁、過了凌晨 4 點換日時重新取時間。狀態在這裡算好、只把文字傳給每一列：
  // 狀態沒變的列不重畫（切回分頁時幾百列不用全部重畫）
  const now = useNow();
  usePageTitle(deck ? deck.title : '找不到這個牌組');

  const groups = useMemo(() => (deck ? groupByTopic(deck.items) : []), [deck]);
  // 每個單字可以被搜尋到的文字，換牌組時算一次就好
  const index = useMemo(() => new Map(deck ? deck.items.map((it) => [it.id, vocabSearchText(it)]) : []), [deck]);
  const filtered = useMemo(() => {
    if (!deck) return [];
    const q = vocabSearchQuery(deferredQuery);
    return groups
      .filter((g) => !topic || g.topic === topic)
      .map((g) => ({
        topic: g.topic,
        items: q ? g.items.filter((it) => index.get(it.id)!.includes(q)) : g.items,
      }))
      .filter((g) => g.items.length);
  }, [groups, deferredQuery, topic, deck, index]);

  if (!deck) {
    return (
      <div className="wrap">
        <header className="ph">
          <h1>找不到這個牌組</h1>
          <p className="lede">
            <Link to="/vocab">回單字牌組</Link>
          </p>
        </header>
      </div>
    );
  }

  const count = filtered.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="wrap">
      <header className="ph">
        <p className="eyebrow">
          <Link to="/vocab">單字牌組</Link> · {deck.items.length} 個
        </p>
        <h1>{deck.title}</h1>
        <p className="lede">{deck.description}</p>
        <div className="btn-row">
          <Link className="btn btn-primary" to={`/review/${deck.id}`}>
            開始複習 <Icon name="arrow-right" size={17} />
          </Link>
        </div>
      </header>

      <div className="toolbar deck-tools">
        <label className="search" htmlFor="deck-search">
          <span className="sr-only">搜尋單字</span>
          <input
            id="deck-search"
            type="search"
            placeholder="搜尋假名、漢字、中文或拼音"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Switch id="deck-romaji" checked={settings.showRomaji} onChange={(v) => updateSettings({ showRomaji: v })}>
          羅馬拼音
        </Switch>
      </div>
      <div className="topic-chips" role="group" aria-label="主題">
        <button type="button" className="rchip" aria-pressed={!topic} onClick={() => setTopic('')}>
          全部
        </button>
        {groups.map((g) => (
          <button key={g.topic} type="button" className="rchip" aria-pressed={topic === g.topic} onClick={() => setTopic(g.topic)}>
            {g.topic}
            <span className="rchip-n">{g.items.length}</span>
          </button>
        ))}
      </div>
      <p className="small" aria-live="polite">
        顯示 {count} 個
      </p>

      {filtered.map((g) => (
        <section key={g.topic} className="vgroup" aria-label={g.topic}>
          <h2 className="h-sub">{g.topic}</h2>
          <ul className="vlist">
            {g.items.map((it) => {
              const st = statusOf(srs.cards[it.id], now);
              return <VocabRow key={it.id} item={it} showRomaji={settings.showRomaji} status={st.label} statusCls={st.cls} />;
            })}
          </ul>
        </section>
      ))}
      {!count ? <p className="empty">沒有符合的單字，換個關鍵字試試。</p> : null}
    </div>
  );
}

/** 單字一列；資料沒變就不重畫（牌組可能有幾百列） */
const VocabRow = memo(function VocabRow({
  item,
  showRomaji,
  status,
  statusCls,
}: {
  item: VocabItem;
  showRomaji: boolean;
  status: string;
  statusCls: string;
}) {
  const [open, setOpen] = useState(false);
  const exId = useId();
  const hasMore = !!(item.ex || item.note);
  return (
    <li className="vrow">
      <SpeakIcon text={speechText(item)} label={`播放 ${item.kana}`} />
      <div className="v-main">
        <p className="v-ja" lang="ja">
          {item.kanji ? (
            <>
              <span className="v-kanji">{item.kanji}</span>
              <span className="v-kana">{item.kana}</span>
            </>
          ) : (
            <span className="v-kanji">{item.kana}</span>
          )}
          {showRomaji ? <span className="v-r">{romajiOf(item)}</span> : null}
        </p>
        <p className="v-zh">
          {item.zh}
          <span className="v-pos">
            {POS_LABEL[item.pos]}
            {item.verbGroup ? ` · ${VERB_GROUP_LABEL[item.verbGroup]}` : ''}
            {masuForm(item) ? (
              <>
                {' · ます形 '}
                <span lang="ja">{masuForm(item)}</span>
              </>
            ) : null}
          </span>
        </p>
        {open && hasMore ? (
          <div className="v-more">
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
        ) : null}
      </div>
      <div className="v-side">
        <span className={`v-status ${statusCls}`}>{status}</span>
        {hasMore ? (
          <button type="button" className="linkbtn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? '收合' : item.ex ? '例句' : '說明'}
          </button>
        ) : null}
      </div>
    </li>
  );
});
