/**
 * 課程第 9 課起的日文句子格式（JaText）：漢字後面用《》標讀音，顯示成振假名（ruby）。
 *
 *   私《わたし》は台湾人《たいわんじん》です。
 *   食《た》べます            → 讀音標在《前面連續的漢字上（含 々）
 *   ｜日本《にほん》語《ご》   → 要從一串漢字的中間開始標時，在開頭加｜（通常不需要）
 *   〔名詞〕は〔名詞〕です     → 〔〕是句型的空格（顯示成框，不念）
 *   ⟦荷物⟧を届けます          → ⟦⟧是考題要考的詞：加底線。裡面沒有《》時不標讀音（考漢字的念法、寫法），
 *   ⟦荷物《にもつ》⟧           → 有《》時照樣標讀音（考意思、用法）。只用在選擇題。
 *
 * 一般說明文字（Inline）裡也可以用同樣的寫法，見 components/Rich.tsx。
 */

export type JaText = string;

export type JaSeg =
  /** 一般文字（假名、標點、沒標讀音的字）；u：考題要考的詞（⟦⟧，加底線） */
  | { t: string; u?: true }
  /** 標了讀音的漢字 */
  | { t: string; r: string; u?: true }
  /** 句型的空格，例如〔名詞〕 */
  | { slot: string };

const KANJI = /[㐀-䶿一-鿿豈-﫿々〆ヶ]/u;
const KANJI_RUN_END = /[㐀-䶿一-鿿豈-﫿々〆ヶ]+$/u;

export const isKanji = (ch: string) => KANJI.test(ch);

/**
 * 拆成一段一段。格式錯誤（《》沒成對、《前面沒有漢字、讀音裡有漢字）時丟出錯誤，測試會抓出來。
 */
export function parseJa(text: JaText): JaSeg[] {
  const out: JaSeg[] = [];
  let buf = '';
  /** ｜標的開頭在 buf 裡的位置 */
  let mark = -1;
  const flush = () => {
    if (buf) out.push({ t: buf });
    buf = '';
    mark = -1;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '｜') {
      mark = buf.length;
      continue;
    }
    if (c === '《') {
      const end = text.indexOf('》', i + 1);
      if (end < 0) throw new Error(`《 沒有對應的 》：${text}`);
      const reading = text.slice(i + 1, end);
      if (!reading || /[《〔｜]/.test(reading) || [...reading].some(isKanji)) throw new Error(`讀音不對：《${reading}》（${text}）`);
      let base: string;
      if (mark >= 0) {
        base = buf.slice(mark);
        buf = buf.slice(0, mark);
      } else {
        base = KANJI_RUN_END.exec(buf)?.[0] ?? '';
        buf = buf.slice(0, buf.length - base.length);
      }
      if (!base) throw new Error(`《${reading}》前面沒有漢字：${text}`);
      if (buf) out.push({ t: buf });
      out.push({ t: base, r: reading });
      buf = '';
      mark = -1;
      i = end;
      continue;
    }
    if (c === '》') throw new Error(`多了 》：${text}`);
    if (c === '⟦') {
      const end = text.indexOf('⟧', i + 1);
      if (end < 0 || end === i + 1) throw new Error(`⟦ 沒有對應的 ⟧：${text}`);
      if (mark >= 0) throw new Error(`｜後面沒有《讀音》：${text}`);
      const inner = text.slice(i + 1, end);
      if (/[⟦〔]/.test(inner)) throw new Error(`⟦⟧ 裡面不能再有 ⟦ 或 〔：${text}`);
      flush();
      for (const seg of parseJa(inner)) if (!('slot' in seg)) out.push({ ...seg, u: true });
      i = end;
      continue;
    }
    if (c === '⟧') throw new Error(`多了 ⟧：${text}`);
    if (c === '〔') {
      const end = text.indexOf('〕', i + 1);
      if (end < 0) throw new Error(`〔 沒有對應的 〕：${text}`);
      flush();
      out.push({ slot: text.slice(i + 1, end) });
      i = end;
      continue;
    }
    buf += c;
  }
  if (mark >= 0) throw new Error(`｜後面沒有《讀音》：${text}`);
  flush();
  return out;
}

