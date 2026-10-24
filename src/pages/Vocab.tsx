import { Link } from 'react-router-dom';
import { DECK_META, learnedInOtherDeck, metaItemIds, unseenWords } from '../data/vocab/meta';
import { NEW_PER_DAY_OPTIONS, lessonStore, settingsStore, srsStore, updateSettings } from '../state';
import { useStore } from '../state/store';
import { deckStats } from '../lib/srs';
import { studyDayKey } from '../lib/date';
import { courseLessonsDone, courseWords, kanaCourseDone, kanaLessonsDone, nextCourseLesson } from '../lib/progress';
import { Meter } from '../components/Controls';
import { Icon } from '../components/Icon';
import { usePageTitle } from '../lib/title';
import { useNow } from '../lib/useNow';

const DECK_NOTE: Record<string, string> = {
  n5: '先背這組：檢定和日常都用得到。',
  n4: '上 N4 課程時，用每一課的單字卡一起練；N5 單字熟了以後也可以直接背這組。',
  travel: '出發去日本前一個月開始背。',
  business: '和日本同事、客戶往來用。',
  anime: '看劇、看動畫、聽歌時最常聽到。',
  course: '上 N5 課程時，用每一課的單字卡一起練就好。',
};

export default function Vocab() {
  usePageTitle('單字牌組');
  // 開著過夜、從背景切回來時重新取時間：過了凌晨 4 點，到期和新卡的數字才會更新
  const now = useNow();
  const srs = useStore(srsStore);
  const settings = useStore(settingsStore);
  const lessons = useStore(lessonStore);
  const freshToday = srs.days[studyDayKey(now)]?.fresh ?? 0;
  const newLeft = Math.min(unseenWords(srs.cards), Math.max(0, settings.newPerDay - freshToday));
  const all = deckStats(srs.cards, DECK_META.flatMap(metaItemIds), now);
  // 在上 N5 課程：新卡先出上到的那幾課的字（見 lib/vocab.ts 的 courseFirst）
  const courseNow = kanaCourseDone(lessons) ? nextCourseLesson(lessons) : undefined;
  const courseLeft = courseWords(lessons).filter((id) => !(srs.cards[id]?.reps ?? 0)).length;

  return (
    <div className="wrap">
      <header className="ph">
        <p className="eyebrow">單字卡 · 間隔複習</p>
        <h1>單字牌組</h1>
        <p className="lede">
          每天先把「到期」的卡片複習完，再學幾張新卡。記得越清楚的字，下次出現的間隔越長；忘記的字會很快再出現。
        </p>
      </header>

      {kanaLessonsDone(lessons) < 6 && !courseLessonsDone(lessons) ? (
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
        {courseNow ? (
          <p className="small">
            新卡會先出 N5 課程上到的字{courseLeft ? `（還有 ${courseLeft} 個沒學）` : ''}。只練一課：
            <Link to={`/review/lesson-${courseNow.id}`}>第 {courseNow.id} 課的單字</Link>
          </p>
        ) : null}
      </section>

      <div className="deck-grid">
        {DECK_META.map((d) => {
          const s = deckStats(srs.cards, metaItemIds(d), now);
          // 在別的牌組學過的同一個字，這個牌組不會再當新卡出現：也算學過
          const elsewhere = metaItemIds(d).filter((id) => learnedInOtherDeck(srs.cards, id)).length;
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
                <Meter value={s.seen + elsewhere} max={s.total} label={`${d.title} 學過`} />
                <span className="num">
                  {s.seen + elsewhere}/{s.total}
                </span>
              </div>
              {elsewhere ? <p className="small">其中 {elsewhere} 個字在別的牌組學過，這裡不會再當新卡出現。</p> : null}
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
