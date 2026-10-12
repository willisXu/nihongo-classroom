import type { Lesson } from '../types';

export const lesson1: Lesson = {
  id: 1,
  title: 'あ・か・さ行',
  headline: '三套文字，和最先學的 15 個假名',
  summary:
    '今天要做到兩件事：分得出平假名、片假名和漢字；看到あ行、か行、さ行的 15 個字，能直接念出來。頁面上的假名都可以點，會念給你聽。',
  minutes: 40,
  newKana: [...'あいうえおかきくけこさしすせそ'],
  quiz: { script: 'h', rows: ['a', 'k', 's'] },
  sections: [
    {
      id: 'scripts',
      title: '三套文字',
      blocks: [
        { type: 'p', text: '日文同時用三種文字書寫，一句話裡常常三種都有。先看這一句：' },
        {
          type: 'sentence',
          segments: [
            { text: '私', ruby: 'わたし', kind: 'kanji' },
            { text: 'は', kind: 'hira' },
            { text: 'コーヒー', kind: 'kata' },
            { text: 'が', kind: 'hira' },
            { text: '好', ruby: 'す', kind: 'kanji' },
            { text: 'きです', kind: 'hira' },
            { text: '。', kind: 'plain' },
          ],
          say: '私はコーヒーが好きです。',
          romaji: 'watashi wa kōhī ga suki desu',
          zh: '我喜歡咖啡。',
        },
        { type: 'scripts' },
        {
          type: 'callout',
          label: '注意',
          items: ['句中的「は」當助詞時念 wa，不念 ha。這是少數的例外，之後學助詞時會再說明。'],
        },
      ],
    },
    {
      id: 'loans',
      title: '你已經會的日文',
      blocks: [
        { type: 'p', text: '台灣的日常用語裡藏著不少日文。點一下聽聽原本的發音，會發現自己早就會念了。' },
        {
          type: 'words',
          variant: 'loan',
          free: true,
          items: [
            { ja: 'べんとう', zh: '便當' },
            { ja: 'おじさん', zh: '歐吉桑' },
            { ja: 'おばさん', zh: '歐巴桑' },
            { ja: 'あっさり', zh: '阿莎力' },
            { ja: 'てんぷら', zh: '甜不辣' },
            { ja: 'おでん', zh: '黑輪' },
            { ja: 'さしみ', zh: '沙西米' },
            { ja: 'かわいい', zh: '卡哇伊' },
          ],
          note: '甜不辣來自日文的天婦羅（{{てんぷら}}），但在日本指的是裹粉油炸的海鮮和蔬菜，和台灣的甜不辣不一樣。黑輪則是從台語念「{{おでん}}」來的。',
        },
      ],
    },
    {
      id: 'vowels',
      title: '母音 あいうえお',
      blocks: [
        {
          type: 'p',
          text: '日文只有 5 個母音，其他假名都是「子音＋母音」。順序永遠是 a、i、u、e、o，發音和注音的ㄚ、ㄧ、ㄨ、ㄝ、ㄛ很接近。格子裡淡淡的字是這個假名的字源：平假名是從這些漢字的草書變來的，對認得漢字的你是最快的記法。',
        },
        { type: 'kana', rows: ['a'], script: 'h' },
        {
          type: 'callout',
          label: '注意',
          items: [
            '**う 不是ㄨ。**念ㄨ時嘴唇會往前嘟；日文的 う 嘴唇放鬆、幾乎是扁的。對著鏡子念，嘴唇不往前推就對了。這是中文母語者最常錯的音，後面的く、す、つ、ぬ、む、ゆ、る都帶著它。',
          ],
        },
      ],
    },
    {
      id: 'ks',
      title: 'か行・さ行',
      blocks: [
        { type: 'p', text: '在母音前面加上 k 或 s，一樣按 a、i、u、e、o 的順序排。' },
        { type: 'kana', rows: ['k'], script: 'h', title: 'か行' },
        { type: 'kana', rows: ['s'], script: 'h', title: 'さ行' },
        {
          type: 'callout',
          label: '發音',
          items: [
            '**詞中的 か 像「嘎」。**日文的 k 送氣比中文的ㄎ弱，所以 [[あか]]（紅色）聽起來像「阿嘎」。這是正常的，跟著聲音念就對了。',
            '**し 念「西」。**拼音寫 shi，但不是英文 she 的音。',
            '**す 在句尾常常聽不到 u。**[[です]]聽起來像 des。',
            '**き 是ㄎ加ㄧ，**不要念成「七」。',
          ],
        },
      ],
    },
    {
      id: 'write',
      title: '寫字提醒',
      blocks: [
        {
          type: 'p',
          text: '建議用手寫：每個字寫 5 次，邊寫邊念。也可以到[手寫描字](/writing)照筆順在螢幕上練。要注意電腦字型和手寫長得不太一樣：',
        },
        { type: 'fontcompare', chars: 'きさそ' },
        {
          type: 'p',
          text: 'き、さ 的最後一筆，手寫時要和上面分開；そ 可以一筆寫完，也可以分兩筆。以手寫教科書的寫法為準。',
        },
      ],
    },
    {
      id: 'words',
      title: '單字練習',
      blocks: [
        { type: 'p', text: '這 16 個詞只用到今天學的 15 個字。先看假名自己念，再點一下核對。' },
        {
          type: 'words',
          maskable: true,
          items: [
            { ja: 'あい', kanji: '愛', zh: '愛' },
            { ja: 'いえ', kanji: '家', zh: '家' },
            { ja: 'うえ', kanji: '上', zh: '上面' },
            { ja: 'あき', kanji: '秋', zh: '秋天' },
            { ja: 'かお', kanji: '顔', zh: '臉' },
            { ja: 'あさ', kanji: '朝', zh: '早上' },
            { ja: 'すし', kanji: '寿司', zh: '壽司' },
            { ja: 'さけ', kanji: '酒', zh: '酒；鮭魚' },
            { ja: 'いす', kanji: '椅子', zh: '椅子' },
            { ja: 'かさ', kanji: '傘', zh: '雨傘' },
            { ja: 'せかい', kanji: '世界', zh: '世界' },
            { ja: 'すいか', kanji: '西瓜', zh: '西瓜' },
            { ja: 'おいしい', zh: '好吃' },
            { ja: 'すき', kanji: '好き', zh: '喜歡' },
            { ja: 'ここ', zh: '這裡' },
            { ja: 'そこ', zh: '那裡' },
          ],
        },
      ],
    },
  ],
  homework: [
    '15 個假名，每個點來聽，跟著念 5 次。',
    '每個字手寫 5 次，邊寫邊念，看著字源記形狀；也可以用[手寫描字](/writing)照筆順練。',
    '到[假名練習](/practice)做第 1 課範圍，直到這 15 個字都變成「熟悉」。',
    '把上面 16 個單字遮住拼音，再念一遍。',
  ],
  next: '**第 2 課：た行・な行。**重點是中文裡沒有的 つ，以及和「七」很像、但送氣較弱的 ち。',
};
