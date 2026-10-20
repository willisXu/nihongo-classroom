import { Link } from 'react-router-dom';
import { COURSE_LESSONS, KANA_LESSONS, LESSON_META, UNITS } from '../data/lessons/meta';
import type { CourseLessonMeta, KanaLessonMeta } from '../data/types';
import { lessonStore, type LessonProgress } from '../state';
import { useStore } from '../state/store';
import { courseLessonsDone, kanaLessonsDone, lessonsDone, nextLesson } from '../lib/progress';
import { Icon } from '../components/Icon';
import { usePageTitle } from '../lib/title';

const hasKana = (t: string) => /[ぁ-ゖァ-ヺ]/u.test(t);

export default function Lessons() {
  usePageTitle('課程');
  const progress = useStore(lessonStore);
  const next = nextLesson(progress);
  const done = lessonsDone(progress);
  const kanaDone = kanaLessonsDone(progress);
  const courseDone = courseLessonsDone(progress);
  const units = UNITS.map((u) => ({ ...u, lessons: COURSE_LESSONS.filter((l) => l.unit === u.n) })).filter((u) => u.lessons.length);
  const first = COURSE_LESSONS[0]?.id;
  const last = COURSE_LESSONS[COURSE_LESSONS.length - 1]?.id;
  return (
    <div className="wrap">
      <header className="ph">
        <p className="eyebrow">課程 · 已完成 {done}/{LESSON_META.length}</p>
        <h1>從五十音到 N5</h1>
        <p className="lede">
          前 {KANA_LESSONS.length} 課學假名，每課約 40 分鐘，單字只會用到學過的假名。
          {COURSE_LESSONS.length
            ? `第 ${first} 課起是初級課程：會話、文法、單字、漢字和練習題，${COURSE_LESSONS.length} 課學完大約是日本語能力試驗 N5 的程度。`
            : ''}
          照順序上就好。
        </p>
      </header>

      <section className="lesson-group" aria-labelledby="h-kana-course">
        <div className="lg-head">
          <h2 id="h-kana-course">五十音</h2>
          <p className="small">
            第 1–{KANA_LESSONS.length} 課 · 已完成 {kanaDone}/{KANA_LESSONS.length}
          </p>
        </div>
        <ol className="lesson-list">
          {KANA_LESSONS.map((l) => (
            <LessonItem key={l.id} l={l} progress={progress} isNow={next?.id === l.id} />
          ))}
        </ol>
      </section>

      {units.length ? (
        <section className="lesson-group" aria-labelledby="h-n5-course">
          <div className="lg-head">
            <h2 id="h-n5-course">N5 初級</h2>
            <p className="small">
              第 {first}–{last} 課 · 已完成 {courseDone}/{COURSE_LESSONS.length}
            </p>
          </div>
          {units.map((u) => (
            <div key={u.n} className="unit">
              <h3 className="unit-h">
                <span className="unit-n">第 {u.n} 單元</span>
                {u.title}
              </h3>
              <p className="unit-topic">{u.topic}</p>
              <ol className="lesson-list">
                {u.lessons.map((l) => (
                  <LessonItem key={l.id} l={l} progress={progress} isNow={next?.id === l.id} />
                ))}
              </ol>
            </div>
          ))}
        </section>
      ) : null}

      <div className="btn-row" style={{ marginBlock: '8px 32px' }}>
        <Link className="btn" to="/chart">
          <Icon name="grid" size={17} /> 五十音表
        </Link>
        <Link className="btn" to="/roadmap">
          <Icon name="map" size={17} /> 學習地圖
        </Link>
      </div>
    </div>
  );
}

function LessonItem({ l, progress, isNow }: { l: KanaLessonMeta | CourseLessonMeta; progress: LessonProgress; isNow: boolean }) {
  const isDone = !!progress.done[l.id];
  return (
    <li className={`lesson-item ${isDone ? 'is-done' : ''} ${isNow ? 'is-now' : ''}`}>
      <Link to={`/lessons/${l.id}`} className="lesson-link">
        <span className="lesson-num" aria-hidden="true">
          {isDone ? <Icon name="check" size={18} /> : l.id}
        </span>
        <span className="lesson-body">
          <span className="lesson-title">
            第 {l.id} 課{'　'}
            <span className="ja" lang={hasKana(l.title) ? 'ja' : undefined}>
              {l.title}
            </span>
            {isNow ? <span className="now-pill">下一課</span> : null}
            {isDone ? <span className="sr-only">（已完成）</span> : null}
          </span>
          <span className="lesson-head">{l.headline}</span>
          {l.kind === 'kana' ? (
            /* 外層標日文：寬度不夠時瀏覽器補上的「…」也用假名字型 */
            <span className="lesson-kana" lang="ja">
              <span aria-hidden="true">
                {l.newKana.slice(0, 26).join(' ')}
                {l.newKana.length > 26 ? ' …' : ''}
              </span>
              <span className="sr-only" lang="zh-Hant-TW">
                新學的字：<span lang="ja">{l.newKana.join('')}</span>
              </span>
            </span>
          ) : (
            <span className="lesson-kana lesson-gram" lang="ja">
              <span className="sr-only" lang="zh-Hant-TW">
                文法：
              </span>
              {l.grammar.join('　')}
            </span>
          )}
        </span>
        <span className="lesson-min">{l.minutes} 分鐘</span>
      </Link>
    </li>
  );
}
