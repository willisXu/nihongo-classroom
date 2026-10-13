import { useCallback, useSyncExternalStore } from 'react';

/** CSS 媒體查詢現在成不成立（例如是不是窄螢幕）；視窗大小改變時跟著更新 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof matchMedia !== 'function') return () => {};
      const mq = matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof matchMedia === 'function' && matchMedia(query).matches,
    () => false,
  );
}
