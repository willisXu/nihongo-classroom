import type { KanaCell, KanaRow, Script } from './types';

/** 清音（五十音） */
export const SEION_ROWS: KanaRow[] = [
  {
    id: 'a', label: 'あ行', kLabel: 'ア行', cells: [
      { h: 'あ', k: 'ア', r: 'a', zy: 'ㄚ', ho: '安', ko: '阿', tip: '像「啊」，嘴巴自然張開。', ex: ['あさ', '早上'], kx: ['アイス', '冰淇淋'] },
      { h: 'い', k: 'イ', r: 'i', zy: 'ㄧ', ho: '以', ko: '伊', tip: '像「衣」，嘴角往兩邊拉。', ex: ['いえ', '家'], kx: ['イギリス', '英國'] },
      { h: 'う', k: 'ウ', r: 'u', zy: 'ㄨ', ho: '宇', ko: '宇', tip: '像「烏」，但嘴唇放鬆，不要嘟起來。', ex: ['うえ', '上面'], kx: ['ウイスキー', '威士忌'] },
      { h: 'え', k: 'エ', r: 'e', zy: 'ㄝ', ho: '衣', ko: '江', tip: '像「欸」，嘴巴比 あ 小一點。', ex: ['えき', '車站'], kx: ['エアコン', '冷氣'] },
      { h: 'お', k: 'オ', r: 'o', zy: 'ㄛ', ho: '於', ko: '於', tip: '像「喔」，嘴唇圓。', ex: ['おかし', '零食'], kx: ['オレンジ', '柳橙'] },
    ],
  },
  {
    id: 'k', label: 'か行', kLabel: 'カ行', cells: [
      { h: 'か', k: 'カ', r: 'ka', zy: 'ㄎㄚ', ho: '加', ko: '加', tip: '像「咖」。在詞的中間送氣比較弱，聽起來像「嘎」。', ex: ['かさ', '雨傘'], kx: ['カメラ', '相機'] },
      { h: 'き', k: 'キ', r: 'ki', zy: 'ㄎㄧ', ho: '幾', ko: '幾', tip: 'ㄎ 接 ㄧ，用舌根發音，不要念成「七」。', ex: ['きく', '聽'], kx: ['キロ', '公斤；公里'] },
      { h: 'く', k: 'ク', r: 'ku', zy: 'ㄎㄨ', ho: '久', ko: '久', tip: 'ㄎ 接扁唇的 う。', ex: ['くすり', '藥'], kx: ['クラス', '班級'] },
      { h: 'け', k: 'ケ', r: 'ke', zy: 'ㄎㄝ', ho: '計', ko: '介', tip: 'ㄎ 接 ㄝ。', ex: ['けさ', '今天早上'], kx: ['ケーキ', '蛋糕'] },
      { h: 'こ', k: 'コ', r: 'ko', zy: 'ㄎㄛ', ho: '己', ko: '己', tip: 'ㄎ 接 ㄛ。', ex: ['ここ', '這裡'], kx: ['コーヒー', '咖啡'] },
    ],
  },
  {
    id: 's', label: 'さ行', kLabel: 'サ行', cells: [
      { h: 'さ', k: 'サ', r: 'sa', zy: 'ㄙㄚ', ho: '左', ko: '散', tip: '像「撒」。', ex: ['さけ', '酒；鮭魚'], kx: ['サラダ', '沙拉'] },
      { h: 'し', k: 'シ', r: 'shi', zy: 'ㄒㄧ', ho: '之', ko: '之', tip: '像「西」。拼音寫 shi，但不是英文 she 的音。', ex: ['しお', '鹽'], kx: ['シール', '貼紙'] },
      { h: 'す', k: 'ス', r: 'su', zy: 'ㄙㄨ', ho: '寸', ko: '須', tip: 'ㄙ 接扁唇的 う。在 です、ます 的句尾常輕到只剩 s。', ex: ['すし', '壽司'], kx: ['スーパー', '超市'] },
      { h: 'せ', k: 'セ', r: 'se', zy: 'ㄙㄝ', ho: '世', ko: '世', tip: 'ㄙ 接 ㄝ。', ex: ['せかい', '世界'], kx: ['セーター', '毛衣'] },
      { h: 'そ', k: 'ソ', r: 'so', zy: 'ㄙㄛ', ho: '曽', hoTc: '曾', ko: '曽', koTc: '曾', tip: 'ㄙ 接 ㄛ。', ex: ['そら', '天空'], kx: ['ソース', '醬汁'] },
    ],
  },
  {
    id: 't', label: 'た行', kLabel: 'タ行', cells: [
      { h: 'た', k: 'タ', r: 'ta', zy: 'ㄊㄚ', ho: '太', ko: '多', tip: '像「他」。在詞中送氣比較弱，聽起來接近「搭」。', ex: ['たまご', '蛋'], kx: ['タオル', '毛巾'] },
      { h: 'ち', k: 'チ', r: 'chi', zy: 'ㄑㄧ', ho: '知', ko: '千', tip: '像「七」，但送氣比較弱。', ex: ['ちず', '地圖'], kx: ['チーズ', '起司'] },
      { h: 'つ', k: 'ツ', r: 'tsu', zy: 'ㄘㄨ', ho: '川', ko: '川', tip: '像「粗」，但嘴唇不要嘟。中文沒有完全一樣的音，多聽幾次。', ex: ['つくえ', '書桌'], kx: ['ツアー', '旅行團'] },
      { h: 'て', k: 'テ', r: 'te', zy: 'ㄊㄝ', ho: '天', ko: '天', tip: 'ㄊ 接 ㄝ。', ex: ['て', '手'], kx: ['テレビ', '電視'] },
      { h: 'と', k: 'ト', r: 'to', zy: 'ㄊㄛ', ho: '止', ko: '止', tip: 'ㄊ 接 ㄛ。', ex: ['とけい', '時鐘'], kx: ['トマト', '番茄'] },
    ],
  },
  {
    id: 'n', label: 'な行', kLabel: 'ナ行', cells: [
      { h: 'な', k: 'ナ', r: 'na', zy: 'ㄋㄚ', ho: '奈', ko: '奈', tip: '像「那」。', ex: ['なつ', '夏天'], kx: ['ナイフ', '刀子'] },
      { h: 'に', k: 'ニ', r: 'ni', zy: 'ㄋㄧ', ho: '仁', ko: '二', tip: '像「你」。', ex: ['にく', '肉'], kx: ['テニス', '網球'] },
      { h: 'ぬ', k: 'ヌ', r: 'nu', zy: 'ㄋㄨ', ho: '奴', ko: '奴', tip: 'ㄋ 接扁唇的 う。', ex: ['いぬ', '狗'], kx: ['カヌー', '獨木舟'] },
      { h: 'ね', k: 'ネ', r: 'ne', zy: 'ㄋㄝ', ho: '祢', hoTc: '禰', ko: '祢', koTc: '禰', tip: 'ㄋ 接 ㄝ。', ex: ['ねこ', '貓'], kx: ['ネクタイ', '領帶'] },
      { h: 'の', k: 'ノ', r: 'no', zy: 'ㄋㄛ', ho: '乃', ko: '乃', tip: 'ㄋ 接 ㄛ。', ex: ['のみもの', '飲料'], kx: ['ノート', '筆記本'] },
    ],
  },
  {
    id: 'h', label: 'は行', kLabel: 'ハ行', cells: [
      { h: 'は', k: 'ハ', r: 'ha', zy: 'ㄏㄚ', ho: '波', ko: '八', tip: '像「哈」，氣從喉嚨輕輕送出，不要刮喉嚨。', ex: ['はな', '花'], kx: ['ハム', '火腿'] },
      { h: 'ひ', k: 'ヒ', r: 'hi', zy: 'ㄏㄧ', ho: '比', ko: '比', tip: 'ㄏ 接 ㄧ，氣比較強，接近「希」。', ex: ['ひと', '人'], kx: ['ヒーター', '暖氣機'] },
      { h: 'ふ', k: 'フ', r: 'fu', zy: '', ho: '不', ko: '不', tip: '不是ㄈ。上下唇靠近，像吹蠟燭一樣輕輕吹氣，牙齒不碰嘴唇。', ex: ['ふね', '船'], kx: ['フルーツ', '水果'] },
      { h: 'へ', k: 'ヘ', r: 'he', zy: 'ㄏㄝ', ho: '部', ko: '部', tip: 'ㄏ 接 ㄝ。', ex: ['へや', '房間'], kx: ['ヘルメット', '安全帽'] },
      { h: 'ほ', k: 'ホ', r: 'ho', zy: 'ㄏㄛ', ho: '保', ko: '保', tip: 'ㄏ 接 ㄛ。', ex: ['ほし', '星星'], kx: ['ホテル', '飯店'] },
    ],
  },
  {
    id: 'm', label: 'ま行', kLabel: 'マ行', cells: [
      { h: 'ま', k: 'マ', r: 'ma', zy: 'ㄇㄚ', ho: '末', ko: '末', tip: '像「媽」。', ex: ['まど', '窗戶'], kx: ['マスク', '口罩'] },
      { h: 'み', k: 'ミ', r: 'mi', zy: 'ㄇㄧ', ho: '美', ko: '三', tip: '像「咪」。', ex: ['みず', '水'], kx: ['ミルク', '牛奶'] },
      { h: 'む', k: 'ム', r: 'mu', zy: 'ㄇㄨ', ho: '武', ko: '牟', tip: 'ㄇ 接扁唇的 う。', ex: ['むし', '蟲'], kx: ['ゲーム', '遊戲'] },
      { h: 'め', k: 'メ', r: 'me', zy: 'ㄇㄝ', ho: '女', ko: '女', tip: 'ㄇ 接 ㄝ。', ex: ['め', '眼睛'], kx: ['メール', '電子郵件'] },
      { h: 'も', k: 'モ', r: 'mo', zy: 'ㄇㄛ', ho: '毛', ko: '毛', tip: '像「摸」。', ex: ['もも', '桃子'], kx: ['メモ', '筆記'] },
    ],
  },
  {
    id: 'y', label: 'や行', kLabel: 'ヤ行', cells: [
      { h: 'や', k: 'ヤ', r: 'ya', zy: 'ㄧㄚ', ho: '也', ko: '也', tip: '像「鴨」。', ex: ['やま', '山'], kx: ['タイヤ', '輪胎'] },
      null,
      { h: 'ゆ', k: 'ユ', r: 'yu', zy: 'ㄧㄨ', ho: '由', ko: '由', tip: 'ㄧ 接扁唇的 う，不是「魚」的ㄩ。', ex: ['ゆき', '雪'], kx: ['ユーモア', '幽默'] },
      null,
      { h: 'よ', k: 'ヨ', r: 'yo', zy: 'ㄧㄛ', ho: '与', hoTc: '與', ko: '与', koTc: '與', tip: '像「喲」。', ex: ['よる', '晚上'], kx: ['ヨーグルト', '優格'] },
    ],
  },
  {
    id: 'r', label: 'ら行', kLabel: 'ラ行', cells: [
      { h: 'ら', k: 'ラ', r: 'ra', zy: 'ㄌㄚ', ho: '良', ko: '良', tip: '舌尖在上排牙齒後方輕彈一下，介於ㄌ和ㄉ之間，不是英文的 r。', ex: ['らいねん', '明年'], kx: ['ラーメン', '拉麵'] },
      { h: 'り', k: 'リ', r: 'ri', zy: 'ㄌㄧ', ho: '利', ko: '利', tip: '彈舌的 r 接 ㄧ。', ex: ['りんご', '蘋果'], kx: ['リモコン', '遙控器'] },
      { h: 'る', k: 'ル', r: 'ru', zy: 'ㄌㄨ', ho: '留', ko: '流', tip: '彈舌的 r 接扁唇的 う。', ex: ['くるま', '汽車'], kx: ['ルール', '規則'] },
      { h: 'れ', k: 'レ', r: 're', zy: 'ㄌㄝ', ho: '礼', hoTc: '禮', ko: '礼', koTc: '禮', tip: '彈舌的 r 接 ㄝ。', ex: ['れきし', '歷史'], kx: ['レモン', '檸檬'] },
      { h: 'ろ', k: 'ロ', r: 'ro', zy: 'ㄌㄛ', ho: '呂', ko: '呂', tip: '彈舌的 r 接 ㄛ。', ex: ['ろく', '六'], kx: ['ロボット', '機器人'] },
    ],
  },
  {
    id: 'w', label: 'わ行', kLabel: 'ワ行', cells: [
      { h: 'わ', k: 'ワ', r: 'wa', zy: 'ㄨㄚ', ho: '和', ko: '和', tip: '像「哇」，嘴唇不要太圓。', ex: ['わたし', '我'], kx: ['ワイン', '葡萄酒'] },
      null,
      null,
      null,
      { h: 'を', k: 'ヲ', r: 'wo', zy: 'ㄛ', ho: '遠', ko: '乎', tip: '現代念法和 お 一樣，只當助詞用；拼音常寫 wo 來和 お 區分。', ex: ['ほんを よむ', '看書'], kx: null },
    ],
  },
  {
    id: 'nn', label: 'ん', kLabel: 'ン', cells: [
      { h: 'ん', k: 'ン', r: 'n', zy: 'ㄣ', ho: '无', hoTc: '無', ko: null, tip: '鼻音，自己算一拍，會隨後面的音變成 m、n 或 ng。一般不會出現在詞的開頭。', ex: ['ほん', '書'], kx: ['パン', '麵包'] },
    ],
  },
];

