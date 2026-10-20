/**
 * 動詞變化（N5 範圍）：ます形、て形、た形、ない形。假名和漢字寫法都可以（語尾一定是假名）。
 * 單字卡的動詞存辭書形和分類（verbGroup：1 = 五段、2 = 一段、3 = する・くる），課文測試用這裡檢查變化有沒有寫錯。
 */
export type VerbGroup = 1 | 2 | 3;
export type VerbForm = 'masu' | 'te' | 'ta' | 'nai';

const I_ROW: Record<string, string> = { う: 'い', く: 'き', ぐ: 'ぎ', す: 'し', つ: 'ち', ぬ: 'に', ぶ: 'び', む: 'み', る: 'り' };
const A_ROW: Record<string, string> = { う: 'わ', く: 'か', ぐ: 'が', す: 'さ', つ: 'た', ぬ: 'な', ぶ: 'ば', む: 'ま', る: 'ら' };
/** 第一類的て形：語尾 → て（た形把て換成た、で換成だ） */
const TE_END: Record<string, string> = { う: 'って', つ: 'って', る: 'って', む: 'んで', ぶ: 'んで', ぬ: 'んで', く: 'いて', ぐ: 'いで', す: 'して' };

/** 第三類：する（含「勉強する」這種）和くる／来る */
function irregular(word: string, form: VerbForm): string | null {
  const suru = { masu: 'します', te: 'して', ta: 'した', nai: 'しない' } as const;
  if (word.endsWith('する')) return word.slice(0, -2) + suru[form];
  const kuru = { masu: 'きます', te: 'きて', ta: 'きた', nai: 'こない' } as const;
  if (word === 'くる') return kuru[form];
  // 漢字寫法：来る → 来ます、来て、来た、来ない（念法不同，寫法只換語尾）
  if (word.endsWith('来る')) return word.slice(0, -1) + { masu: 'ます', te: 'て', ta: 'た', nai: 'ない' }[form];
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
    return base + { masu: 'ます', te: 'て', ta: 'た', nai: 'ない' }[form];
  }
  if (!(end in I_ROW)) throw new Error(`第一類動詞的語尾不對：${word}`);
  switch (form) {
    case 'masu':
      return base + I_ROW[end] + 'ます';
    case 'nai':
      // ある 的否定是 ない
      return word === 'ある' ? 'ない' : base + A_ROW[end] + 'ない';
    case 'te':
    case 'ta': {
      // 行く 是例外：行って、行った
      const te = word === 'いく' || word.endsWith('行く') ? 'って' : TE_END[end];
      return base + (form === 'te' ? te : te.replace('て', 'た').replace('で', 'だ'));
    }
  }
}
