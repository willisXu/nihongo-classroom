/**
 * AI 家教的情境清單（首頁會推薦幾個，所以和系統提示分開放，首頁不用載入整份家教設定）。
 */
export type Purpose = 'travel' | 'business' | 'daily' | 'anime';

export const PURPOSE_LABEL: Record<Purpose, string> = {
  travel: '旅遊',
  business: '職場',
  daily: '日常',
  anime: '動漫・音樂',
};

export interface Scenario {
  id: string;
  purpose: Purpose;
  title: string;
  /** 給學習者看的情境說明 */
  setup: string;
  /** 學習者要完成的事 */
  goal: string;
  /** 給模型的角色設定 */
  aiRole: string;
  learnerRole: string;
  /** 朋友之間的對話用普通體 */
  casual?: boolean;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'ramen', purpose: 'travel', title: '拉麵店點餐',
    setup: '你走進東京的一家拉麵店，店員來招呼你。',
    goal: '說人數、點一碗拉麵和一杯飲料，最後結帳。',
    aiRole: 'a cheerful staff member at a small ramen shop in Tokyo',
    learnerRole: 'a tourist from Taiwan who wants to eat ramen',
  },
  {
    id: 'hotel', purpose: 'travel', title: '飯店入住',
    setup: '你到大阪的飯店櫃台辦理入住。',
    goal: '報上名字、確認入住天數，問早餐時間和 Wi-Fi 密碼。',
    aiRole: 'a polite front-desk clerk at a business hotel in Osaka',
    learnerRole: 'a guest from Taiwan checking in',
  },
  {
    id: 'directions', purpose: 'travel', title: '問路去車站',
    setup: '你在京都迷路了，向路上的人問怎麼去京都車站。',
    goal: '問到怎麼走、要走多久，最後道謝。',
    aiRole: 'a kind local person walking on a street in Kyoto',
    learnerRole: 'a tourist who is lost and looking for Kyoto Station',
  },
  {
    id: 'konbini', purpose: 'travel', title: '便利商店結帳',
    setup: '你在便利商店買了便當和飲料，正要結帳。',
    goal: '回答要不要加熱、要不要袋子，選付款方式。',
    aiRole: 'a convenience store clerk at the register',
    learnerRole: 'a customer buying a bento and a drink',
  },
  {
    id: 'intro-work', purpose: 'business', title: '第一次見面自我介紹',
    setup: '你到日本合作廠商拜訪，第一次見到對方的窗口。',
    goal: '自我介紹（名字、公司、職務）、交換名片、寒暄一句。',
    aiRole: 'a Japanese business person meeting a new partner for the first time (use polite business Japanese, simple enough for the learner)',
    learnerRole: 'a product manager from a Taiwanese company visiting a partner',
  },
  {
    id: 'phone', purpose: 'business', title: '接到客戶電話',
    setup: '你在公司接到日本客戶打來的電話，對方要找的同事不在座位上。',
    goal: '接電話、說明同事不在，問要不要回電並記下對方的名字。',
    aiRole: 'a Japanese client calling the office and asking for a colleague named 田中 (Tanaka)',
    learnerRole: 'an office worker answering the phone',
  },
  {
    id: 'meeting', purpose: 'business', title: '會議前寒暄',
    setup: '線上會議開始前，你和日本同事先閒聊幾句。',
    goal: '打招呼、聊天氣或最近的工作，最後說「那我們開始吧」。',
    aiRole: 'a Japanese colleague chatting a little before an online meeting starts',
    learnerRole: 'a colleague from the Taiwan office',
  },
  {
    id: 'new-friend', purpose: 'daily', title: '認識新朋友',
    setup: '你在語言交換活動認識一位日本人。',
    goal: '互相自我介紹，聊出身地和興趣。',
    aiRole: 'a friendly Japanese person at a language exchange event, about the same age as the learner',
    learnerRole: 'a Taiwanese person learning Japanese',
  },
  {
    id: 'weekend', purpose: 'daily', title: '約週末出去玩',
    setup: '你想約日本朋友週末一起出去。',
    goal: '邀請對方、決定要去哪裡和幾點見面。',
    aiRole: 'a close Japanese friend', learnerRole: 'a friend inviting them out on the weekend', casual: true,
  },
  {
    id: 'anime-talk', purpose: 'anime', title: '聊喜歡的動畫',
    setup: '你和喜歡動畫的日本朋友聊天。',
    goal: '說出你喜歡的作品和角色，問對方的推薦。',
    aiRole: 'a Japanese friend who loves anime and manga', learnerRole: 'an anime fan from Taiwan', casual: true,
  },
  {
    id: 'karaoke', purpose: 'anime', title: '一起去唱 KTV',
    setup: '你和日本朋友在 KTV 包廂，正要點歌。',
    goal: '說想唱哪首歌或喜歡的歌手，邀對方一起唱。',
    aiRole: 'a Japanese friend at karaoke', learnerRole: 'a friend who likes J-pop', casual: true,
  },
];