/** 濁音・半濁音 */
export const DAKUON_ROWS: KanaRow[] = [
  {
    id: 'g', label: 'が行', kLabel: 'ガ行', tip: '聲帶要振動的 g。會台語的話，「牛 gû」的 g 就是這個音。', cells: [
      { h: 'が', k: 'ガ', r: 'ga', ex: ['がいこく', '外國'] },
      { h: 'ぎ', k: 'ギ', r: 'gi', ex: ['ぎんこう', '銀行'] },
      { h: 'ぐ', k: 'グ', r: 'gu', ex: ['かぐ', '家具'] },
      { h: 'げ', k: 'ゲ', r: 'ge', ex: ['げんき', '有精神'] },
      { h: 'ご', k: 'ゴ', r: 'go', ex: ['ごはん', '飯'] },
    ],
  },
  {
    id: 'z', label: 'ざ行', kLabel: 'ザ行', tip: '聲帶振動的 z。じ 念 ji，ず 念 zu。', cells: [
      { h: 'ざ', k: 'ザ', r: 'za', ex: ['ざっし', '雜誌'] },
      { h: 'じ', k: 'ジ', r: 'ji', ex: ['じかん', '時間'] },
      { h: 'ず', k: 'ズ', r: 'zu', ex: ['ちず', '地圖'] },
      { h: 'ぜ', k: 'ゼ', r: 'ze', ex: ['かぜ', '風；感冒'] },
      { h: 'ぞ', k: 'ゾ', r: 'zo', ex: ['かぞく', '家人'] },
    ],
  },
  {
    id: 'd', label: 'だ行', kLabel: 'ダ行', tip: '聲帶振動的 d。ぢ、づ 和 じ、ず 同音，很少用。', cells: [
      { h: 'だ', k: 'ダ', r: 'da', ex: ['だいがく', '大學'] },
      { h: 'ぢ', k: 'ヂ', r: 'ji', ex: ['はなぢ', '鼻血'] },
      { h: 'づ', k: 'ヅ', r: 'zu', ex: ['つづく', '繼續'] },
      { h: 'で', k: 'デ', r: 'de', ex: ['でんわ', '電話'] },
      { h: 'ど', k: 'ド', r: 'do', ex: ['まど', '窗戶'] },
    ],
  },
  {
    id: 'b', label: 'ば行', kLabel: 'バ行', tip: '聲帶振動的 b。會台語的話，像「肉 bah」的 b。', cells: [
      { h: 'ば', k: 'バ', r: 'ba', ex: ['ばんごはん', '晚餐'] },
      { h: 'び', k: 'ビ', r: 'bi', ex: ['びょういん', '醫院'] },
      { h: 'ぶ', k: 'ブ', r: 'bu', ex: ['ぶどう', '葡萄'] },
      { h: 'べ', k: 'ベ', r: 'be', ex: ['べんとう', '便當'] },
      { h: 'ぼ', k: 'ボ', r: 'bo', ex: ['ぼうし', '帽子'] },
    ],
  },
  {
    id: 'p', label: 'ぱ行', kLabel: 'パ行', tip: 'p。在詞中送氣比較弱，聽起來像ㄅ。', cells: [
      { h: 'ぱ', k: 'パ', r: 'pa', ex: ['かんぱい', '乾杯'] },
      { h: 'ぴ', k: 'ピ', r: 'pi', ex: ['えんぴつ', '鉛筆'] },
      { h: 'ぷ', k: 'プ', r: 'pu', ex: ['てんぷら', '天婦羅'] },
      { h: 'ぺ', k: 'ペ', r: 'pe', ex: ['ぺこぺこ', '肚子很餓'] },
      { h: 'ぽ', k: 'ポ', r: 'po', ex: ['さんぽ', '散步'] },
    ],
  },
];

