import type { Lesson } from '../types';

/**
 * 課文：每一課一個檔案（lesson1.ts、lesson2.ts…，各自匯出 lesson），打開那一課才下載。
 * N5 的課文有很多例句和漢字，全部包在一起的話，打開任何一課都要下載全部；
 * 字型也是照檔案分組的（scripts/nk-fonts.mjs），一課一個檔，打開一課只下載那一課用到的字。
 * 摘要（課名、範圍…）在 meta.ts，列表頁和首頁只需要那個。
 */
const files = import.meta.glob<Lesson>('./lesson*.ts', { import: 'lesson' });

const cache = new Map<number, Promise<Lesson | undefined>>();

/** 載入一課的課文；沒有這一課時得到 undefined。同一課只下載一次（React 的 use() 需要同一個 Promise） */
export function loadLesson(id: number): Promise<Lesson | undefined> {
  let p = cache.get(id);
  if (!p) {
    const load = Number.isInteger(id) ? files[`./lesson${id}.ts`] : undefined;
    p = load ? load() : Promise.resolve(undefined);
    cache.set(id, p);
    const known = p as Promise<Lesson | undefined> & { status?: string; value?: Lesson; reason?: unknown };
    // 載完就標上結果：React 的 use() 看到 status 就直接用，換課時（先預載過）不會閃一下「載入中」
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

/** 先下載下一課（在課文頁看到一半時呼叫，按「下一課」就不用等） */
export function preloadLesson(id: number) {
  void loadLesson(id).catch(() => undefined);
}
