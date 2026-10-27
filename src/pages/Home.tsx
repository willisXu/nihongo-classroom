import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { COURSE_LESSONS, COURSE_LEVELS, KANA_LESSONS, levelLessons, unitOf } from '../data/lessons/meta';
import type { CourseLevel } from '../data/types';
import { DECK_META, metaItemIds, unseenWords } from '../data/vocab/meta';
import {
  activityStore, apiKeyStore, kanaLevel, kanaStore, lastExportStore, lessonStore, missStore, settingsStore, srsStore, writingStore,
} from '../state';
import { useStore } from '../state/store';
import { countMastered, courseLessonsDone, HIRA_KEYS, kanaLessonsDone, KATA_KEYS, lessonsDone, nextKanaLesson, nextLesson, streak } from '../lib/progress';
import { todayTasks } from '../lib/today';
import { mistakeCount, weakKanaKeys } from '../lib/mistakes';
import { deckStats } from '../lib/srs';
import { daysBetween, formatDateZh, studyDayKey, studyDayStart } from '../lib/date';
import { Icon } from '../components/Icon';
import { Meter } from '../components/Controls';
import { Hanamaru } from '../components/Hanamaru';
import { PURPOSE_LABEL } from '../data/scenarios';
import { homeScenarios } from '../lib/tutorPicks';
import { usePageTitle } from '../lib/title';
import { useNow } from '../lib/useNow';

/** 某月第一個週日 13:00（JLPT 在台灣通常是 7 月、12 月的第一個週日） */
function firstSunday(year: number, monthIndex: number): number {
  const d = new Date(year, monthIndex, 1, 13, 0);
  d.setDate(1 + ((7 - d.getDay()) % 7));
  return d.getTime();
}

/** 目標考期從 2027 年 7 月開始（官方尚未公告，依慣例推估）；考完就換成下一次 */
function nextJlpt(now: number): { at: number; month: 7 | 12 } {
  for (let y = 2027; y < 2100; y++) {
    for (const month of [7, 12] as const) {
      const at = firstSunday(y, month - 1);
      if (daysBetween(now, at) >= 0) return { at, month };
    }
  }
  return { at: firstSunday(2100, 6), month: 7 };
}

const BACKUP_EVERY_DAYS = 14;

const levelName = (level: CourseLevel) => COURSE_LEVELS.find((x) => x.level === level)?.name ?? level.toUpperCase();