export const ALL_ROWS: KanaRow[] = [...SEION_ROWS, ...DAKUON_ROWS];

/** 拗音：基底字 + ゃゅょ */
export interface YoonGroup { h: string; k: string; cells: KanaCell[] }
const YOON_BASE: [string, string, string][] = [
  ['き', 'キ', 'ky'], ['し', 'シ', 'sh'], ['ち', 'チ', 'ch'], ['に', 'ニ', 'ny'], ['ひ', 'ヒ', 'hy'], ['み', 'ミ', 'my'],
  ['り', 'リ', 'ry'], ['ぎ', 'ギ', 'gy'], ['じ', 'ジ', 'j'], ['び', 'ビ', 'by'], ['ぴ', 'ピ', 'py'],
];
const SMALL: [string, string, string][] = [['ゃ', 'ャ', 'a'], ['ゅ', 'ュ', 'u'], ['ょ', 'ョ', 'o']];
export const YOON: YoonGroup[] = YOON_BASE.map(([h, k, c]) => ({
  h,
  k,
  cells: SMALL.map(([sh, sk, v]) => ({ h: h + sh, k: k + sk, r: c + v })),
}));

export type KanaKind = 'sei' | 'daku' | 'yoon';
export interface KanaInfo {
  kind: KanaKind;
  cell: KanaCell;
  row?: KanaRow;
  /** 在 a i u e o 的哪一欄（ん 為 -1） */
  col: number;
  script: Script;
}

