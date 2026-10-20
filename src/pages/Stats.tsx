import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LESSON_META } from '../data/lessons/meta';
import { activityStore, kanaDaysStore, kanaStore, lessonStore, snapshotKana, srsStore } from '../state';
import { useStore } from '../state/store';
import { studyDayKey } from '../lib/date';
import { nextLesson, streak } from '../lib/progress';
import {
  calendar, cardCounts, kanaMasterySeries, kanaStates, keyStart, niceMax, retention, studySummary, vocabLearnedSeries, weeklyTotals,
} from '../lib/stats';
import { usePageTitle } from '../lib/title';
import { useNow } from '../lib/useNow';
import { Columns, DataTable, Heatmap, LineChart, md, mdw } from '../components/Charts';

const CAL_WEEKS = 16;
const C = {
  s1: 'var(--series-1)',
  s2: 'var(--series-2)',
};

export default function Stats() {
  usePageTitle('學習紀錄');
  // 先記下今天的假名熟悉度：在這個版本之前就練過的人，曲線至少有今天這一點
  useEffect(() => snapshotKana(), []);
  const activity = useStore(activityStore);
  const kana = useStore(kanaStore);
  const kanaDays = useStore(kanaDaysStore);
  const srs = useStore(srsStore);
  const lessons = useStore(lessonStore);
  const now = useNow();
  const todayKey = studyDayKey(now);

  const summary = studySummary(activity, now);
  const current = streak(activity, now);
  const hira = kanaStates(kana, 'h');
  const kata = kanaStates(kana, 'k');
  // 學過的單字照卡片算（張），和進步曲線一致
  const counts = cardCounts(srs.cards);
  const learned = counts.learned;
  const freshToday = srs.days[todayKey]?.fresh ?? 0;
  const ret = retention(srs, now, 30);

  const cal = calendar(activity, now, CAL_WEEKS);
  const calDays = cal.flat().filter((d) => !d.future && d.act.total > 0);
  // 每週練習量：從開始學習那週算起，至少 4 週、最多 12 週
  const sinceFirst = summary.first ? Math.ceil((now - keyStart(summary.first)) / (7 * 86_400_000)) + 1 : 1;
  const weekly = weeklyTotals(activity, now, Math.min(12, Math.max(4, sinceFirst)));
  const kanaSeries = kanaMasterySeries(kanaDays, now);
  const vocabSeries = vocabLearnedSeries(srs, now);
  const done = Object.entries(lessons.done)
    .map(([id, at]) => ({ lesson: LESSON_META.find((l) => l.id === Number(id)), at }))
    .filter((x) => x.lesson)
    .sort((a, b) => a.at - b.at);
  const next = nextLesson(lessons);

  const weekCols = (pick: 'kana' | 'review' | 'writing') => weekly.map((w) => ({ label: md(w.start), value: w[pick] }));
  const weekMax = (pick: 'kana' | 'review' | 'writing') => niceMax(Math.max(...weekly.map((w) => w[pick])));

  return (
    <div className="wrap stats-page">
      <header className="ph">
        <p className="eyebrow">學習紀錄</p>
        <h1>看看自己的進步</h1>
        <p className="lede">每天練了多少、假名和單字怎麼增加。紀錄都存在這個瀏覽器裡。</p>
      </header>

      <section className="kpis" aria-label="總覽">
        <div className="card kpi">
          <p className="kpi-label">學習天數</p>
          <p className="kpi-value">
            {summary.days}
            <small>天</small>
          </p>
          <p className="kpi-sub">{summary.first ? `從 ${md(keyStart(summary.first))} 開始` : '還沒開始'}</p>
        </div>
        <div className="card kpi">
          <p className="kpi-label">連續學習</p>
          <p className="kpi-value">
            {current}
            <small>天</small>
          </p>
          <p className="kpi-sub">最長 {summary.longest} 天</p>
        </div>
        <div className="card kpi">
          <p className="kpi-label">熟悉的假名</p>
          <p className="kpi-value">
            {hira.mastered + kata.mastered}
            <small>／92</small>
          </p>
          <p className="kpi-sub">
            平假名 {hira.mastered}・片假名 {kata.mastered}
          </p>
        </div>
        <div className="card kpi">
          <p className="kpi-label">學過的單字</p>
          <p className="kpi-value">
            {learned.toLocaleString('zh-TW')}
            <small>張</small>
          </p>
          <p className="kpi-sub">{freshToday ? `今天新學 ${freshToday} 張` : `熟卡 ${counts.mature} 張`}</p>
        </div>
        <div className="card kpi">
          <p className="kpi-label">複習時記得</p>
          <p className="kpi-value">{ret.rate === null ? '—' : <>{Math.round(ret.rate * 100)}<small>%</small></>}</p>
          <p className="kpi-sub">{ret.rev ? `最近 30 天到期複習 ${ret.rev} 次` : '開始複習單字卡後會出現'}</p>
        </div>
      </section>

      <section className="block" aria-labelledby="h-cal">
        <h2 id="h-cal">學習日曆</h2>
        <p className="small">顏色越深，那天練習越多（假名測驗、單字複習、手寫、完成課程、AI 家教的次數加起來）。</p>
        <Heatmap weeks={cal} todayKey={todayKey} label={`最近 ${CAL_WEEKS} 週的學習日曆，其中 ${calDays.length} 天有學習`} />
        {calDays.length ? (
          <DataTable
            caption="每天的練習次數"
            head={['日期', '假名', '單字', '手寫', '課程', 'AI 家教', '合計']}
            rows={calDays
              .slice()
              .reverse()
              .map((d) => [mdw(d.date), d.act.kana, d.act.review, d.act.writing, d.act.lesson, d.act.tutor, d.act.total])}
          />
        ) : (
          <p className="muted">
            還沒有學習紀錄。從<Link to="/">今天的任務</Link>開始吧。
          </p>
        )}
      </section>

      <section className="block" aria-labelledby="h-week">
        <h2 id="h-week">每週練習量</h2>
        <div className="viz-multiples">
          <div>
            <p className="viz-title">假名測驗（題）</p>
            <Columns data={weekCols('kana')} max={weekMax('kana')} unit="題" color={C.s1} label="每週假名測驗題數" />
          </div>
          <div>
            <p className="viz-title">單字卡複習（次）</p>
            <Columns data={weekCols('review')} max={weekMax('review')} unit="次" color={C.s1} label="每週單字卡複習次數" />
          </div>
          <div>
            <p className="viz-title">手寫（字）</p>
            <Columns data={weekCols('writing')} max={weekMax('writing')} unit="字" color={C.s1} label="每週手寫字數" />
          </div>
        </div>
        <DataTable
          caption="每週練習量"
          head={['那週（週日起）', '假名（題）', '單字（次）', '手寫（字）']}
          rows={weekly
            .slice()
            .reverse()
            .map((w) => [md(w.start), w.kana, w.review, w.writing])}
        />
      </section>

      <section className="block" aria-labelledby="h-growth">
        <h2 id="h-growth">進步曲線</h2>
        <div className="viz-multiples wide">
          <div>
            <p className="viz-title">熟悉的假名（連對 3 次，各 46 個）</p>
            {kanaSeries.h.length ? (
              <>
                <LineChart
                  series={[
                    { name: '平假名', color: C.s1, points: kanaSeries.h },
                    { name: '片假名', color: C.s2, points: kanaSeries.k },
                  ]}
                  max={46}
                  unit="個"
                  label={`熟悉的假名：平假名 ${hira.mastered} 個、片假名 ${kata.mastered} 個`}
                />
                <DataTable
                  caption="每天熟悉的假名"
                  head={['日期', '平假名', '片假名']}
                  rows={kanaSeries.h
                    .map((p, i) => [mdw(p.date), p.value, kanaSeries.k[i].value])
                    .slice(-30)
                    .reverse()}
                />
              </>
            ) : (
              <p className="muted">做假名測驗之後，這裡會畫出熟悉的假名每天增加多少。</p>
            )}
          </div>
          <div>
            <p className="viz-title">學過的單字（張）</p>
            {vocabSeries.length ? (
              <>
                <LineChart
                  series={[{ name: '學過的單字', color: C.s1, points: vocabSeries }]}
                  max={niceMax(vocabSeries[vocabSeries.length - 1].value)}
                  unit="張"
                  label={`學過的單字：${vocabSeries[vocabSeries.length - 1].value} 張`}
                />
                <DataTable
                  caption="每天累計學過的單字"
                  head={['日期', '累計（張）']}
                  rows={vocabSeries
                    .map((p) => [mdw(p.date), p.value])
                    .slice(-30)
                    .reverse()}
                />
              </>
            ) : (
              <p className="muted">
                開始背<Link to="/vocab">單字卡</Link>之後，這裡會畫出學過的單字怎麼累積。
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="block" aria-labelledby="h-lessons">
        <h2 id="h-lessons">課程進度</h2>
        {done.length ? (
          <ol className="lesson-log">
            {done.map(({ lesson, at }) => (
              <li key={lesson!.id}>
                <span className="lesson-log-date">{mdw(at)}</span>
                <Link to={`/lessons/${lesson!.id}`}>
                  第 {lesson!.id} 課 <span lang={/[\u3041-\u3096\u30a1-\u30fa]/u.test(lesson!.title) ? 'ja' : undefined}>{lesson!.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">還沒有完成的課。</p>
        )}
        {next ? (
          <p>
            下一課：
            <Link to={`/lessons/${next.id}`}>
              第 {next.id} 課 <span lang={/[\u3041-\u3096\u30a1-\u30fa]/u.test(next.title) ? 'ja' : undefined}>{next.title}</span>
            </Link>
          </p>
        ) : (
          <p>課程全部完成了！</p>
        )}
      </section>
    </div>
  );
}
