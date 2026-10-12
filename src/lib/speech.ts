/**
 * 日文發音：使用瀏覽器內建的語音合成（Web Speech API）。
 * Windows 的 Edge／Chrome、macOS 與 iOS 的 Safari 通常都有日文語音；
 * 沒有時頁面會顯示提示，請使用者在系統設定加入日文語音。
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
}

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
let state: SpeechState = { supported, ready: !supported, voices: [], hasJapanese: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const PREFERRED = /nanami|keita|kyoko|o-ren|otoya|google|haruka|ayumi|sayaka|ichiro/i;

function refresh() {
  if (!supported) return;
  let all: SpeechSynthesisVoice[] = [];
  try {
    all = window.speechSynthesis.getVoices() || [];
  } catch {
    all = [];
  }
  const ja = all.filter((v) => /^ja([-_]|$)/i.test(v.lang || ''));
  state = { supported, ready: all.length > 0 || state.ready, voices: ja, hasJapanese: ja.length > 0 };
  emit();
}

let started = false;
export function initSpeech() {
  if (started || !supported) return;
  started = true;
  refresh();
  try {
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
  } catch {
    /* 舊瀏覽器 */
  }
  // 有些瀏覽器不會觸發 voiceschanged，稍後再查一次
  window.setTimeout(() => {
    refresh();
    if (!state.ready) {
      state = { ...state, ready: true };
      emit();
    }
  }, 2500);
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

function pickVoice(): SpeechSynthesisVoice | undefined {
  const { voiceURI } = settingsStore.get();
  if (voiceURI) {
    const chosen = state.voices.find((v) => v.voiceURI === voiceURI);
    if (chosen) return chosen;
  }
  return state.voices.find((v) => PREFERRED.test(v.name)) ?? state.voices[0];
}

/** 念出日文。回傳 false 表示這台裝置不能發音。 */
export function speak(text: string, opts: { rate?: number } = {}): boolean {
  if (!text || !supported) return false;
  try {
    const ss = window.speechSynthesis;
    if (ss.speaking || ss.pending) ss.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = opts.rate ?? (settingsStore.get().slow ? 0.6 : 0.9);
    ss.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking() {
  if (!supported) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}
