/**
 * 日文發音：使用瀏覽器內建的語音合成（Web Speech API）。
 * Windows 的 Edge／Chrome、macOS 與 iOS 的 Safari 通常都有日文語音；
 * 沒有時頁面會顯示提示，請使用者在系統設定加入日文語音。
 *
 * Chrome 的「Google 日本語」、Edge 的「Online (Natural)」語音是在網路上合成的：
 * 離線或連不到（例如在中國大陸連不到 Google）時念不出來。這時改用電腦內建的日文語音再念一次，
 * 這次開網頁之後都先用內建的（重新連上網路時再試線上語音）。
 */
import { useSyncExternalStore } from 'react';
import { settingsStore } from '../state';

export interface SpeechState {
  supported: boolean;
  /** 已經拿到語音清單 */
  ready: boolean;
  voices: SpeechSynthesisVoice[];
  /** 找到日文語音 */
  hasJapanese: boolean;
  /** 線上語音這次念不出來（離線、連不到），之後先用內建語音 */
  remoteFailed: boolean;
}

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
let state: SpeechState = { supported, ready: !supported, voices: [], hasJapanese: false, remoteFailed: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * 自動挑語音的優先順序：自然的線上語音（Edge 的 Nanami、Chrome 的 Google 日本語、蘋果的 Kyoko）優先，
 * Windows 內建的舊語音（Haruka 等）放後面。瀏覽器列出語音的順序不一定，所以要排序，不能只取第一個符合的。
 */
const VOICE_RANK = [/nanami/i, /keita/i, /google/i, /kyoko/i, /o-ren/i, /otoya/i, /natural|online|neural|premium|enhanced/i, /haruka|ayumi|sayaka|ichiro/i];

export function voiceRank(name: string): number {
  const i = VOICE_RANK.findIndex((re) => re.test(name));
  return i === -1 ? VOICE_RANK.length : i;
}

/** 在網路上合成的語音（localService 是 false）：離線、連不到時念不出來 */
export function isRemoteVoice(v: Pick<SpeechSynthesisVoice, 'localService'>): boolean {
  return v.localService === false;
}

/** 重新讀一次語音清單（有些瀏覽器清單晚到，又不觸發 voiceschanged） */
export function refreshVoices() {
  if (!supported) return;
  let all: SpeechSynthesisVoice[] = [];
  try {
    all = window.speechSynthesis.getVoices() || [];
  } catch {
    all = [];
  }
  const ja = all.filter((v) => /^ja([-_]|$)/i.test(v.lang || ''));
  state = { ...state, ready: all.length > 0 || state.ready, voices: ja, hasJapanese: ja.length > 0 };
  emit();
}

/** 線上語音念不出來之後，多久再試一次（網路只是一時太慢的話，不會整次都只能用內建語音） */
export const REMOTE_RETRY_MS = 10 * 60_000;
let remoteFailedAt = 0;

function setRemoteFailed(failed: boolean) {
  if (failed) remoteFailedAt = Date.now();
  if (state.remoteFailed === failed) return;
  state = { ...state, remoteFailed: failed };
  emit();
}

/** 現在要不要避開線上語音：剛剛念不出來（過一陣子再試），或沒有網路 */
function avoidRemote(): boolean {
  if (state.remoteFailed && Date.now() - remoteFailedAt > REMOTE_RETRY_MS) setRemoteFailed(false);
  return state.remoteFailed || offline();
}

let started = false;
export function initSpeech() {
  if (started || !supported) return;
  started = true;
  refreshVoices();
  try {
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
  } catch {
    /* 舊瀏覽器 */
  }
  // 重新連上網路、在設定頁換了語音：線上語音再給一次機會
  window.addEventListener('online', () => setRemoteFailed(false));
  let voiceURI = settingsStore.get().voiceURI;
  settingsStore.subscribe(() => {
    const next = settingsStore.get().voiceURI;
    if (next === voiceURI) return;
    voiceURI = next;
    setRemoteFailed(false);
  });
  // 有些瀏覽器不會觸發 voiceschanged，稍後再查（清單有時要好幾秒才出來）
  window.setTimeout(() => {
    refreshVoices();
    if (!state.ready) {
      state = { ...state, ready: true };
      emit();
    }
  }, 2500);
  window.setTimeout(() => {
    if (!state.voices.length) refreshVoices();
  }, 8000);
}

/** 目前的語音狀態（測試用；元件請用 useSpeech） */
export function speechState(): SpeechState {
  return state;
}

export function useSpeech(): SpeechState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

/**
 * 挑語音：使用者在設定頁指定的優先，其次照 VOICE_RANK。
 * 離線、線上語音剛剛念不出來（avoidRemote）時，有內建的日文語音就只從內建的挑。
 */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  voiceURI: string,
  avoidRemote: boolean,
): SpeechSynthesisVoice | undefined {
  const local = voices.filter((v) => !isRemoteVoice(v));
  const pool = avoidRemote && local.length ? local : voices;
  if (voiceURI) {
    const chosen = pool.find((v) => v.voiceURI === voiceURI);
    if (chosen) return chosen;
  }
  return [...pool].sort((a, b) => voiceRank(a.name) - voiceRank(b.name))[0];
}

/**
 * 實際念的字：單獨一個 は、へ 有些語音會當成助詞念成 wa、e，改念片假名 ハ、ヘ（一定念 ha、he）。
 * を 不換：片假名 ヲ 有些語音念 wo，網站教的是和 お 一樣念 o。
 */
