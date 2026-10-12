import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { deckById } from '../data/vocab';
import type { VocabItem } from '../data/types';
import { settingsStore, srsStore, updateSettings } from '../state';
import { useStore } from '../state/store';
import type { CardState } from '../lib/srs';
import { romaji } from '../lib/romaji';
import { daysBetween } from '../lib/date';
import { POS_LABEL, VERB_GROUP_LABEL, groupByTopic } from '../lib/vocab';
import { SpeakIcon } from '../components/Speak';
import { Switch } from '../components/Controls';
import { Icon } from '../components/Icon';

function statusOf(card: CardState | undefined, now: number): { label: string; cls: string } {
  if (!card || card.reps === 0) return { label: '未學', cls: '' };
  if (card.step >= 0) return { label: '學習中', cls: 'st-learning' };
  if (card.due <= now) return { label: '到期', cls: 'st-due' };
  const d = daysBetween(now, card.due);
  return { label: d <= 1 ? '明天' : `${d} 天後`, cls: card.ivl >= 21 ? 'st-mature' : 'st-review' };
}

export default function Deck() {
  const { deck: deckId } = useParams();
  const deck = deckById(deckId ?? '');
  const srs = useStore(srsStore);
  const settings = useStore(settingsStore);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<string>('');
  const now = Date.now();

  const groups = useMemo(() => (deck ? groupByTopic(deck.items) : []), [deck]);
  const filtered = useMemo(() => {
    if (!deck) return [];
    const q = query.trim().toLowerCase();
    return groups
      .filter((g) => !topic || g.topic === topic)
      .map((g) => ({
        topic: g.topic,
        items: g.items.filter((it) => {
          if (!q) return true;
          return (
            it.kana.includes(q) ||
            (it.kanji ?? '').includes(q) ||
            it.zh.toLowerCase().includes(q) ||
            romaji(it.kana).toLowerCase().includes(q)
          );
        }),
      }))
      .filter((g) => g.items.length);
  }, [groups, query, topic, deck]);

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
            {g.items.map((it) => (
              <VocabRow key={it.id} item={it} showRomaji={settings.showRomaji} status={statusOf(srs.cards[it.id], now)} />
            ))}
          </ul>
        </section>
      ))}
      {!count ? <p className="empty">沒有符合的單字，換個關鍵字試試。</p> : null}
    </div>
  );
}

function VocabRow({ item, showRomaji, status }: { item: VocabItem; showRomaji: boolean; status: { label: string; cls: string } }) {
  const [open, setOpen] = useState(false);
  const hasMore = !!(item.ex || item.note);
  return (
    <li className="vrow">
      <SpeakIcon text={item.kanji ?? item.kana} label={`播放 ${item.kana}`} />
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
          {showRomaji ? <span className="v-r">{romaji(item.kana)}</span> : null}
        </p>
        <p className="v-zh">
          {item.zh}
          <span className="v-pos">
            {POS_LABEL[item.pos]}
            {item.verbGroup ? ` · ${VERB_GROUP_LABEL[item.verbGroup]}` : ''}
          </span>
        </p>
        {open && hasMore ? (
          <div className="v-more">
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
      </div>
      <div className="v-side">
        <span className={`v-status ${status.cls}`}>{status.label}</span>
        {hasMore ? (
          <button type="button" className="linkbtn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? '收合' : item.ex ? '例句' : '說明'}
          </button>
        ) : null}
      </div>
    </li>
  );
}
