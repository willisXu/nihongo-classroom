// 備份：匯出、匯入（覆蓋）、壞掉的檔案不會清掉資料
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activityStore, exportBackup, importBackup, kanaDaysStore, kanaStore, lastExportStore, lessonStore, missStore, peekBackup, preImportStore,
  resetAllProgress, settingsStore, srsStore, undoImport, updateSettings,
} from '../src/state';

const card = { due: 1_800_000_000_000, ivl: 3, ease: 2.5, reps: 2, lapses: 0, step: -1, last: 1_790_000_000_000 };

afterEach(() => resetAllProgress());

describe('備份', () => {
  it('匯出再匯入，紀錄完全一樣', () => {
    kanaStore.set({ 'h:あ': { c: 3, w: 1, s: 2, t: 5 } });
    srsStore.set({ cards: { 'n5-0001': card }, days: { '2026-10-13': { reviews: 2, fresh: 1, rev: 1, forgot: 0 } } });
    kanaDaysStore.set({ '2026-10-13': { h: 1, k: 0 } });
    const text = exportBackup();
    resetAllProgress();
    expect(importBackup(text)).toBe(9);
    expect(kanaStore.get()).toEqual({ 'h:あ': { c: 3, w: 1, s: 2, t: 5 } });
    expect(srsStore.get().cards['n5-0001']).toEqual(card);
    expect(kanaDaysStore.get()).toEqual({ '2026-10-13': { h: 1, k: 0 } });
  });

  it('檔案裡有一類資料格式不對：什麼都不改，也不會顯示成功', () => {
    srsStore.set({ cards: { 'n5-0001': card }, days: {} });
    const bad = JSON.stringify({ app: 'nihongo-classroom', version: 1, data: { 'nk.kana': {}, 'nk.srs': null } });
    expect(() => importBackup(bad)).toThrow(/沒有匯入任何東西/);
    expect(srsStore.get().cards['n5-0001']).toEqual(card);
  });

  it('比較新版的網站匯出的備份不匯入', () => {
    srsStore.set({ cards: { 'n5-0001': card }, days: {} });
    expect(() => importBackup(JSON.stringify({ app: 'nihongo-classroom', version: 2, data: { 'nk.srs': {} } }))).toThrow(/新版/);
    expect(srsStore.get().cards['n5-0001']).toEqual(card);
  });

  it('比較舊的備份沒有的項目（錯題本、假名曲線）會清空，不和原本的紀錄混在一起', () => {
    missStore.set({ 'n5-0002': { n: 2, t: 1, ok: 0 } });
    kanaDaysStore.set({ '2026-10-12': { h: 3, k: 0 } });
    const old = JSON.stringify({ app: 'nihongo-classroom', version: 1, data: { 'nk.kana': {}, 'nk.srs': { cards: { 'n5-0001': card }, days: {} } } });
    expect(importBackup(old)).toBe(2);
    expect(missStore.get()).toEqual({});
    expect(kanaDaysStore.get()).toEqual({});
    expect(srsStore.get().cards['n5-0001']).toEqual(card);
  });

  it('卡片缺了到期時間就不收（不會被排到十年後）；缺了學習階段的複習卡當成已畢業', () => {
    const { due: _due, ...noDue } = card;
    const { step: _step, ...noStep } = card;
    importBackup(JSON.stringify({ app: 'nihongo-classroom', version: 1, data: { 'nk.srs': { cards: { a: noDue, b: noStep }, days: { 'not-a-day': { reviews: 1 }, '2026-10-13': { reviews: 1 } } } } }));
    expect(srsStore.get().cards.a).toBeUndefined();
    expect(srsStore.get().cards.b.step).toBe(-1);
    expect(Object.keys(srsStore.get().days)).toEqual(['2026-10-13']);
  });

  it('一類紀錄都沒有的檔案不匯入（不會把現有紀錄清光還說成功）', () => {
    srsStore.set({ cards: { 'n5-0001': card }, days: {} });
    expect(() => importBackup(JSON.stringify({ app: 'nihongo-classroom', version: 1, data: {} }))).toThrow(/沒有任何學習紀錄/);
    expect(() => peekBackup(JSON.stringify({ app: 'nihongo-classroom', version: 1, data: { other: 1 } }))).toThrow(/沒有任何學習紀錄/);
    expect(srsStore.get().cards['n5-0001']).toEqual(card);
  });

  it('匯入前先看內容：匯出時間、課程／假名／單字／天數，和目前的紀錄對照', () => {
    lessonStore.set({ done: { 1: 1 }, hw: {} });
    kanaStore.set({ 'h:あ': { c: 3, w: 0, s: 3, t: 5 }, 'h:い': { c: 1, w: 0, s: 1, t: 5 } });
    activityStore.set({ '2026-10-12': { kana: 3 }, '2026-10-13': { review: 2 } });
    const old = exportBackup();
    srsStore.set({ cards: { 'n5-0001': card, 'n5-0002': { ...card, reps: 0 } }, days: {} });
    kanaStore.set({ 'h:あ': { c: 3, w: 0, s: 3, t: 5 }, 'h:い': { c: 3, w: 0, s: 3, t: 6 } });
    lessonStore.set({ done: { 1: 1, 2: 2 }, hw: {} });
    const p = peekBackup(old);
    expect(p.exportedAt).toBeGreaterThan(Date.now() - 60_000);
    expect(p.backup).toEqual({ lessons: 1, kana: 1, words: 0, days: 2 });
    expect(p.current).toEqual({ lessons: 2, kana: 2, words: 1, days: 2 });
    // 很舊的備份沒有匯出時間
    expect(peekBackup(JSON.stringify({ app: 'nihongo-classroom', version: 1, data: { 'nk.kana': {} } })).exportedAt).toBeNull();
  });

  it('匯入錯了可以復原；匯入後從現在起算多久沒備份', () => {
    srsStore.set({ cards: { 'n5-0001': card }, days: {} });
    lessonStore.set({ done: { 1: 1, 2: 2 }, hw: {} });
    lastExportStore.set(123);
    const empty = JSON.stringify({ app: 'nihongo-classroom', version: 1, data: { 'nk.kana': {} } });
    importBackup(empty);
    expect(srsStore.get().cards).toEqual({});
    expect(lessonStore.get().done).toEqual({});
    expect(lastExportStore.get()).toBeGreaterThan(Date.now() - 60_000);
    expect(preImportStore.get()).not.toBeNull();
    undoImport();
    expect(srsStore.get().cards['n5-0001']).toEqual(card);
    expect(lessonStore.get().done).toEqual({ 1: 1, 2: 2 });
    expect(lastExportStore.get()).toBe(123);
    expect(preImportStore.get()).toBeNull();
    expect(() => undoImport()).toThrow(/沒有匯入前的紀錄/);
  });

  it('以前另外存的「自動發音：關」，沒有其他設定時也沿用；改過之後舊的那一份拿掉', async () => {
    vi.resetModules();
    const saved: Record<string, string> = { 'nk.autoplay': 'false' };
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => saved[k] ?? null,
      setItem: (k: string, v: string) => {
        saved[k] = v;
      },
      removeItem: (k: string) => {
        delete saved[k];
      },
    });
    try {
      const st = await import('../src/state');
      expect(st.settingsStore.get().autoplay).toBe(false);
      st.updateSettings({ autoplay: true });
      expect(saved['nk.autoplay']).toBeUndefined();
      expect(JSON.parse(saved['nk.settings']).autoplay).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it('全部清除時，匯入前留的那一份也清掉', () => {
    importBackup(JSON.stringify({ app: 'nihongo-classroom', version: 1, data: { 'nk.kana': {} } }));
    expect(preImportStore.get()).not.toBeNull();
    resetAllProgress();
    expect(preImportStore.get()).toBeNull();
  });

  it('「自動發音」放在設定裡，跟著備份走', () => {
    updateSettings({ autoplay: false });
    const text = exportBackup();
    updateSettings({ autoplay: true });
    importBackup(text);
    expect(settingsStore.get().autoplay).toBe(false);
    updateSettings({ autoplay: true });
  });

  it('不是備份檔', () => {
    expect(() => importBackup('{')).toThrow(/JSON/);
    expect(() => importBackup(JSON.stringify({ app: 'other', data: {} }))).toThrow(/不是日文自學教室的備份/);
  });
});
