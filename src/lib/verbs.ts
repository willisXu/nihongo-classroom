/**
 * 動詞變化：ます形、て形、た形、ない形（N5），可能形、被動、使役、意向形、命令形、ば形、禁止形（N4）。
 * 假名和漢字寫法都可以（語尾一定是假名）。
 * 單字卡的動詞存辭書形和分類（verbGroup：1 = 五段、2 = 一段、3 = する・くる），課文測試用這裡檢查變化有沒有寫錯。
 */
export type VerbGroup = 1 | 2 | 3;
export type VerbForm =
  | 'masu'
  | 'te'
  | 'ta'
  | 'nai'
  | 'potential'
  | 'passive'
  | 'causative'
  | 'volitional'
  | 'imperative'
  | 'ba'
  | 'prohibitive';

const I_ROW: Record<string, string> = { う: 'い', く: 'き', ぐ: 'ぎ', す: 'し', つ: 'ち', ぬ: 'に', ぶ: 'び', む: 'み', る: 'り' };
const A_ROW: Record<string, string> = { う: 'わ', く: 'か', ぐ: 'が', す: 'さ', つ: 'た', ぬ: 'な', ぶ: 'ば', む: 'ま', る: 'ら' };
const E_ROW: Record<string, string> = { う: 'え', く: 'け', ぐ: 'げ', す: 'せ', つ: 'て', ぬ: 'ね', ぶ: 'べ', む: 'め', る: 'れ' };
const O_ROW: Record<string, string> = { う: 'お', く: 'こ', ぐ: 'ご', す: 'そ', つ: 'と', ぬ: 'の', ぶ: 'ぼ', む: 'も', る: 'ろ' };
/** 第一類的て形：語尾 → て（た形把て換成た、で換成だ） */
const TE_END: Record<string, string> = { う: 'って', つ: 'って', る: 'って', む: 'んで', ぶ: 'んで', ぬ: 'んで', く: 'いて', ぐ: 'いで', す: 'して' };

/** 第二類：去掉る之後接的部分 */
const ICHIDAN: Record<VerbForm, string> = {
  masu: 'ます',
  te: 'て',
  ta: 'た',
  nai: 'ない',
  potential: 'られる',
  passive: 'られる',
  causative: 'させる',
  volitional: 'よう',
  imperative: 'ろ',
  ba: 'れば',
  prohibitive: 'るな',
};

/** する（含「勉強する」這種）：去掉する之後接的部分 */
const SURU: Record<VerbForm, string> = {
  masu: 'します',
  te: 'して',
  ta: 'した',
  nai: 'しない',
  potential: 'できる',
  passive: 'される',
  causative: 'させる',
  volitional: 'しよう',
  imperative: 'しろ',
  ba: 'すれば',
  prohibitive: 'するな',
};

/** くる：念法（假名）；漢字寫法 来る 只換來後面的假名 */
const KURU: Record<VerbForm, [kana: string, okuri: string]> = {
  masu: ['きます', 'ます'],
  te: ['きて', 'て'],
  ta: ['きた', 'た'],
  nai: ['こない', 'ない'],
  potential: ['こられる', 'られる'],
  passive: ['こられる', 'られる'],
  causative: ['こさせる', 'させる'],
  volitional: ['こよう', 'よう'],
  imperative: ['こい', 'い'],
  ba: ['くれば', 'れば'],
  prohibitive: ['くるな', 'るな'],
};

/** 第三類：する和くる／来る */
function irregular(word: string, form: VerbForm): string | null {
  if (word.endsWith('する')) return word.slice(0, -2) + SURU[form];
  if (word === 'くる') return KURU[form][0];
  // 漢字寫法：来る → 来ます、来ない、来られる…（念法不同，寫法只換語尾）
  if (word.endsWith('来る')) return word.slice(0, -1) + KURU[form][1];
  return null;
}

export function conjugate(word: string, group: VerbGroup, form: VerbForm): string {
  if (group === 3) {
    const r = irregular(word, form);
    if (!r) throw new Error(`不是する・くる：${word}`);
    return r;
  }
  const end = word.slice(-1);
  const base = word.slice(0, -1);
  if (group === 2) {
    if (end !== 'る') throw new Error(`第二類動詞要用る結尾：${word}`);
    // くれる（給我）的命令形是 くれ（不是 くれろ）：「貸してくれ！」。暮れる（天黑）照規則是 暮れろ，所以只認 くれる・呉れる
    if (form === 'imperative' && (word === 'くれる' || word.endsWith('呉れる'))) return base;
    return base + ICHIDAN[form];
  }
  if (!(end in I_ROW)) throw new Error(`第一類動詞的語尾不對：${word}`);
  const aru = word === 'ある';
  // 敬語動詞（いらっしゃる、おっしゃる、なさる、くださる、ござる）：ます形是〜います、命令形是〜い
  const honorific = /(?:いらっしゃる|おっしゃる|なさる|くださる|下さる|ござる)$/.test(word);
  switch (form) {
    case 'masu':
      return base + (honorific ? 'い' : I_ROW[end]) + 'ます';
    case 'nai':
      // ある 的否定是 ない
      return aru ? 'ない' : base + A_ROW[end] + 'ない';
    case 'te':
    case 'ta': {
      // 行く 是例外：行って、行った
      const te = word === 'いく' || word.endsWith('行く') ? 'って' : TE_END[end];
      return base + (form === 'te' ? te : te.replace('て', 'た').replace('で', 'だ'));
    }
    case 'potential':
      if (aru) throw new Error('ある 沒有可能形');
      return base + E_ROW[end] + 'る';
    case 'passive':
      return base + A_ROW[end] + 'れる';
    case 'causative':
      return base + A_ROW[end] + 'せる';
    case 'volitional':
      return base + O_ROW[end] + 'う';
    case 'imperative':
      return base + (honorific ? 'い' : E_ROW[end]);
    case 'ba':
      return base + E_ROW[end] + 'ば';
    case 'prohibitive':
      return word + 'な';
  }
}
