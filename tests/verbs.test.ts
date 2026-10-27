import { describe, expect, it } from 'vitest';
import { conjugate } from '../src/lib/verbs';
import { DECKS } from '../src/data/vocab';
import { masuForm } from '../src/lib/vocab';

describe('動詞變化', () => {
  it('第一類（五段）', () => {
    const cases: [string, string, string, string, string][] = [
      // 辭書形, ます形, て形, た形, ない形
      ['かう', 'かいます', 'かって', 'かった', 'かわない'],
      ['まつ', 'まちます', 'まって', 'まった', 'またない'],
      ['かえる', 'かえります', 'かえって', 'かえった', 'かえらない'],
      ['のむ', 'のみます', 'のんで', 'のんだ', 'のまない'],
      ['あそぶ', 'あそびます', 'あそんで', 'あそんだ', 'あそばない'],
      ['しぬ', 'しにます', 'しんで', 'しんだ', 'しなない'],
      ['かく', 'かきます', 'かいて', 'かいた', 'かかない'],
      ['およぐ', 'およぎます', 'およいで', 'およいだ', 'およがない'],
      ['はなす', 'はなします', 'はなして', 'はなした', 'はなさない'],
      ['いく', 'いきます', 'いって', 'いった', 'いかない'],
      ['行く', '行きます', '行って', '行った', '行かない'],
      ['ある', 'あります', 'あって', 'あった', 'ない'],
      ['書く', '書きます', '書いて', '書いた', '書かない'],
    ];
    for (const [d, masu, te, ta, nai] of cases) {
      expect([conjugate(d, 1, 'masu'), conjugate(d, 1, 'te'), conjugate(d, 1, 'ta'), conjugate(d, 1, 'nai')], d).toEqual([masu, te, ta, nai]);
    }
  });

  it('第二類（一段）和第三類（する・くる）', () => {
    expect(['masu', 'te', 'ta', 'nai'].map((f) => conjugate('食べる', 2, f as 'masu'))).toEqual(['食べます', '食べて', '食べた', '食べない']);
    expect(['masu', 'te', 'ta', 'nai'].map((f) => conjugate('する', 3, f as 'masu'))).toEqual(['します', 'して', 'した', 'しない']);
    expect(['masu', 'te', 'ta', 'nai'].map((f) => conjugate('勉強する', 3, f as 'masu'))).toEqual(['勉強します', '勉強して', '勉強した', '勉強しない']);
    expect(['masu', 'te', 'ta', 'nai'].map((f) => conjugate('くる', 3, f as 'masu'))).toEqual(['きます', 'きて', 'きた', 'こない']);
    expect(['masu', 'te', 'ta', 'nai'].map((f) => conjugate('来る', 3, f as 'masu'))).toEqual(['来ます', '来て', '来た', '来ない']);
    expect(() => conjugate('たべる', 1, 'masu')).not.toThrow();
    expect(() => conjugate('たべ', 2, 'masu')).toThrow();
  });

  it('N4 的變化：可能形、被動、使役、意向形、命令形、ば形、禁止形', () => {
    const forms = ['potential', 'passive', 'causative', 'volitional', 'imperative', 'ba', 'prohibitive'] as const;
    const all = (w: string, g: 1 | 2 | 3) => forms.map((f) => conjugate(w, g, f));
    expect(all('書く', 1)).toEqual(['書ける', '書かれる', '書かせる', '書こう', '書け', '書けば', '書くな']);
    expect(all('かう', 1)).toEqual(['かえる', 'かわれる', 'かわせる', 'かおう', 'かえ', 'かえば', 'かうな']);
    expect(all('まつ', 1)).toEqual(['まてる', 'またれる', 'またせる', 'まとう', 'まて', 'まてば', 'まつな']);
    expect(all('はなす', 1)).toEqual(['はなせる', 'はなされる', 'はなさせる', 'はなそう', 'はなせ', 'はなせば', 'はなすな']);
    expect(all('行く', 1)).toEqual(['行ける', '行かれる', '行かせる', '行こう', '行け', '行けば', '行くな']);
    expect(all('帰る', 1)).toEqual(['帰れる', '帰られる', '帰らせる', '帰ろう', '帰れ', '帰れば', '帰るな']);
    expect(all('食べる', 2)).toEqual(['食べられる', '食べられる', '食べさせる', '食べよう', '食べろ', '食べれば', '食べるな']);
    expect(all('する', 3)).toEqual(['できる', 'される', 'させる', 'しよう', 'しろ', 'すれば', 'するな']);
    expect(all('勉強する', 3)).toEqual(['勉強できる', '勉強される', '勉強させる', '勉強しよう', '勉強しろ', '勉強すれば', '勉強するな']);
    expect(all('くる', 3)).toEqual(['こられる', 'こられる', 'こさせる', 'こよう', 'こい', 'くれば', 'くるな']);
    expect(all('来る', 3)).toEqual(['来られる', '来られる', '来させる', '来よう', '来い', '来れば', '来るな']);
    expect(conjugate('ある', 1, 'ba')).toBe('あれば');
    // 敬語動詞：ます形〜います、命令形〜い（くださる → ください）
    expect(['いらっしゃる', 'おっしゃる', 'なさる', 'くださる'].map((w) => conjugate(w, 1, 'masu'))).toEqual(['いらっしゃいます', 'おっしゃいます', 'なさいます', 'くださいます']);
    expect(conjugate('くださる', 1, 'imperative')).toBe('ください');
    // くれる 的命令形是 くれ（[[力を貸してくれ！]]）；同音的 暮れる 照規則
    expect(conjugate('くれる', 2, 'imperative')).toBe('くれ');
    expect(conjugate('暮れる', 2, 'imperative')).toBe('暮れろ');
    expect(conjugate('くれる', 2, 'te')).toBe('くれて');
    expect(conjugate('なさる', 1, 'te')).toBe('なさって');
    expect(conjugate('いらっしゃる', 1, 'nai')).toBe('いらっしゃらない');
    expect(() => conjugate('ある', 1, 'potential')).toThrow();
  });

  it('單字卡的每個動詞都變得出來（分類有填、語尾對）', () => {
    for (const d of DECKS) {
      for (const it of d.items) {
        if (it.pos !== 'verb') continue;
        expect(it.verbGroup, `${it.id} ${it.kana} 沒有分類`).toBeTruthy();
        for (const w of [it.kana, it.kanji ?? it.kana]) expect(() => conjugate(w, it.verbGroup!, 'te'), `${it.id} ${w}`).not.toThrow();
      }
    }
  });

  it('單字卡顯示的ます形（課程第 13–24 課用ます形）', () => {
    expect(masuForm({ pos: 'verb', verbGroup: 2, kana: 'たべる', kanji: '食べる' })).toBe('食べます');
    expect(masuForm({ pos: 'verb', verbGroup: 1, kana: 'いく', kanji: '行く' })).toBe('行きます');
    expect(masuForm({ pos: 'verb', verbGroup: 3, kana: 'くる', kanji: '来る' })).toBe('来ます');
    expect(masuForm({ pos: 'noun', kana: 'ほん', kanji: '本' })).toBeNull();
  });
});
