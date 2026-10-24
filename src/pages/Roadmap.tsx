import { Link } from 'react-router-dom';
import { lessonStore } from '../state';
import { useStore } from '../state/store';
import { kanaLessonsDone } from '../lib/progress';
import { KANA_LESSONS, levelLessons } from '../data/lessons/meta';
import { usePageTitle } from '../lib/title';

const PHASES = [
  {
    when: '第 1–2 週',
    title: '五十音與發音',
    body: '平假名 → 濁音、半濁音 → 拗音、促音、長音 → 片假名。對應這裡的第 1–8 課。',
    goal: '看到假名不靠羅馬拼音，就能直接念出來。',
  },
  {
    when: '第 3 週～第 4 個月',
    title: '初級前半（約 N5）',
    body: '這裡的第 9–32 課（N5 初級），每週約 2 課：會話、文法、單字、漢字和練習題。單字每天用單字卡複習，會話跟著念。想多讀多聽，可以搭配《いろどり》入門、初級 1 或《大家的日本語》第 1–20 課。',
    goal: '能自我介紹、買東西、問路，說明時間和日程。',
  },
  {
    when: '第 5～9 個月',
    title: '初級後半（約 N4）',
    body: '這裡的第 33–56 課（N4），每週約 2 課：可能形、被動、使役等動詞變化，條件句，以及職場敬語入門；每個單元最後有小測驗。想多讀多聽，可以搭配《いろどり》初級 2 或《大家的日本語》第 26–50 課。加入固定的聽力練習，考前兩個月開始做模擬題（這裡有一份 N4 模擬考，也可以做 JLPT 官方樣題）。',
    goal: '聽懂慢速的日常對話，讀懂簡單的短文。',
  },
  {
    when: '第 10 個月起',
    title: '中級（N3）與大量輸入',
    body: '中級文法和單字書，搭配有日文字幕的影片和簡易新聞，慢慢拿掉中文字幕。',
    goal: '看得懂生活情境的日文內容，開始能用日文聊天。',
  },
];

const RESOURCES = [
  {
    group: '主教材（選一套）',
    items: [
      { name: '《大家的日本語》改訂版', free: false, tag: '付費', text: '台灣自學者最常用的系統教材，初級加進階共 4 冊 50 課。課本、文法解說、練習題分開賣，整套買比較貴，可以找二手。', meta: '大新書局' },
      { name: '《いろどり 生活の日本語》', url: 'https://www.irodori.jpf.go.jp/', free: true, tag: '免費', text: '日本國際交流基金的線上教材，PDF 和 MP3 全部免費下載。分入門（A1）、初級 1、初級 2（A2），2026 年 3 月新增初中級。內容偏生活與職場會話。', meta: '國際交流基金' },
    ],
  },
  {
    group: '影片',
    items: [
      { name: '出口日語', url: 'https://www.youtube.com/channel/UCDqWakN_owifqIBqyNjg6kg', free: true, tag: '免費', text: '在台灣教日文多年的出口仁老師的頻道，有《大家的日本語》改訂版逐課文法解說，也有基礎發音影片。', meta: 'YouTube' },
      { name: '井上老師《從零開始學日文》', url: 'https://www.youtube.com/results?search_query=%E4%BA%95%E4%B8%8A%E8%80%81%E5%B8%AB+%E5%BE%9E%E9%9B%B6%E9%96%8B%E5%A7%8B%E5%AD%B8%E6%97%A5%E6%96%87', free: true, tag: '免費', text: '22 堂入門課。看真人的嘴型學發音，避免用中文的發音習慣去念日文。', meta: 'YouTube' },
    ],
  },
  {
    group: '聽力與工具',
    items: [
      { name: 'NHK「Easy Japanese」', url: 'https://www.nhk.or.jp/lesson/en/', free: true, tag: '免費', text: 'NHK WORLD-JAPAN 的入門課程，48 課短劇串成一個故事，有 18 種語言版本，程度約 A1–A2。進入初級後每天聽一課。', meta: 'NHK WORLD-JAPAN' },
      { name: 'Anki', url: 'https://apps.ankiweb.net/', free: true, tag: '電腦、Android 免費', text: '間隔重複記憶卡的標準工具。這裡的單字卡用的是同樣的原理。', meta: '電腦、Android、iPhone' },
    ],
  },
];