export function speechFor(text: string): string {
  if (text === 'は') return 'ハ';
  if (text === 'へ') return 'ヘ';
  return text;
}

/** 線上語音多久沒開始念，就當成念不出來 */
const REMOTE_START_MS = 3000;
/** 這些錯誤是連不到合成服務；取消、被打斷、還沒互動過不能出聲，都不算 */
const REMOTE_ERRORS = new Set(['network', 'synthesis-unavailable', 'synthesis-failed', 'language-unavailable', 'voice-unavailable']);

let current: SpeechSynthesisUtterance | null = null;

function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** 使用者還沒和網頁互動過時，瀏覽器不讓網頁出聲：這時沒有開始念不是語音的問題 */
function canAutoplay(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : true;
}

/**
 * onEnd：這一句念完（或念不出來、放棄）時呼叫，用來一句接一句念整段會話。
 * 被下一句、stopSpeaking() 取消的不呼叫（整段播放就停在那裡）。
 */
function utter(text: string, rate: number, onEnd?: () => void, pitch?: number): boolean {
  const ss = window.speechSynthesis;
  // 先放掉上一句：被取消的那一句之後觸發的 end、error 都不算念不出來
  current = null;
  if (ss.speaking || ss.pending) ss.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  const v = pickVoice(state.voices, settingsStore.get().voiceURI, avoidRemote());
  if (v) u.voice = v;
  u.rate = rate;
  if (pitch) u.pitch = pitch;
  current = u;
  let ended = false;
  const finish = () => {
    if (ended || current !== u) return;
    ended = true;
    current = null;
    onEnd?.();
  };
  if (v && isRemoteVoice(v)) {
    let begun = false;
    const fallback = () => {
      window.clearTimeout(watchdog);
      if (begun || current !== u) return;
      if (!canAutoplay()) return finish();
      setRemoteFailed(true);
      // 有內建的日文語音才重念；沒有的話頁面會提示加裝
      if (state.voices.some((x) => !isRemoteVoice(x))) {
        ended = true;
        utter(text, rate, onEnd, pitch);
      } else finish();
    };
    const watchdog = window.setTimeout(fallback, REMOTE_START_MS);
    u.onstart = () => {
      begun = true;
      window.clearTimeout(watchdog);
    };
    // 沒開始念就結束了（有些瀏覽器連不到時是這樣）：也算念不出來
    u.onend = () => {
      if (!begun) return fallback();
      window.clearTimeout(watchdog);
      finish();
    };
    u.onerror = (e) => {
      if (REMOTE_ERRORS.has(e.error)) return fallback();
      window.clearTimeout(watchdog);
      finish();
    };
  } else {
    u.onend = finish;
    u.onerror = finish;
  }
  ss.speak(u);
  return true;
}

/** 長句一次念完，Chrome 的線上語音念到約 15 秒會自己停掉、也不觸發 end：超過這個長度就照句號分開念 */
export const SPLIT_OVER = 50;

/** 拆成一句一句念（「。！？」後面切開；「」裡面的句號不切）。短的照原樣。 */
export function speechChunks(text: string): string[] {
  if (text.length <= SPLIT_OVER) return [text];
  const out: string[] = [];
  let buf = '';
  let depth = 0;
  for (const c of text) {
    buf += c;
    if (c === '「' || c === '『') depth++;
    else if ((c === '」' || c === '』') && depth > 0) depth--;
    else if (depth === 0 && /[。！？!?]/.test(c)) {
      out.push(buf);
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf);
  return out.length ? out : [text];
}

/** 正在念的那一句的 onStop（念完就清掉） */
let onStopped: (() => void) | undefined;

/** 正在念的那一句被別的 speak()、stopSpeaking() 取代：通知它（整段播放的按鈕才不會一直停在「停止」） */
function stopped() {
  const f = onStopped;
  onStopped = undefined;
  f?.();
}

/** 念出日文。回傳 false 表示這台裝置不能發音（這時 onEnd 不會被呼叫）。 */
/** pitch：音高（1 是正常；對話聽力用來分出兩個人，見 components/Drill.tsx） */
/** onStop：還沒念完就被別的 speak()、stopSpeaking() 取代時呼叫（和 onEnd 只會呼叫其中一個） */
/** 長的文字照句號分開、一句接一句念（見 speechChunks）；被取代時後面的句子就不念了 */
export function speak(text: string, opts: { rate?: number; pitch?: number; onEnd?: () => void; onStop?: () => void } = {}): boolean {
  if (!text || !supported) return false;
  // 語音清單晚到、又沒觸發 voiceschanged：念之前再讀一次
  if (!state.voices.length) refreshVoices();
  stopped();
  const { onEnd, onStop } = opts;
  onStopped = onStop;
  const ended = () => {
    if (onStopped === onStop) onStopped = undefined;
    onEnd?.();
  };
  const rate = opts.rate ?? (settingsStore.get().slow ? 0.6 : 0.9);
  const chunks = speechChunks(speechFor(text));
  // 前一句念完才念下一句；被取消的那一句不會呼叫 onEnd（見 utter），後面的就停在那裡
  const sayFrom = (i: number): boolean => utter(chunks[i], rate, i < chunks.length - 1 ? () => void sayFrom(i + 1) : ended, opts.pitch);
  try {
    return sayFrom(0);
  } catch {
    onStopped = undefined;
    return false;
  }
}

export function stopSpeaking() {
  if (!supported) return;
  current = null;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
  stopped();
}