const INFO = new Map<string, KanaInfo>();
for (const row of SEION_ROWS) {
  row.cells.forEach((cell, i) => {
    if (!cell) return;
    const col = row.id === 'nn' ? -1 : i;
    INFO.set(cell.h, { kind: 'sei', cell, row, col, script: 'h' });
    INFO.set(cell.k, { kind: 'sei', cell, row, col, script: 'k' });
  });
}
for (const row of DAKUON_ROWS) {
  row.cells.forEach((cell, i) => {
    if (!cell) return;
    INFO.set(cell.h, { kind: 'daku', cell, row, col: i, script: 'h' });
    INFO.set(cell.k, { kind: 'daku', cell, row, col: i, script: 'k' });
  });
}
for (const g of YOON) {
  g.cells.forEach((cell, i) => {
    INFO.set(cell.h, { kind: 'yoon', cell, col: i, script: 'h' });
    INFO.set(cell.k, { kind: 'yoon', cell, col: i, script: 'k' });
  });
}

export function kanaInfo(ch: string): KanaInfo | undefined {
  return INFO.get(ch);
}

export function rowById(id: string): KanaRow | undefined {
  return ALL_ROWS.find((r) => r.id === id);
}

/** 46 個清音格子（依五十音順序） */
export const SEION_CELLS: KanaCell[] = SEION_ROWS.flatMap((r) => r.cells.filter((c): c is KanaCell => !!c));