/** 顯示的文字（漢字照寫，讀音拿掉；空格寫成〔名詞〕） */
export function jaPlain(text: JaText): string {
  return parseJa(text)
    .map((s) => ('slot' in s ? `〔${s.slot}〕` : s.t))
    .join('');
}

/** 全部用假名寫的讀音（標了讀音的漢字換成讀音；空格拿掉） */
export function jaReading(text: JaText): string {
  return parseJa(text)
    .map((s) => ('slot' in s ? '' : 'r' in s ? s.r : s.t))
    .join('');
}

/** 文字裡沒有標讀音的漢字（課文的漢字都要標讀音，測試用） */
export function bareKanji(text: JaText): string[] {
  const out: string[] = [];
  // ⟦⟧ 裡沒標讀音的字是故意的（考漢字的念法、寫法）
  for (const s of parseJa(text)) if (!('slot' in s) && !('r' in s) && !s.u) for (const ch of s.t) if (isKanji(ch)) out.push(ch);
  return out;
}

/** 標了讀音的詞：[漢字, 讀音] */
export function rubyPairs(text: JaText): [string, string][] {
  return parseJa(text).flatMap((s) => ('r' in s ? [[s.t, s.r] as [string, string]] : []));
}

/**
 * 念的時候改念《》裡讀音的詞：語音引擎常選錯念法的（同一個寫法有好幾種念法）。
 * 其他漢字詞照寫給語音引擎：它看得到詞，助詞 は、へ 和重音比較準；也不會和前後的假名黏成別的詞
 * （「母は」念讀音會變成「ははは」、「午後8時」變成「午後はちじ」都可能念錯）。
 */
const SAY_READING = new Set([
  ...['今日', '明日', '昨日', '今朝', '一日', '二十日', '二十歳', '十分', '一昨日', '明後日'],
  // 紅葉 こうよう／もみじ、梅雨 つゆ／ばいう、上手 じょうず／うわて、下手 へた／しもて
  ...['紅葉', '梅雨', '上手', '下手'],
  // 人気 にんき／ひとけ、市場 いちば／しじょう、一時 いちじ／いっとき、大家 おおや／たいか
  ...['人気', '市場', '一時', '大家'],
  // 今日中 きょうじゅう（語音可能念成 こんにちちゅう）、鶏肉 とりにく／けいにく
  ...['今日中', '鶏肉'],
]);
/**
 * 單一個漢字、念法很多的（私 可能念成 わたくし、何 有 なに／なん、方 有 ほう／かた、
 * 家 有 いえ／うち；降ります 有 ふります（下雨）／おります（下車）；開く 有 あく／ひらく、止める 有 とめる／やめる、
 * 他 有 ほか／た、床 有 ゆか／とこ、訳 有 わけ／やく…）。
 * 袋 有 ふくろ／ぶくろ（非常持《ひじょうも》ち出《だ》し袋《ぶくろ》）。
 * 日 不放：「日《ひ》の出《で》」念成「ひの出」反而奇怪，照寫「日の出」語音念得對。
 */
const SAY_READING_SINGLE = new Set([...'私何方間後前上下中外空生金角辛今家降開止他床訳袋']);

function sayReading(base: string, reading: string): boolean {
  return (
    SAY_READING.has(base) ||
    // 讀音標片假名的（台北《タイペイ》、台中《タイチュウ》）：照外語念，語音引擎會用日文的音讀念成 たいほく
    /^[ァ-ヺー]+$/.test(reading) ||
    // 何 開頭的詞（何時、何人、何分 なんぷん／なにぶん…）
    base.startsWith('何') ||
    // 數字＋日（｜1日《いちにち》、｜1日《ついたち》）：同一個寫法有兩種念法
    /^[0-9０-９,，]+日$/.test(base) ||
    ([...base].length === 1 && SAY_READING_SINGLE.has(base))
  );
}

