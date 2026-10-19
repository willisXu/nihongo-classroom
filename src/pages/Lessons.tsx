import { Link } from 'react-router-dom';
import { LESSON_META as LESSONS } from '../data/lessons/meta';
import { lessonStore } from '../state';
import { useStore } from '../state/store';
import { lessonsDone, nextLesson } from '../lib/progress';
import { Icon } from '../components/Icon';
import { usePageTitle } from '../lib/title';

export default function Lessons() {
  usePageTitle('五十音課程');
  const progress = useStore(lessonStore);
  const next = nextLesson(progress);
  const done = lessonsDone(progress);
  return (
    <div className="wrap">
      <header className="ph">
        <p className="eyebrow">五十音課程 · 已完成 {done}/{LESSONS.length}</p>
        <h1>從零開始的八堂課</h1>
        <p className="lede">
          前六課學平假名，後兩課學片假名。每課約 40 分鐘：講解、聽發音、練習、作業。照順序上，每課的單字只會用到學過的假名。
        </p>
      </header>

      <ol className="lesson-list">
        {LESSONS.map((l) => {
          const isDone = !!progress.done[l.id];
          const isNow = next?.id === l.id;
          return (
            <li key={l.id} className={`lesson-item ${isDone ? 'is-done' : ''} ${isNow ? 'is-now' : ''}`}>
              <Link to={`/lessons/${l.id}`} className="lesson-link">
                <span className="lesson-num" aria-hidden="true">
                  {isDone ? <Icon name="check" size={18} /> : l.id}
                </span>
                <span className="lesson-body">
                  <span className="lesson-title">
                    第 {l.id} 課　<span className="ja" lang={/[\u3041-\u3096\u30a1-\u30fa]/u.test(l.title) ? 'ja' : undefined}>{l.title}</span>
                    {isNow ? <span className="now-pill">下一課</span> : null}
                    {isDone ? <span className="sr-only">（已完成）</span> : null}
                  </span>
                  <span className="lesson-head">{l.headline}</span>
                  {/* 外層標日文：寬度不夠時瀏覽器補上的「…」也用假名字型 */}
                  <span className="lesson-kana" lang="ja">
                    <span aria-hidden="true">
                      {l.newKana.slice(0, 26).join(' ')}
                      {l.newKana.length > 26 ? ' …' : ''}
                    </span>
                    <span className="sr-only" lang="zh-Hant-TW">
                      新學的字：<span lang="ja">{l.newKana.join('')}</span>
                    </span>
                  </span>
                </span>
                <span className="lesson-min">{l.minutes} 分鐘</span>
              </Link>
            </li>
          );
        })}
      </ol>

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
