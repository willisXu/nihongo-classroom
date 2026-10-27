import type { Deck, DeckId } from '../types';

/**
 * 只載入一副牌組（牌組頁用）：全部 7 副牌組加起來約 140 kB（壓縮後），瀏覽一副只要下載那一副。
 * 複習、錯題本要跨牌組找同一個字，還是用 index.ts 的 DECKS（全部載入）。
 * 新增牌組時這裡也要加一行（tests/vocab.test.ts 會檢查和 DECK_META 一致）。
 */
export const DECK_LOADERS: Record<DeckId, () => Promise<Deck>> = {
  n5: () => import('./n5').then((m) => m.n5),
  n4: () => import('./n4').then((m) => m.n4),
  n4plus: () => import('./n4plus').then((m) => m.n4plus),
  travel: () => import('./travel').then((m) => m.travel),
  business: () => import('./business').then((m) => m.business),
  anime: () => import('./anime').then((m) => m.anime),
  course: () => import('./course').then((m) => m.course),
};

const cache = new Map<string, Promise<Deck | undefined>>();

/** 載入一副牌組；沒有這副牌組時得到 undefined。同一副只下載一次（React 的 use() 需要同一個 Promise） */
export function loadDeck(id: string): Promise<Deck | undefined> {
  let p = cache.get(id);
  if (!p) {
    const load = Object.hasOwn(DECK_LOADERS, id) ? DECK_LOADERS[id as DeckId] : undefined;
    p = load ? load() : Promise.resolve(undefined);
    cache.set(id, p);
    const known = p as Promise<Deck | undefined> & { status?: string; value?: Deck; reason?: unknown };
    // 載完就標上結果：React 的 use() 看到 status 就直接用，回到看過的牌組不會閃一下「載入中」
    p.then(
      (v) => Object.assign(known, { status: 'fulfilled', value: v }),
      (e) => {
        Object.assign(known, { status: 'rejected', reason: e });
        // 下載失敗（例如離線又沒有快取）：下次再試，不要一直拿到同一個失敗
        cache.delete(id);
      },
    );
  }
  return p;
}
