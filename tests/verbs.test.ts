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
