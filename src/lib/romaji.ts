/**
 * 假名 → 羅馬拼音。
 * 規則：子音用平文式（shi、chi、tsu、fu、ji），母音照假名逐字寫出（べんとう → bentou，
 * 和電腦輸入法打字的方式一致）；片假名的長音符號「ー」寫成上橫線（コーヒー → kōhī）；
 * 促音っ重複下一個子音（きって → kitte，まっちゃ → matcha）；
 * ん 接母音或 y 時加撇號（こんや → kon'ya）；を 一律寫 o。
 */

const BASE: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'wi', ゑ: 'we', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
  ゃ: 'ya', ゅ: 'yu', ょ: 'yo', ゎ: 'wa',
};

const DIGRAPH: Record<string, string> = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo',
  しゃ: 'sha', しゅ: 'shu', しょ: 'sho',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
  みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  じゃ: 'ja', じゅ: 'ju', じょ: 'jo',
  ぢゃ: 'ja', ぢゅ: 'ju', ぢょ: 'jo',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
  // 外來語用的特殊組合
  てぃ: 'ti', でぃ: 'di', とぅ: 'tu', どぅ: 'du', てゅ: 'tyu', でゅ: 'dyu',
  ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo', ふゅ: 'fyu',
  うぃ: 'wi', うぇ: 'we', うぉ: 'wo',
  ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo',
  しぇ: 'she', じぇ: 'je', ちぇ: 'che',
  つぁ: 'tsa', つぃ: 'tsi', つぇ: 'tse', つぉ: 'tso',
  いぇ: 'ye', くぁ: 'kwa', ぐぁ: 'gwa',
};

const PUNCT: Record<string, string> = {
  '、': ', ', '。': '. ', '？': '? ', '！': '! ', '「': '"', '」': '"', '　': ' ', '・': ' ', '〜': '~', '～': '~',
};

const MACRON: Record<string, string> = { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' };

/** 片假名轉平假名（長音符號保留） */
export function toHiragana(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out += c >= 0x30a1 && c <= 0x30f6 ? String.fromCodePoint(c - 0x60) : ch;
  }
  return out;
}

/** 平假名轉片假名 */
export function toKatakana(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out += c >= 0x3041 && c <= 0x3096 ? String.fromCodePoint(c + 0x60) : ch;
  }
  return out;
}

type Tok = { kind: 'syl'; v: string } | { kind: 'sokuon' } | { kind: 'long' } | { kind: 'other'; v: string };

export function romaji(input: string): string {
  const s = toHiragana(input);
  const chars = Array.from(s);
  const toks: Tok[] = [];
  for (let i = 0; i < chars.length; i++) {
    const two = chars[i] + (chars[i + 1] ?? '');
    if (DIGRAPH[two]) { toks.push({ kind: 'syl', v: DIGRAPH[two] }); i++; continue; }
    const ch = chars[i];
    if (ch === 'っ') { toks.push({ kind: 'sokuon' }); continue; }
    if (ch === 'ー') { toks.push({ kind: 'long' }); continue; }
    // を 只當助詞用，前後空開：ほんを よむ → hon o yomu
    if (ch === 'を') { toks.push({ kind: 'other', v: ' o ' }); continue; }
    if (BASE[ch]) { toks.push({ kind: 'syl', v: BASE[ch] }); continue; }
    toks.push({ kind: 'other', v: PUNCT[ch] ?? ch });
  }
  let out = '';
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind === 'other') { out += t.v; continue; }
    if (t.kind === 'long') {
      const last = out.slice(-1);
      if (MACRON[last]) out = out.slice(0, -1) + MACRON[last];
      else if (last === 'n' || last === "'") out += '-';
      continue;
    }
    if (t.kind === 'sokuon') {
      const next = toks[i + 1];
      if (next && next.kind === 'syl' && /^[bcdfghjkmprstvwz]/.test(next.v)) {
        out += next.v.startsWith('ch') ? 't' : next.v[0];
      } else {
        out += "'";
      }
      continue;
    }
    // syllable
    if (t.v === 'n') {
      const next = toks[i + 1];
      out += next && next.kind === 'syl' && /^[aiueoy]/.test(next.v) ? "n'" : 'n';
      continue;
    }
    out += t.v;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** 是否只由假名（含小字、長音符號）組成 */
export function isKanaOnly(s: string): boolean {
  return /^[ぁ-ゖァ-ヺー]+$/.test(s);
}
