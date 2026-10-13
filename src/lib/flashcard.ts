/**
 * 單字卡（複習、錯題本的加強練習）共用的小工具。
 */

/**
 * 翻面後把答案捲進畫面。
 * 手機上評分按鈕固定在畫面下方（.flash-actions 是 sticky），只捲按鈕的話答案會被按鈕蓋住：
 * 這時把「意思」捲到按鈕上面。按鈕不固定時（電腦），照舊把按鈕捲進畫面。
 */
export function revealAnswer(answer: Element | null, actions: Element | null) {
  if (!answer || !actions) return;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth';
  if (getComputedStyle(actions).position === 'sticky') {
    const over = answer.getBoundingClientRect().bottom - (actions.getBoundingClientRect().top - 12);
    if (over > 0) window.scrollBy({ top: over, behavior });
  } else {
    actions.scrollIntoView({ block: 'nearest', behavior });
  }
}

/** 剛按的按鈕被換掉或停用（例如翻面、評分、作答後），焦點掉回 body：這時要幫忙把焦點放到下一個該按的地方 */
export function focusLost(): boolean {
  const el = document.activeElement;
  return !el || el === document.body || !el.isConnected || (el as HTMLButtonElement).disabled === true;
}
