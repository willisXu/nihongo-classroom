// 備份：匯出、匯入（覆蓋）、壞掉的檔案不會清掉資料
import { afterEach, describe, expect, it } from 'vitest';
import { exportBackup, importBackup, kanaDaysStore, kanaStore, missStore, resetAllProgress, srsStore } from '../src/state';

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

  it('不是備份檔', () => {
    expect(() => importBackup('{')).toThrow(/JSON/);
    expect(() => importBackup(JSON.stringify({ app: 'other', data: {} }))).toThrow(/不是日文自學教室的備份/);
  });
});