// title 用標題字型顯示（建置時裁字型會把 title 欄位的字分到這一頁，見 scripts/nk-fonts.mjs）
const TIPS = [
  { title: '漢字是優勢', body: '很多漢字詞看了就懂，閱讀起步比其他人快。但讀音要另外記，一個漢字常有好幾種念法。' },
  { title: '同字不同義', body: '手紙是「信」、勉強是「讀書」、大丈夫是「沒問題」、娘是「女兒」、湯是「熱水」。' },
  { title: '清音聽起來像濁音', body: '日文的 k、t 在詞中送氣較弱，わたし 的 た 在中文耳朵裡像「ㄉㄚ」。分辨清濁要聽聲帶有沒有振動。' },
  { title: '長音、促音會改變意思', body: 'おばさん（阿姨）和 おばあさん（奶奶）、きて（來）和 きって（郵票），差一拍就是不同的字。' },
  { title: '重音是高低，不是四聲', body: '日文用音高區分，例如 あめ 可以是「雨」也可以是「糖果」。初學先模仿音檔，不必急著背規則。' },
  { title: '盡早丟掉羅馬拼音', body: '羅馬拼音只是入門的拐杖。五十音熟了以後，單字直接用假名記。' },
];

export default function Roadmap() {
  usePageTitle('學習地圖');
  const progress = useStore(lessonStore);
  const kanaDone = kanaLessonsDone(progress);
  const n5 = levelLessons('n5');
  const n4 = levelLessons('n4');
  const n5Done = n5.filter((l) => progress.done[l.id]).length;
  const n4Done = n4.filter((l) => progress.done[l.id]).length;
  const phaseNow = kanaDone < KANA_LESSONS.length ? 0 : n5Done < n5.length ? 1 : n4Done < n4.length ? 2 : 3;

  return (
    <div className="wrap">
      <header className="ph">
        <p className="eyebrow">學習地圖</p>
        <h1>從零到 N4 的自學路線</h1>
        <p className="lede">以每天 30～45 分鐘、自學為前提排的路線。時間是參考值，卡住就放慢，不必硬趕。</p>
      </header>

      <section className="block" aria-labelledby="h-phases">
        <h2 id="h-phases">四個階段</h2>
        <ol className="phases">
          {PHASES.map((p, i) => (
            <li key={p.title} className={`phase ${i === phaseNow ? 'is-now' : ''}`}>
              <div className="ph-when">
                <span className="ph-n" aria-hidden="true">
                  {i + 1}
                </span>
                {p.when}
              </div>
              <div className="ph-body">
                <h3>
                  {p.title} {i === phaseNow ? <span className="now-pill">你在這裡</span> : null}
                </h3>
                <p>{p.body}</p>
                <p className="ph-goal">
                  <b>目標</b>
                  {p.goal}
                </p>
                {i === 0 ? (
                  <p className="small">
                    五十音課程已完成 {kanaDone}/{KANA_LESSONS.length} 課。<Link to="/lessons">看課程</Link>
                  </p>
                ) : null}
                {i === 1 && n5.length ? (
                  <p className="small">
                    N5 課程已完成 {n5Done}/{n5.length} 課。<Link to="/lessons">看課程</Link>
                  </p>
                ) : null}
                {i === 2 && n4.length ? (
                  <p className="small">
                    N4 課程已完成 {n4Done}/{n4.length} 課。<Link to="/lessons">看課程</Link>　學完以後做
                    <Link to="/mock">N4 模擬考</Link>，檢查每一科能不能答對七成。
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        <p className="small">參考案例：有網友 2 月底開始背五十音，用《大家的日本語》先每週 1 課、後期每週 2 課，同年 12 月考過 N4，前後大約 9 個月。</p>
      </section>

      <section className="block" aria-labelledby="h-daily">
        <h2 id="h-daily">每天 45 分鐘怎麼分</h2>
        <div className="daybar" role="img" aria-label="每天 45 分鐘：複習 10 分、新進度 20 分、聽力跟讀 10 分、手寫 5 分">
          <div className="db-seg s1" style={{ flex: 10 }}>
            <b>複習</b>
            <span>10 分</span>
          </div>
          <div className="db-seg s2" style={{ flex: 20 }}>
            <b>新進度</b>
            <span>20 分</span>
          </div>
          <div className="db-seg s3" style={{ flex: 10 }}>
            <b>聽＋跟讀</b>
            <span>10 分</span>
          </div>
          <div className="db-seg s4" style={{ flex: 5 }}>
            <b>手寫</b>
            <span>5 分</span>
          </div>
        </div>
        <ul className="db-legend">
          <li>
            <i className="sw s1" />
            <span>
              <b>複習</b>先做今天到期的<Link to="/vocab">單字卡</Link>。記住單字靠的是隔幾天再見一次，不是一次背很多。
            </span>
          </li>
          <li>
            <i className="sw s2" />
            <span>
              <b>新進度</b>一課拆成兩天：第一天單字和文法，第二天會話和練習題。
            </span>
          </li>
          <li>
            <i className="sw s3" />
            <span>
              <b>聽＋跟讀</b>播課文音檔，慢半拍跟著念（影子跟讀法）；也可以用<Link to="/tutor">AI 家教</Link>練對話。
            </span>
          </li>
          <li>
            <i className="sw s4" />
            <span>
              <b>手寫</b>抄今天的單字或例句，假名可以用<Link to="/writing">手寫描字</Link>練筆順。
            </span>
          </li>
        </ul>
      </section>

      <section className="block" aria-labelledby="h-jlpt">
        <h2 id="h-jlpt">檢定時程（JLPT 台灣考區）</h2>
        <p>日本語能力試驗在台灣由語言訓練測驗中心（LTTC）承辦，每年 7 月和 12 月的第一個週日各考一次，紙筆作答，共五級，N1 最難、N5 最簡單。</p>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="JLPT 時程表（可左右捲動）">
          <table className="jlpt">
            <thead>
              <tr>
                <th scope="col">場次</th>
                <th scope="col">考試日</th>
                <th scope="col">報名期間</th>
                <th scope="col">建議</th>
              </tr>
            </thead>
            <tbody>
              <tr className="is-past">
                <td>2026 年 12 月</td>
                <td>12/6（日）</td>
                <td>已截止</td>
                <td>
                  <span className="pill">來不及</span>
                </td>
              </tr>
              <tr className="is-target">
                <td>2027 年 7 月</td>
                <td>預計 7/4（日）</td>
                <td>預計 3 月中下旬（2026 年同場為 3/16–3/31）</td>
                <td>
                  <span className="pill pill-accent">目標</span>
                </td>
              </tr>
              <tr>
                <td>2027 年 12 月</td>
                <td>預計 12/5（日）</td>
                <td>預計 8 月中～9 月初</td>
                <td>
                  <span className="pill">備案</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="facts">
          <li>報名費（2026 年起）：N4、N5 為 NT$1,650；N1–N3 為 NT$1,800。</li>
          <li>考場：台北、桃園、台中、高雄。合格成績單會加註 CEFR 等級：N5 對應 A1、N4 對應 A2。</li>
          <li>2027 年的日期尚未公告，表中是依每年固定的規律推估，報名前以 LTTC 官網公告為準。</li>
        </ul>
        <p className="advice">
          <b>建議</b>照這份路線走，2027 年 3 月報名時剛好讀到初級後半。進度順利就報 N4；覺得吃緊就先考 N5，熟悉考試節奏。
        </p>
      </section>

      <section className="block" aria-labelledby="h-res">
        <h2 id="h-res">搭配的教材與資源</h2>
        {RESOURCES.map((g) => (
          <div key={g.group} className="res-group">
            <h3>{g.group}</h3>
            <div className="res-list">
              {g.items.map((r) => (
                <article key={r.name} className="res card">
                  <div className="res-top">
                    <p className="res-name">
                      {'url' in r && r.url ? (
                        <a href={r.url} target="_blank" rel="noopener noreferrer">
                          {r.name}
                        </a>
                      ) : (
                        r.name
                      )}
                    </p>
                    <span className={`tag ${r.free ? 'tag-free' : ''}`}>{r.tag}</span>
                  </div>
                  <p>{r.text}</p>
                  <p className="res-meta">{r.meta}</p>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="block" aria-labelledby="h-tips">
        <h2 id="h-tips">中文母語者的優勢與陷阱</h2>
        <dl className="tips">
          {TIPS.map((t) => (
            <div key={t.title}>
              <dt>{t.title}</dt>
              <dd>{t.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="block sources" aria-labelledby="h-src">
        <h2 id="h-src">資料來源</h2>
        <ul>
          <li>
            <a href="https://news.stust.edu.tw/id/92714" target="_blank" rel="noopener noreferrer">
              2026 年 7 月 JLPT 報名期間與報名費（LTTC 公告轉知）
            </a>
          </li>
          <li>
            <a href="https://www.lttc.ntu.edu.tw/files/20221103133203974.pdf" target="_blank" rel="noopener noreferrer">
              LTTC：日本語能力試驗與日本留學試驗比較
            </a>
          </li>
          <li>
            <a href="https://udn.com/news/story/6885/8941418" target="_blank" rel="noopener noreferrer">
              中央社：JLPT 台灣考場與 CEFR 對照
            </a>
          </li>
          <li>
            <a href="https://jlpt.jp/sp/e/" target="_blank" rel="noopener noreferrer">
              JLPT 官方網站：2026 年考試日期
            </a>
          </li>
          <li>
            <a href="https://www.irodori.jpf.go.jp/" target="_blank" rel="noopener noreferrer">
              いろどり 生活の日本語（國際交流基金）
            </a>
          </li>
          <li>
            <a href="https://www.dcard.tw/f/japanese/p/257960525" target="_blank" rel="noopener noreferrer">
              Dcard：自學 9 個月考過 N4 的資源分享
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