export default function Home() {
  usePageTitle(null);
  // 開著過夜、回到分頁時重新取時間：「今天的任務」才會換日
  const now = useNow();
  const lastExport = useStore(lastExportStore);
  const lessons = useStore(lessonStore);
  const kana = useStore(kanaStore);
  const srs = useStore(srsStore);
  const writing = useStore(writingStore);
  const activity = useStore(activityStore);
  const settings = useStore(settingsStore);
  const apiKey = useStore(apiKeyStore);
  const misses = useStore(missStore);

  const next = nextLesson(lessons);
  const done = lessonsDone(lessons);
  const kanaDone = kanaLessonsDone(lessons);
  const courseDone = courseLessonsDone(lessons);
  const hira = countMastered(kana, HIRA_KEYS);
  const kata = countMastered(kana, KATA_KEYS);
  const days = streak(activity, now);
  const tasks = todayTasks({ activity, kana, lessons, srs, newPerDay: settings.newPerDay, now });
  const tasksDone = tasks.filter((t) => t.done).length;
  const allDone = tasks.length > 0 && tasksDone === tasks.length;
  const mistakes = mistakeCount(kana, misses, srs.cards, writing);

  const vocab = useMemo(() => {
    let due = 0;
    let seen = 0;
    const perDeck = DECK_META.map((d) => {
      const s = deckStats(srs.cards, metaItemIds(d), now);
      due += s.due;
      seen += s.seen;
      return { deck: d, ...s };
    });
    const freshToday = srs.days[studyDayKey(now)]?.fresh ?? 0;
    const newLeft = Math.min(unseenWords(srs.cards), Math.max(0, settings.newPerDay - freshToday));
    return { due, seen, perDeck, newLeft };
  }, [srs, settings.newPerDay, now]);

  const weak = useMemo(() => weakKanaKeys(kana).slice(0, 8).map((k) => k.slice(2)), [kana]);

  // 手寫建議：目前這一課新教、還沒寫過的字（第 6 課是 ゃ ゅ ょ っ，不是測驗複習的全部平假名）。
  // 五十音學完之後：N5 這一課的漢字（都有筆順資料，測試會檢查；首頁不載入筆順資料）；
  // 這一課沒有新漢字（第 30 課起）或全部學完時，複習學過的漢字
  const kanaWrite = nextKanaLesson(lessons);
  const learnedKanji = COURSE_LESSONS.filter((l) => lessons.done[l.id]).map((l) => l.kanji).join('');
  const courseWrite = next?.kind === 'course' && next.kanji ? next : undefined;
  const kanaShown = kanaWrite ?? (courseWrite || learnedKanji ? undefined : KANA_LESSONS[KANA_LESSONS.length - 1]);
  const toWrite = kanaShown ? kanaShown.newKana : [...(courseWrite?.kanji ?? learnedKanji)];
  const writeWhat = kanaShown ? `第 ${kanaShown.id} 課的字` : courseWrite ? `第 ${courseWrite.id} 課的漢字` : '學過的漢字';
  const writeChars = toWrite.filter((ch) => !writing[ch]);
  const writeDone = toWrite.length - writeChars.length;
  const writeLink = (ch?: string) =>
    (kanaShown ? `/writing?lesson=${kanaShown.id}` : `/writing?chars=${encodeURIComponent(toWrite.join(''))}`) +
    (ch ? `&char=${encodeURIComponent(ch)}` : '');
  const unit = next?.kind === 'course' ? unitOf(next.unit) : undefined;
  // 這一課所在的程度（N5、N4）完成幾課
  const levelList = next?.kind === 'course' ? levelLessons(next.level) : [];
  const levelCount = levelList.length;
  const levelDone = levelList.filter((l) => lessons.done[l.id]).length;
  const unitLessons = unit ? COURSE_LESSONS.filter((l) => l.unit === unit.n) : KANA_LESSONS;

  // AI 家教：先推薦這一課搭配的情境，其餘每天輪流（還在 N5 時不推薦 N4 課程的情境）
  const suggested = homeScenarios(lessons, now);
  const jlpt = nextJlpt(now);
  const jlptDays = daysBetween(now, jlpt.at);
  const jlptDate = new Date(jlpt.at);
  // 學過幾天之後，提醒定期匯出備份（紀錄只存在這個瀏覽器）
  const studyDays = Object.keys(activity).length;
  const sinceExport = lastExport ? daysBetween(lastExport, now) : null;
  const needBackup = studyDays >= 3 && (sinceExport === null || sinceExport >= BACKUP_EVERY_DAYS);

  return (
    <div className="wrap">
      <header className="ph">
        {/* 凌晨 4 點前還算前一天（今天的任務也還是前一天的）：日期跟著學習日 */}
        <p className="eyebrow">{formatDateZh(studyDayStart(now))}</p>
        <h1>今天的學習</h1>
        <p className="today-line">
          <span className="streak">
            <Icon name="flame" size={18} />
            {days > 0 ? `連續學習 ${days} 天` : '今天開始第一天'}
          </span>
          <Link to="/stats">看學習紀錄</Link>
        </p>
      </header>

      <div className="home-grid">
        <div className="home-main">
          <section className="card home-card home-today" aria-labelledby="h-today">
            <div className="card-head">
              <h2 id="h-today">今天的任務</h2>
              <span className={`pill ${allDone ? 'pill-ok' : ''}`}>
                {tasksDone}/{tasks.length} 完成
              </span>
            </div>
            {allDone ? (
              <div className="today-done" role="status">
                <span className="today-maru">
                  <Hanamaru show />
                </span>
                <p>
                  <b>今天的任務都完成了！</b>
                  {days > 1 ? `已經連續學習 ${days} 天。` : ''}還有時間的話，可以繼續上課，或到錯題本加強。
                </p>
              </div>
            ) : null}
            <ul className="tasks">
              {tasks.map((t) => (
                <li key={t.id} className={`task${t.done ? ' is-done' : ''}`}>
                  <span className="task-mark" aria-hidden="true">
                    {t.done ? <Icon name="check" size={16} /> : null}
                  </span>
                  <div className="task-body">
                    <p className="task-title">
                      {t.title}
                      <span className="sr-only">{t.done ? '（已完成）' : '（還沒完成）'}</span>
                    </p>
                    <p className="task-detail">{t.detail}</p>
                    {t.goal ? <Meter value={Math.min(t.value ?? 0, t.goal)} max={t.goal} label={`${t.title}進度`} /> : null}
                  </div>
                  {!t.done ? (
                    <Link className="btn btn-sm" to={t.to}>
                      {t.action}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
            {mistakes ? (
              <p className="small">
                <Link to="/mistakes">錯題本</Link>有 {mistakes} 題可以加強。
              </p>
            ) : null}
          </section>

          <section className="card home-card home-lesson" aria-labelledby="h-next">
            <p className="eyebrow">
              {next?.kind === 'course'
                ? `${levelName(next.level)} 課程 · 已完成 ${levelDone}/${levelCount}${unit ? ` · 第 ${unit.n} 單元「${unit.title}」` : ''}`
                : next
                  ? `五十音課程 · 已完成 ${kanaDone}/${KANA_LESSONS.length}`
                  : `課程 · 已完成 ${done} 課`}
            </p>
            {next ? (
              <>
                <h2 id="h-next">
                  第 {next.id} 課　<span lang="ja">{next.title}</span>
                </h2>
                <p className="muted">{next.headline}</p>
                <div className="lesson-dots" aria-hidden="true">
                  {unitLessons.map((l) => (
                    <span key={l.id} className={`ldot ${lessons.done[l.id] ? 'done' : ''} ${l.id === next.id ? 'now' : ''}`}>
                      {l.id}
                    </span>
                  ))}
                </div>
                <div className="btn-row">
                  <Link className="btn btn-primary" to={`/lessons/${next.id}`}>
                    {done === 0 && next.id === 1 ? '開始第 1 課' : `繼續第 ${next.id} 課`}
                    <Icon name="arrow-right" size={17} />
                  </Link>
                  {next.kind === 'kana' ? (
                    <Link className="btn" to={`/practice?lesson=${next.id}`}>
                      練這一課的假名
                    </Link>
                  ) : next.words.length ? (
                    <Link className="btn" to={`/review/lesson-${next.id}`}>
                      練這一課的單字
                    </Link>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <h2 id="h-next">課程全部學完了</h2>
                <p className="muted">
                  接下來做一次 N4 模擬考，看看每一科能不能答對七成；再每天複習單字卡，用 AI 家教練習會話，準備 {levelName(COURSE_LESSONS[COURSE_LESSONS.length - 1]?.level ?? 'n5')} 檢定。
                </p>
                <div className="btn-row">
                  <Link className="btn btn-primary" to="/mock">
                    做 N4 模擬考 <Icon name="arrow-right" size={17} />
                  </Link>
                  <Link className="btn" to="/vocab">
                    去背單字
                  </Link>
                  <Link className="btn" to="/tutor">
                    和 AI 家教聊天
                  </Link>
                </div>
              </>
            )}
          </section>

          <section className="card home-card" aria-labelledby="h-review">
            <div className="card-head">
              <h2 id="h-review">單字複習</h2>
              <Link to="/vocab" className="more">
                全部牌組
              </Link>
            </div>
            <div className="bignums">
              <div>
                <span className="bignum">{vocab.due}</span>
                <span className="bignum-l">張到期</span>
              </div>
              <div>
                <span className="bignum">{vocab.newLeft}</span>
                <span className="bignum-l">張新卡可學</span>
              </div>
              <div>
                <span className="bignum">{vocab.seen}</span>
                <span className="bignum-l">張學過</span>
              </div>
            </div>
            <ul className="deck-mini">
              {vocab.perDeck.map((d) => (
                <li key={d.deck.id}>
                  <Link to={`/review/${d.deck.id}`}>
                    <span>{d.deck.title}</span>
                    <span className={`pill ${d.due ? 'pill-accent' : ''}`}>{d.due ? `${d.due} 到期` : `${d.unseen} 張未學`}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {kanaDone < 6 && !courseDone ? <p className="small">建議先學完平假名（第 1–6 課）再開始背單字，看得懂假名會輕鬆很多。</p> : null}
          </section>
        </div>

        <div className="home-side">
          {needBackup ? (
            <section className="card home-card home-backup" aria-labelledby="h-backup">
              <h2 id="h-backup">記得備份學習紀錄</h2>
              <p className="muted">
                {sinceExport === null ? '你已經學了 ' + studyDays + ' 天，還沒匯出過備份。' : `上次匯出備份是 ${sinceExport} 天前。`}
                紀錄只存在這個瀏覽器，清除瀏覽資料或換裝置就會不見。
              </p>
              <div className="btn-row">
                <Link className="btn btn-sm" to="/settings">
                  去匯出備份
                </Link>
              </div>
            </section>
          ) : null}
          <section className="card home-card" aria-labelledby="h-kana">
            <div className="card-head">
              <h2 id="h-kana">假名熟悉度</h2>
              <Link to="/practice" className="more">
                去練習
              </Link>
            </div>
            <div className="meter-rows">
              <div className="meter-row">
                <span>平假名</span>
                <Meter value={hira} max={46} label="平假名熟悉" />
                <span className="num">{hira}/46</span>
              </div>
              <div className="meter-row">
                <span>片假名</span>
                <Meter value={kata} max={46} label="片假名熟悉" />
                <span className="num">{kata}/46</span>
              </div>
            </div>
            {weak.length ? (
              <>
                <p className="small">
                  最常答錯 · <Link to="/mistakes">到錯題本練這些字</Link>
                </p>
                <div className="weak">
                  {weak.map((ch) => (
                    <span key={ch} className={`wchip lv${kanaLevel(kana, (/[゠-ヿ]/.test(ch) ? 'k:' : 'h:') + ch)}`} lang="ja">
                      {ch}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="small">連續答對 3 次的字算「熟悉」。</p>
            )}
          </section>

          {toWrite.length ? (
            <section className="card home-card" aria-labelledby="h-write">
              <div className="card-head">
                <h2 id="h-write">手寫描字</h2>
                <Link to={writeLink()} className="more">
                  去寫字
                </Link>
              </div>
              <p className="muted">
                {writeWhat}寫過 {writeDone} 個
                {writeChars.length ? `，還有 ${writeChars.length} 個沒寫：` : '，全部寫過了。'}
              </p>
              {writeChars.length ? (
                <div className="weak">
                  {writeChars.slice(0, 10).map((ch) => (
                    <Link key={ch} to={writeLink(ch)} className="wchip" lang="ja">
                      {ch}
                    </Link>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="card home-card" aria-labelledby="h-tutor">
            <div className="card-head">
              <h2 id="h-tutor">AI 家教</h2>
              <Link to="/tutor" className="more">
                全部情境
              </Link>
            </div>
            {apiKey ? (
              <ul className="deck-mini">
                {suggested.map((s) => (
                  <li key={s.id}>
                    <Link to={`/tutor?scenario=${s.id}`}>
                      <span>{s.title}</span>
                      <span className="pill">{PURPOSE_LABEL[s.purpose]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                用 Claude 陪你練會話、批改句子。需要你自己的 Anthropic API 金鑰，<Link to="/tutor">設定方法</Link>。
              </p>
            )}
          </section>

          <section className="card home-card home-jlpt" aria-labelledby="h-jlpt">
            <h2 id="h-jlpt">JLPT 倒數</h2>
            {jlptDays === 0 ? (
              <p>
                今天就是 {jlptDate.getFullYear()} 年 {jlpt.month} 月的日本語能力試驗，加油！
              </p>
            ) : (
              <p>
                距離 {jlptDate.getFullYear()} 年 {jlpt.month} 月的日本語能力試驗還有 <b className="num">{jlptDays}</b> 天
              </p>
            )}
            <p className="small">
              考試日預計 {jlpt.month}/{jlptDate.getDate()}（週日），報名預計 {jlpt.month === 7 ? '3 月中下旬' : '8 月下旬前後'}
              ，以語言訓練測驗中心公告為準。<Link to="/roadmap">看學習地圖</Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
