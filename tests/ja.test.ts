import { describe, expect, it } from 'vitest';
import { bareKanji, inlineSay, jaPlain, jaReading, jaSpeech, kanjiOf, parseJa, rubyPairs, wordSay } from '../src/lib/ja';

describe('日文句子的讀音標記', () => {
  it('讀音標在《前面連續的漢字上', () => {
    expect(parseJa('私《わたし》は台湾人《たいわんじん》です。')).toEqual([
      { t: '私', r: 'わたし' },
      { t: 'は' },
      { t: '台湾人', r: 'たいわんじん' },
      { t: 'です。' },
    ]);
    expect(parseJa('食《た》べます')).toEqual([{ t: '食', r: 'た' }, { t: 'べます' }]);
    expect(parseJa('時々《ときどき》')).toEqual([{ t: '時々', r: 'ときどき' }]);
  });

  it('｜可以從一串漢字的中間開始標；〔〕是句型的空格', () => {
    expect(parseJa('｜日本《にほん》語《ご》')).toEqual([{ t: '日本', r: 'にほん' }, { t: '語', r: 'ご' }]);
    expect(parseJa('今日｜本《ほん》')).toEqual([{ t: '今日' }, { t: '本', r: 'ほん' }]);
    expect(parseJa('〔名詞〕は〔名詞〕です')).toEqual([{ slot: '名詞' }, { t: 'は' }, { slot: '名詞' }, { t: 'です' }]);
  });

  it('格式錯誤會報錯', () => {
    expect(() => parseJa('わたし《わたし》')).toThrow();
    expect(() => parseJa('私《わたし')).toThrow();
    expect(() => parseJa('私わたし》')).toThrow();
    expect(() => parseJa('私《私》')).toThrow();
    expect(() => parseJa('｜私')).toThrow();
    expect(() => parseJa('〔名詞')).toThrow();
  });

  it('顯示、讀音、沒標讀音的漢字', () => {
    const s = '毎朝《まいあさ》、コーヒーを飲《の》みます。';
    expect(jaPlain(s)).toBe('毎朝、コーヒーを飲みます。');
    expect(jaReading(s)).toBe('まいあさ、コーヒーをのみます。');
    expect(bareKanji(s)).toEqual([]);
    expect(bareKanji('学校《がっこう》へ行きます')).toEqual(['行']);
    expect(rubyPairs(s)).toEqual([['毎朝', 'まいあさ'], ['飲', 'の']]);
    expect(jaPlain('〔名詞〕です')).toBe('〔名詞〕です');
    expect(jaReading('〔名詞〕です')).toBe('です');
    expect(kanjiOf('日本の日本語')).toEqual(['日', '本', '語']);
  });

  it('語音：漢字詞照寫，念法很多的詞（私、何、今日…）改念讀音；不和前後的假名黏在一起', () => {
    expect(jaSpeech('私《わたし》は学生《がくせい》です。')).toBe('わたしは学生です。');
    expect(jaSpeech('今日《きょう》は月曜日《げつようび》です。')).toBe('きょうは月曜日です。');
    expect(jaSpeech('何《なん》ですか。')).toBe('なんですか。');
    expect(jaSpeech('七時《しちじ》に起《お》きます。')).toBe('七時に起きます。');
    // 「母は」念讀音會變成「ははは」、「午後8時」會變成「午後はちじ」：照寫
    expect(jaSpeech('母《はは》は先生《せんせい》です。')).toBe('母は先生です。');
    expect(jaSpeech('午後《ごご》｜8時《はちじ》です。')).toBe('午後8時です。');
    // 阿拉伯數字用｜標讀音：顯示 7時、念 しちじ（語音看數字自己念）
    expect(parseJa('｜7時《しちじ》に起《お》きます。')).toEqual([{ t: '7時', r: 'しちじ' }, { t: 'に' }, { t: '起', r: 'お' }, { t: 'きます。' }]);
    expect(jaSpeech('｜1,500円《せんごひゃくえん》です。')).toBe('1,500円です。');
    expect(jaPlain('｜7時《しちじ》')).toBe('7時');
    expect(jaSpeech('〔名詞〕〜です')).toBe('です');
    // 句型拿掉〜以後是助詞開頭：照助詞念（不然單獨的 は 會念成 ha）；一般的句子不動
    expect(jaSpeech('〜はどこですか')).toBe('わどこですか');
    expect(jaSpeech('〜へ行《い》きます')).toBe('え行きます');
    expect(jaSpeech('はい、そうです。')).toBe('はい、そうです。');
    // 同一個寫法有好幾種念法的：念標的讀音
    expect(jaSpeech('紅葉《もみじ》がきれいです。')).toBe('もみじがきれいです。');
    expect(jaSpeech('雨《あめ》が降《ふ》ります。')).toBe('雨がふります。');
    expect(jaSpeech('電車《でんしゃ》を降《お》ります。')).toBe('電車をおります。');
    expect(jaSpeech('何分《なんぷん》ですか。')).toBe('なんぷんですか。');
    expect(jaSpeech('家《うち》でゆっくりします。')).toBe('うちでゆっくりします。');
    // 數字＋日 有兩種念法（いちにち／ついたち）：念標的讀音；日の出 照寫
    expect(jaSpeech('｜1日《いちにち》に｜3回《さんかい》飲《の》みます。')).toBe('いちにちに3回飲みます。');
    expect(jaSpeech('｜1日《ついたち》に行《い》きます。')).toBe('ついたちに行きます。');
    expect(jaSpeech('日《ひ》の出《で》を見《み》ました。')).toBe('日の出を見ました。');
  });

  it('說明文字裡的 [[ ]]：沒有讀音標記也拿掉〜，助詞照助詞念；只有一個詞的念讀音', () => {
    expect(inlineSay('〜は')).toBe('わ');
    expect(inlineSay('いいえ、〜じゃありません。')).toBe('いいえ、じゃありません。');
    expect(inlineSay('ありがとう')).toBe('ありがとう');
    // 單一個漢字沒有前後文：念標的讀音（不然 十 會念 じゅう、人 會念 ひと）
    expect(inlineSay('十《とお》')).toBe('とお');
    expect(inlineSay('〜人《にん》')).toBe('にん');
    expect(inlineSay('魚屋《さかなや》')).toBe('さかなや');
    expect(inlineSay('母《はは》')).toBe('母');
    // 句子照 jaSpeech
    expect(inlineSay('毎朝《まいあさ》コーヒーを飲《の》みます。')).toBe('毎朝コーヒーを飲みます。');
    expect(inlineSay('〜へ行《い》きます')).toBe('え行きます');
  });

  it('單字念讀音；は、へ 開頭的漢字詞念漢字（はち、はは 有的語音會念錯）', () => {
    expect(wordSay('学生《がくせい》')).toBe('がくせい');
    expect(wordSay('〜さん')).toBe('さん');
    expect(wordSay('八《はち》')).toBe('八');
    expect(wordSay('母《はは》')).toBe('母');
    expect(wordSay('はい')).toBe('はい');
    expect(wordSay('食《た》べます')).toBe('たべます');
    // 〜杯 這種接在數字後面的詞：念讀音（單獨的 杯 可能念成 さかずき）
    expect(wordSay('〜杯《はい》')).toBe('はい');
    expect(wordSay('〜本《ほん》')).toBe('ほん');
  });
});
