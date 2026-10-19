import { describe, expect, it } from 'vitest';
import { phraseRomaji, romaji, toHiragana, toKatakana, isKanaOnly } from '../src/lib/romaji';

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

describe('分好詞的讀音轉拼音（AI 家教）', () => {
  it('每一段最後的 は、へ 是助詞：念 wa、e', () => {
    expect(phraseRomaji('わたしは たいわんじん です。')).toBe('watashi wa taiwanjin desu.');
    expect(phraseRomaji('えきへ いきます。')).toBe('eki e ikimasu.');
    expect(phraseRomaji('コーヒーは いかがですか？')).toBe('kōhī wa ikagadesuka?');
    expect(phraseRomaji('すみません、 トイレは どこですか。')).toBe('sumimasen, toire wa dokodesuka.');
    expect(phraseRomaji('こんにちは。')).toBe('konnichi wa.');
  });

  it('其他照字念；はは 不是助詞', () => {
    expect(phraseRomaji('いらっしゃいませ。 なんめいさま ですか。')).toBe('irasshaimase. nanmeisama desuka.');
    expect(phraseRomaji('はい、 ふたり です。')).toBe('hai, futari desu.');
    expect(phraseRomaji('ラーメンを ください。')).toBe('rāmen o kudasai.');
    expect(phraseRomaji('わたしの はは です。')).toBe('watashino haha desu.');
    expect(phraseRomaji('  ')).toBe('');
  });
});
