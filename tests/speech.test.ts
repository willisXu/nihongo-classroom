import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickVoice, speechFor } from '../src/lib/speech';

type V = { name: string; lang: string; voiceURI: string; localService: boolean; default: boolean };
const voice = (name: string, localService: boolean): V => ({ name, lang: 'ja-JP', voiceURI: name, localService, default: false });

const GOOGLE = voice('Google 日本語', false);
const NANAMI = voice('Microsoft Nanami Online (Natural) - Japanese (Japan)', false);
const HARUKA = voice('Microsoft Haruka - Japanese (Japan)', true);
const AYUMI = voice('Microsoft Ayumi - Japanese (Japan)', true);

describe('挑語音', () => {
  const list = [HARUKA, GOOGLE, AYUMI] as unknown as SpeechSynthesisVoice[];

  it('有網路時照順序挑自然的線上語音；離線或線上語音念不出來時只用內建的', () => {
    expect(pickVoice(list, '', false)?.name).toBe('Google 日本語');
    expect(pickVoice(list, '', true)?.name).toBe(HARUKA.name);
  });

  it('使用者指定的語音優先；指定的是線上語音、又念不出來時改用內建的', () => {
    expect(pickVoice(list, AYUMI.voiceURI, false)?.name).toBe(AYUMI.name);
    expect(pickVoice(list, GOOGLE.voiceURI, false)?.name).toBe(GOOGLE.name);
    expect(pickVoice(list, GOOGLE.voiceURI, true)?.name).toBe(HARUKA.name);
  });

  it('沒有內建的日文語音時，還是用線上語音（至少有網路時念得出來）', () => {
    const remoteOnly = [NANAMI, GOOGLE] as unknown as SpeechSynthesisVoice[];
    expect(pickVoice(remoteOnly, '', true)?.name).toBe(NANAMI.name);
  });
});

describe('單獨的假名', () => {
  it('は、へ 改念片假名（不會被當成助詞念成 wa、e），其他照原樣', () => {
    expect(speechFor('は')).toBe('ハ');
    expect(speechFor('へ')).toBe('ヘ');
    expect(speechFor('を')).toBe('を');
    expect(speechFor('はな')).toBe('はな');
    expect(speechFor('ほ')).toBe('ほ');
  });
});

/* ---------- 線上語音念不出來時改用內建語音（假的瀏覽器語音 API） ---------- */
class FakeUtterance {
  text: string;
  lang = '';
  rate = 1;
  voice: V | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function setup(voices: V[], opts: { online?: boolean; activated?: boolean } = {}) {
  const spoken: FakeUtterance[] = [];
  const synth = {
    speaking: false,
    pending: false,
    getVoices: () => voices,
    addEventListener: () => {},
    cancel: vi.fn(),
    speak: (u: FakeUtterance) => spoken.push(u),
  };
  vi.stubGlobal('window', { speechSynthesis: synth, SpeechSynthesisUtterance: FakeUtterance, addEventListener: () => {}, setTimeout, clearTimeout });
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('navigator', { onLine: opts.online ?? true, userActivation: { hasBeenActive: opts.activated ?? true } });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  return { spoken, synth };
}

describe('線上語音念不出來', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('出錯（network）時馬上改用內建語音再念一次，之後都先用內建的', async () => {
    const { spoken } = setup([GOOGLE, HARUKA]);
    const sp = await import('../src/lib/speech');
    sp.initSpeech();
    sp.speak('こんにちは');
    expect(spoken.map((u) => u.voice?.name)).toEqual(['Google 日本語']);
    spoken[0].onerror?.({ error: 'network' });
    expect(spoken.map((u) => u.voice?.name)).toEqual(['Google 日本語', HARUKA.name]);
    expect(spoken[1].text).toBe('こんにちは');
    sp.speak('ありがとう');
    expect(spoken[2].voice?.name).toBe(HARUKA.name);
    expect(sp.speechState().remoteFailed).toBe(true);
  });

  it('一直沒開始念（連不到）：3 秒後改用內建語音', async () => {
    const { spoken } = setup([GOOGLE, HARUKA]);
    const sp = await import('../src/lib/speech');
    sp.initSpeech();
    sp.speak('は');
    expect(spoken[0].text).toBe('ハ');
    vi.advanceTimersByTime(3100);
    expect(spoken.map((u) => u.voice?.name)).toEqual(['Google 日本語', HARUKA.name]);
  });

  it('有開始念、被取消、或還沒互動過不能出聲：都不算念不出來', async () => {
    const { spoken } = setup([GOOGLE, HARUKA], { activated: false });
    const sp = await import('../src/lib/speech');
    sp.initSpeech();
    sp.speak('いち');
    spoken[0].onerror?.({ error: 'not-allowed' });
    vi.advanceTimersByTime(5000);
    sp.speak('に');
    spoken[1].onstart?.();
    vi.advanceTimersByTime(5000);
    sp.speak('さん');
    spoken[2].onerror?.({ error: 'canceled' });
    expect(spoken.map((u) => u.voice?.name)).toEqual(['Google 日本語', 'Google 日本語', 'Google 日本語']);
  });

  it('沒開始念就結束（有些瀏覽器連不到時這樣）：也改用內建語音', async () => {
    const { spoken } = setup([GOOGLE, HARUKA]);
    const sp = await import('../src/lib/speech');
    sp.initSpeech();
    sp.speak('みず');
    spoken[0].onend?.();
    expect(spoken.map((u) => u.voice?.name)).toEqual(['Google 日本語', HARUKA.name]);
  });

  it('過一陣子、或在設定頁換了語音，線上語音再試一次', async () => {
    const { spoken } = setup([GOOGLE, HARUKA]);
    const sp = await import('../src/lib/speech');
    const st = await import('../src/state');
    sp.initSpeech();
    sp.speak('いぬ');
    spoken[0].onerror?.({ error: 'network' });
    expect(sp.speechState().remoteFailed).toBe(true);
    vi.advanceTimersByTime(sp.REMOTE_RETRY_MS + 1000);
    sp.speak('ねこ');
    expect(spoken[spoken.length - 1].voice?.name).toBe('Google 日本語');
    spoken[spoken.length - 1].onstart?.();
    spoken[spoken.length - 1].onerror?.({ error: 'network' });
    expect(sp.speechState().remoteFailed).toBe(false); // 已經開始念了，不算
    // 換語音：重新給線上語音機會
    sp.speak('とり');
    spoken[spoken.length - 1].onerror?.({ error: 'synthesis-failed' });
    expect(sp.speechState().remoteFailed).toBe(true);
    st.updateSettings({ voiceURI: GOOGLE.voiceURI });
    expect(sp.speechState().remoteFailed).toBe(false);
  });

  it('離線時一開始就用內建語音', async () => {
    const { spoken } = setup([GOOGLE, HARUKA], { online: false });
    const sp = await import('../src/lib/speech');
    sp.initSpeech();
    sp.speak('みず');
    expect(spoken[0].voice?.name).toBe(HARUKA.name);
  });

  it('沒有內建語音：記下念不出來（頁面提示加裝），不重念', async () => {
    const { spoken } = setup([GOOGLE]);
    const sp = await import('../src/lib/speech');
    sp.initSpeech();
    sp.speak('やま');
    spoken[0].onerror?.({ error: 'synthesis-failed' });
    expect(spoken).toHaveLength(1);
    expect(sp.speechState().remoteFailed).toBe(true);
  });
});
