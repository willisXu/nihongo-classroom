import { Link } from 'react-router-dom';
import { COURSE_LESSONS, COURSE_LEVELS, KANA_LESSONS, LESSON_META, UNITS, levelLessons } from '../data/lessons/meta';
import type { CourseLessonMeta, KanaLessonMeta } from '../data/types';
import { lessonStore, type LessonProgress } from '../state';
import { useStore } from '../state/store';
import { kanaLessonsDone, lessonsDone, nextLesson } from '../lib/progress';
import { Icon } from '../components/Icon';
import { usePageTitle } from '../lib/title';
import { jumpToElement } from '../lib/jump';

const hasKana = (t: string) => /[ぁ-ゖァ-ヺ]/u.test(t);

/**
 * 跳到某一組課（五十音、N5、N4），焦點放在那一組的標題（鍵盤和讀屏軟體從那裡接著讀）。
 * 直接跳、不平滑捲動：畫面外的單元還沒排版，平滑捲動會停在錯的地方（見 lib/jump.ts）
 */
function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (el) jumpToElement(el);
}

export default function Lessons() {
  usePageTitle('課程');
  const progress = useStore(lessonStore);
  const next = nextLesson(progress);
  const done = lessonsDone(progress);
  const kanaDone = kanaLessonsDone(progress);
  // 初級課程照程度（N5、N4）分組，組裡再照單元分
  const levels = COURSE_LEVELS.map((lv) => {
    const lessons = levelLessons(lv.level);
    const units = UNITS.map((u) => ({ ...u, lessons: lessons.filter((l) => l.unit === u.n) })).filter((u) => u.lessons.length);
    return { ...lv, lessons, units, done: lessons.filter((l) => progress.done[l.id]).length };
  }).filter((lv) => lv.lessons.length);
  const first = COURSE_LESSONS[0]?.id;
  return (
    <div className="wrap">
      <header className="ph">
        <p className="eyebrow">課程 · 已完成 {done}/{LESSON_META.length}</p>
        <h1>從五十音到 {levels[levels.length - 1]?.name ?? 'N5'}</h1>
        <p className="lede">
          前 {KANA_LESSONS.length} 課學假名，每課約 40 分鐘，單字只會用到學過的假名。
          {COURSE_LESSONS.length
            ? `第 ${first} 課起是初級課程：會話、文法、單字、漢字和練習題。` +
              levels.map((lv) => `第 ${lv.lessons[0].id}–${lv.lessons[lv.lessons.length - 1].id} 課學完大約是日本語能力試驗 ${lv.name} 的程度`).join('，') +
              '。'
            : ''}
          照順序上就好。
        </p>
        {levels.length ? (
          /* 課很多：跳到五十音、N5、N4 那一組，或直接打開下一課 */
          <nav className="lesson-jump" aria-label="跳到">
            <button type="button" className="chip-btn" onClick={() => jumpTo('h-kana-course')}>
              五十音 <span className="num">{kanaDone}/{KANA_LESSONS.length}</span>
            </button>
            {levels.map((lv) => (
              <button key={lv.level} type="button" className="chip-btn" onClick={() => jumpTo(`h-${lv.level}-course`)}>
                {lv.title} <span className="num">{lv.done}/{lv.lessons.length}</span>
              </button>
            ))}
            {next ? (
              <Link className="chip-btn chip-next" to={`/lessons/${next.id}`}>
                下一課：第 {next.id} 課 <Icon name="arrow-right" size={14} />
              </Link>
            ) : null}
          </nav>
        ) : null}
      </header>

      <section className="lesson-group" aria-labelledby="h-kana-course">
        <div className="lg-head">
          <h2 id="h-kana-course" tabIndex={-1}>
            五十音
          </h2>
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

      {levels.map((lv) => (
        <section key={lv.level} className="lesson-group" aria-labelledby={`h-${lv.level}-course`}>
          <div className="lg-head">
            <h2 id={`h-${lv.level}-course`} tabIndex={-1}>
              {lv.title}
            </h2>
            <p className="small">
              第 {lv.lessons[0].id}–{lv.lessons[lv.lessons.length - 1].id} 課 · 已完成 {lv.done}/{lv.lessons.length}
            </p>
          </div>
          {lv.units.map((u) => (
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
      ))}

      <div className="btn-row" style={{ marginBlock: '8px 32px' }}>
        <Link className="btn" to="/chart">
          <Icon name="grid" size={17} /> 五十音表
        </Link>
        <Link className="btn" to="/roadmap">
          <Icon name="map" size={17} /> 學習地圖
        </Link>
        <Link className="btn" to="/mock">
          <Icon name="target" size={17} /> N4 模擬考
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
