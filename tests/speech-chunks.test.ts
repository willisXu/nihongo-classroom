/** 長句照句號分開念（Chrome 的線上語音念太久會自己停掉），和被打斷時的通知 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ---------- 長句分開念、被打斷時通知整段播放 ---------- */
class FakeUtterance {
  text: string;
  lang = '';
  rate = 1;
  pitch = 1;
  voice: unknown = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function setup() {
  const spoken: FakeUtterance[] = [];
  const local = { name: 'Haruka', lang: 'ja-JP', voiceURI: 'Haruka', localService: true, default: false };
  const synth = { speaking: false, pending: false, getVoices: () => [local], addEventListener: () => {}, cancel: vi.fn(), speak: (u: FakeUtterance) => spoken.push(u) };
  vi.stubGlobal('window', { speechSynthesis: synth, SpeechSynthesisUtterance: FakeUtterance, addEventListener: () => {}, setTimeout, clearTimeout });
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('navigator', { onLine: true, userActivation: { hasBeenActive: true } });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  return { spoken };
}

describe('發音', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('長的文字照句號分開念（「」裡面的不切），短的照原樣', async () => {
    setup();
    const { speechChunks, SPLIT_OVER } = await import('../src/lib/speech');
    expect(speechChunks('おはようございます。元気ですか。')).toEqual(['おはようございます。元気ですか。']);
    const long = 'でも、去年の秋、困ったことがありました。会社の人に話すと、「名前を書いても。よく見ない人もいますよ」と言われました。それで、傘に名前を書いておくことにしました。';
    expect(long.length).toBeGreaterThan(SPLIT_OVER);
    expect(speechChunks(long)).toEqual(['でも、去年の秋、困ったことがありました。', '会社の人に話すと、「名前を書いても。よく見ない人もいますよ」と言われました。', 'それで、傘に名前を書いておくことにしました。']);
    expect(speechChunks(long).join('')).toBe(long);
  });

  it('分開念的長句：一句接一句，全部念完才呼叫一次 onEnd', async () => {
    const { spoken } = setup();
    const sp = await import('../src/lib/speech');
    sp.initSpeech();
    const ends: number[] = [];
    const stops: number[] = [];
    const long = 'あ'.repeat(30) + '。' + 'い'.repeat(30) + '。';
    sp.speak(long, { onEnd: () => ends.push(1), onStop: () => stops.push(1) });
    expect(spoken).toHaveLength(1);
    spoken[0].onend?.();
    expect(spoken).toHaveLength(2);
    expect(ends).toEqual([]);
    spoken[1].onend?.();
    expect(ends).toEqual([1]);
    expect(stops).toEqual([]);
  });

  it('分開念的長句被別的發音打斷：呼叫 onStop 一次，不呼叫 onEnd', async () => {
    const { spoken } = setup();
    const sp = await import('../src/lib/speech');
    sp.initSpeech();
    const log: string[] = [];
    sp.speak('あ'.repeat(30) + '。' + 'い'.repeat(30) + '。', { onEnd: () => log.push('end'), onStop: () => log.push('stop') });
    spoken[0].onend?.();
    sp.speak('に');
    expect(log).toEqual(['stop']);
    spoken[1].onend?.();
    expect(log).toEqual(['stop']);
  });

  it('整段播放被別的發音或停止打斷：呼叫 onStop（按鈕才會回到「播放」），之後不再往下念', async () => {
    const { spoken } = setup();
    const sp = await import('../src/lib/speech');
    sp.initSpeech();
    const log: string[] = [];
    sp.speak('いち', { onEnd: () => log.push('end1'), onStop: () => log.push('stop1') });
    // 播放到一半點了別的字
    sp.speak('に', { onEnd: () => log.push('end2'), onStop: () => log.push('stop2') });
    expect(log).toEqual(['stop1']);
    spoken[0].onend?.();
    expect(log).toEqual(['stop1']);
    spoken[1].onend?.();
    expect(log).toEqual(['stop1', 'end2']);
    // 念完的不會再被 stopSpeaking 通知
    sp.stopSpeaking();
    expect(log).toEqual(['stop1', 'end2']);
    sp.speak('さん', { onStop: () => log.push('stop3') });
    sp.stopSpeaking();
    expect(log).toEqual(['stop1', 'end2', 'stop3']);
  });

  it('長句念到一半被打斷：後面的句子不念', async () => {
    const { spoken } = setup();
    const sp = await import('../src/lib/speech');
    sp.initSpeech();
    const long = 'あ'.repeat(30) + '。' + 'い'.repeat(30) + '。';
    sp.speak(long);
    sp.stopSpeaking();
    spoken[0].onend?.();
    expect(spoken).toHaveLength(1);
  });
});