export function charOf(cell: KanaCell, script: Script): string {
  return script === 'h' ? cell.h : cell.k;
}

/** 字源說明，例如「安」的草書 */
export function originText(cell: KanaCell, script: Script): string {
  if (script === 'h') {
    if (!cell.ho) return '';
    return `「${cell.ho}${cell.hoTc ? `（${cell.hoTc}）` : ''}」的草書`;
  }
  if (!cell.ko) return '來源有多種說法';
  // 片假名多半取漢字的一部分（カ←加），少數是整個字簡化（ニ←二、ハ←八）
  return `來自漢字「${cell.ko}${cell.koTc ? `（${cell.koTc}）` : ''}」`;
}

/** 長得像、容易搞混的字，用來出干擾選項 */
export const LOOKALIKE: Record<string, string[]> = {
  'あ': ['お', 'め'], 'お': ['あ', 'む'], 'い': ['り', 'こ'], 'り': ['い', 'け'], 'こ': ['に', 'い'], 'に': ['こ', 'た'],
  'う': ['つ', 'ら'], 'つ': ['う', 'し'], 'さ': ['ち', 'き'], 'ち': ['さ', 'ら'], 'き': ['さ', 'ま'], 'け': ['は', 'に'],
  'は': ['ほ', 'け'], 'ほ': ['は', 'ま'], 'ま': ['ほ', 'よ'], 'よ': ['ま', 'は'], 'ね': ['れ', 'わ'], 'れ': ['ね', 'わ'],
  'わ': ['ね', 'れ'], 'ぬ': ['め', 'ね'], 'め': ['ぬ', 'あ'], 'る': ['ろ', 'つ'], 'ろ': ['る', 'ら'], 'た': ['な', 'に'],
  'な': ['た', 'ま'], 'く': ['へ', 'し'], 'へ': ['く'], 'し': ['つ', 'も'], 'も': ['し', 'ま'], 'ら': ['ち', 'う'],
  'そ': ['て', 'ろ'], 'て': ['そ'],
  'シ': ['ツ', 'ン'], 'ツ': ['シ', 'ソ'], 'ソ': ['ン', 'リ'], 'ン': ['ソ', 'シ'], 'ク': ['ケ', 'タ'], 'ケ': ['ク', 'タ'],
  'タ': ['ク', 'ヌ'], 'ウ': ['ワ', 'フ'], 'ワ': ['ウ', 'フ'], 'フ': ['ワ', 'ヲ'], 'ヲ': ['フ', 'ラ'], 'ヌ': ['ス', 'メ'],
  'ス': ['ヌ', 'ラ'], 'ラ': ['ヲ', 'ス'], 'コ': ['ユ', 'ロ'], 'ユ': ['コ', 'ヨ'], 'ヨ': ['ユ', 'コ'], 'ロ': ['コ', 'ヨ'],
  'ア': ['マ', 'ヤ'], 'マ': ['ア', 'ム'], 'ム': ['マ', 'ス'], 'チ': ['テ', 'ナ'], 'テ': ['チ', 'ナ'], 'ナ': ['メ', 'チ'],
  'メ': ['ナ', 'ヌ'], 'ノ': ['メ', 'ソ'], 'ル': ['レ', 'ハ'], 'レ': ['ル', 'ハ'], 'リ': ['ソ', 'ン'], 'ハ': ['ル', 'ヘ'],
  'ヘ': ['ハ', 'ノ'],
};

export const VOWELS = ['a', 'i', 'u', 'e', 'o'] as const;
