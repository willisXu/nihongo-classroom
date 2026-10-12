import { describe, expect, it } from 'vitest';
import { romaji, toHiragana, toKatakana, isKanaOnly } from '../src/lib/romaji';

describe('romaji', () => {
  const cases: [string, string][] = [
    ['あいうえお', 'aiueo'],
    ['すし', 'sushi'],
    ['ちず', 'chizu'],
    ['つくえ', 'tsukue'],
    ['ふね', 'fune'],
    ['べんとう', 'bentou'],
    ['おかあさん', 'okaasan'],
    ['きって', 'kitte'],
    ['まっちゃ', 'matcha'],
    ['ざっし', 'zasshi'],
    ['こんや', "kon'ya"],
    ['きんえん', "kin'en"],
    ['しんぶん', 'shinbun'],
    ['びょういん', 'byouin'],
    ['じゃあね', 'jaane'],
    ['コーヒー', 'kōhī'],
    ['ラーメン', 'rāmen'],
    ['パーティー', 'pātī'],
    ['ファイル', 'fairu'],
    ['ウイスキー', 'uisukī'],
    ['ほんを よむ', 'hon o yomu'],
    ['はい、そうです。', 'hai, soudesu.'],
  ];
  for (const [kana, expected] of cases) {
    it(`${kana} → ${expected}`, () => expect(romaji(kana)).toBe(expected));
  }
});

describe('kana helpers', () => {
  it('converts scripts', () => {
    expect(toHiragana('カタカナー')).toBe('かたかなー');
    expect(toKatakana('ひらがな')).toBe('ヒラガナ');
  });
  it('detects kana-only strings', () => {
    expect(isKanaOnly('コーヒー')).toBe(true);
    expect(isKanaOnly('ねこ')).toBe(true);
    expect(isKanaOnly('猫')).toBe(false);
    expect(isKanaOnly('ねこ ')).toBe(false);
  });
});