/**
 * 範圍的〜（午前9時〜12時、12月8日〜10日、3〜4人）：前面是數字（可以接時、日、月這類單位）、後面是數字，念「から」。
 * 其他的〜是句型的空位（〜さん、〔名詞〕〜です），不念。
 */
const RANGE_BEFORE = /[0-9０-９〇一二三四五六七八九十百千万](?:時間?|時半|日間?|か月|ヶ月|月|年|分|秒|円|歳|階|回|人|本|枚|個|度|週間)?$/u;
const RANGE_AFTER = /^[0-9０-９〇一二三四五六七八九十百千万]/u;

/**
 * 語音要念的文字：漢字照寫，容易念錯的詞（見 SAY_READING）改念讀音；空格、句型的〜 不念，範圍的〜念「から」。
 */
export function jaSpeech(text: JaText): string {
  const segs = parseJa(text);
  // 每一段畫面上的字：判斷〜的前後是不是數字（標了讀音的詞看寫法，例如 ｜8日《ようか》 是「8日」）
  const shown = segs.map((s) => ('slot' in s ? '〔〕' : s.t));
  const out = segs
    .map((s, k) => {
      if ('slot' in s) return '';
      if ('r' in s) return sayReading(s.t, s.r) ? s.r : s.t;
      return s.t.replace(/[〜～]/g, (_m, at: number) => {
        const before = shown.slice(0, k).join('') + s.t.slice(0, at);
        const after = s.t.slice(at + 1) + shown.slice(k + 1).join('');
        return RANGE_BEFORE.test(before) && RANGE_AFTER.test(after) ? 'から' : '';
      });
    })
    .join('')
    .replace(/[〜～]/g, '')
    .trim();
  // 句型「〜は〜です」「〔名詞〕へ行きます」拿掉空格後是助詞開頭：照助詞的念法（單獨的 は 會被念成 ha）
  return /^[〜～〔]/.test(text.trim()) ? out.replace(/^は/, 'わ').replace(/^へ/, 'え') : out;
}

/**
 * 單字要念的文字：念讀音（和單字卡一樣；同一個漢字常有好幾種念法），「〜さん」的〜不念。
 * 讀音是 は、へ 開頭的漢字詞（八、母、話、花…）念漢字：單獨念「はち」「はは」，有的語音會把 は 當成助詞念成 wa。
 */
export function wordSay(ja: JaText): string {
  const r = jaReading(ja).replace(/[〜～]/g, '').trim();
  // 〜杯、〜本 這種接在數字後面的詞：單獨一個漢字沒有前後文（杯 可能念成 さかずき），念讀音
  if (/^[〜～]/.test(ja.trim())) return r;
  return /^[はへ]/.test(r) && /\p{Script=Han}/u.test(ja) ? jaPlain(ja).replace(/[〜～]/g, '').trim() : r;
}

/**
 * 說明文字裡 [[ ]] 的念法。只有一個標了讀音的詞（[[十《とお》]]、[[〜人《にん》]]、[[魚屋《さかなや》]]）
 * 和單字一樣念讀音：沒有前後文，語音不知道單一個漢字要用哪一個念法；句子、句型用 jaSpeech。
 */
export function inlineSay(text: JaText): string {
  const segs = parseJa(text.trim().replace(/^[〜～]+|[〜～]+$/g, ''));
  return segs.length === 1 && 'r' in segs[0] ? wordSay(text) : jaSpeech(text);
}

/** 文字裡出現的漢字（不重複，照出現順序） */
export function kanjiOf(text: string): string[] {
  return [...new Set([...text].filter(isKanji))];
}
