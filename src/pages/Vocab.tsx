import { Link } from 'react-router-dom';
import { DECKS } from '../data/vocab';
import { NEW_PER_DAY_OPTIONS, lessonStore, settingsStore, srsStore, updateSettings } from '../state';
import { useStore } from '../state/store';
import { deckStats } from '../lib/srs';
import { studyDayKey } from '../lib/date';
import { lessonsDone } from '../lib/progress';
import { Meter } from '../components/Controls';
import { Icon } from '../components/Icon';
import { usePageTitle } from '../lib/title';

const DECK_NOTE: Record<string, string> = {
  n5: '先背這組：檢定和日常都用得到。',
  travel: '出發去日本前一個月開始背。',
  business: '和日本同事、客戶往來用。',
  anime: '看劇、看動畫、聽歌時最常聽到。',
};

export default function Vocab() {
  usePageTitle('單字牌組');
  const now = Date.now();
  const srs = useStore(srsStore);
  const settings = useStore(settingsStore);
  const lessons = useStore(lessonStore);
  const freshToday = srs.days[studyDayKey(now)]?.fresh ?? 0;
  const newLeft = Math.max(0, settings.newPerDay - freshToday);
  const all = deckStats(srs.cards, DECKS.flatMap((d) => d.items.map((i) => i.id)), now);

  return (
    <div className="wrap">
      <header className="ph">
        <p className="eyebrow">單字卡 · 間隔複習</p>
        <h1>單字牌組</h1>
        <p className="lede">
          每天先把「到期」的卡片複習完，再學幾張新卡。記得越清楚的字，下次出現的間隔越長；忘記的字會很快再出現。
        </p>
      </header>

      {lessonsDone(lessons) < 6 ? (
        <p className="callout callout-soft">
          還沒學完平假名也可以先看看，不過建議完成第 1–6 課再開始背，看得懂假名會輕鬆很多。
        </p>
      ) : null}

      <section className="card today-card" aria-labelledby="h-today-vocab">
        <div className="today-nums">
          <div>
            <span className="bignum">{all.due}</span>
            <span className="bignum-l">張到期</span>
          </div>
          <div>
            <span className="bignum">{newLeft}</span>
            <span className="bignum-l">今天還能學的新卡</span>
          </div>
          <div>
            <span className="bignum">{all.seen}</span>
            <span className="bignum-l">張學過</span>
          </div>
        </div>
        <div className="today-actions">
          <h2 id="h-today-vocab" className="sr-only">
            今天的單字
          </h2>
          <Link className="btn btn-primary" to="/review/all">
            {all.due > 0 ? `複習全部到期卡片（${all.due}）` : '開始今天的單字'} <Icon name="arrow-right" size={17} />
          </Link>
          <label className="newper" htmlFor="newPerDay">
            每天新卡
            <select id="newPerDay" value={settings.newPerDay} onChange={(e) => updateSettings({ newPerDay: Number(e.target.value) })}>
              {NEW_PER_DAY_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} 張
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className="deck-grid">
        {DECKS.map((d) => {
          const s = deckStats(srs.cards, d.items.map((i) => i.id), now);
          return (
            <article key={d.id} className="card deck-card">
              <div className="deck-top">
                <h2>{d.title}</h2>
                <span className={`pill ${s.due ? 'pill-accent' : ''}`}>{s.due ? `${s.due} 張到期` : '沒有到期'}</span>
              </div>
              <p className="muted">{d.description}</p>
              <p className="small">{DECK_NOTE[d.id]}</p>
              <div className="meter-row">
                <span>學過</span>
                <Meter value={s.seen} max={s.total} label={`${d.title} 學過`} />
                <span className="num">
                  {s.seen}/{s.total}
                </span>
              </div>
              <div className="btn-row">
                <Link className="btn btn-primary" to={`/review/${d.id}`}>
                  {s.due ? '開始複習' : '學新卡'}
                </Link>
                <Link className="btn" to={`/vocab/${d.id}`}>
                  瀏覽單字
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
