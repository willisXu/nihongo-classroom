/** 上一次跳轉還在對齊的話先停掉，不然兩次跳轉會搶著對齊 */
let current: AbortController | null = null;

/** 跳完以後看多久（毫秒）：畫面外的段落排版、字型載入，大多在這段時間內完成 */
const WATCH_MS = 1500;

/**
 * 跳到頁面的某一段（照 scroll-margin-top 對齊畫面上方），焦點放到 focusEl（鍵盤和讀屏軟體從那裡接著讀）。
 * 課文目錄、課程列表、模擬考的跳轉都用這個。
 *
 * 長頁面畫面外的段落先不排版（content-visibility: auto，先用預估的高度），所以：
 * - 不平滑捲動：平滑捲動一開始就用預估高度算好終點，捲的途中段落排出真正的高度，會停在差好幾千 px 的地方。
 * - 直接跳過去以後，旁邊的段落排出真正的高度。通常瀏覽器會讓目標留在原位（scroll anchoring），
 *   但目標在頁尾、捲不到最上面時（例如模擬考的「看成績」）會被往下推：接下來一小段時間，
 *   目標因為版面改變而移動就再對齊一次；使用者自己捲了就不管。
 */
export function jumpToElement(el: HTMLElement, focusEl: HTMLElement | null = el) {
  current?.abort();
  const ac = new AbortController();
  current = ac;
  el.scrollIntoView({ block: 'start' });
  focusEl?.focus({ preventScroll: true });

  const start = performance.now();
  let lastTop = el.getBoundingClientRect().top;
  let lastY = window.scrollY;
  const check = () => {
    if (ac.signal.aborted) return;
    if (!el.isConnected || performance.now() - start > WATCH_MS) {
      ac.abort();
      return;
    }
    const top = el.getBoundingClientRect().top;
    if (Math.abs(top - lastTop) > 1) {
      // 頁面捲動過（不是版面推動）：使用者自己捲了，不再對齊
      if (Math.abs(window.scrollY - lastY) > 1) {
        ac.abort();
        return;
      }
      el.scrollIntoView({ block: 'start' });
    }
    lastTop = el.getBoundingClientRect().top;
    lastY = window.scrollY;
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}
